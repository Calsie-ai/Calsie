-- NEW jobs project only (ibgmpamvkvjzdxirzxzr). Apply explicitly; never to the old project.
create schema if not exists calsie_private;
revoke all on schema calsie_private from public, anon, authenticated;
grant usage on schema calsie_private to service_role;

create table calsie_private.gmail_connections (
  id uuid not null default gen_random_uuid() unique,
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null check (status in ('connected','disconnected')),
  gmail_email text,
  google_subject text,
  token_ciphertext text,
  scope text,
  consent_attempt_id uuid,
  connected_at timestamptz,
  disconnected_at timestamptz,
  revocation_status text check (revocation_status in ('pending','confirmed','unknown')),
  disconnect_trace_id uuid,
  updated_at timestamptz not null default now(),
  check (status <> 'connected' or (token_ciphertext is not null and gmail_email is not null)),
  check (status <> 'disconnected' or token_ciphertext is null)
);
create table calsie_private.gmail_oauth_attempts (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  nonce_hash text not null unique,
  status text not null check (status in ('pending','processing','completed','failed','cancelled','expired')),
  consent jsonb not null,
  error_code text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  claimed_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  cancelled_at timestamptz,
  expired_at timestamptz
);
create index gmail_attempts_user_status on calsie_private.gmail_oauth_attempts(user_id,status);
create table calsie_private.gmail_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  gmail_connection_id uuid,
  attempt_id uuid,
  trace_id uuid not null,
  event text not null,
  error_code text,
  message text not null,
  created_at timestamptz not null default now()
);
create index gmail_events_user_time on calsie_private.gmail_events(user_id,created_at);
alter table calsie_private.gmail_connections enable row level security;
alter table calsie_private.gmail_oauth_attempts enable row level security;
alter table calsie_private.gmail_events enable row level security;
revoke all on all tables in schema calsie_private from public, anon, authenticated;
-- No client policies or grants: credentials and consent history remain server-only.

create or replace function public.calsie_gmail_transition(p_action text, p_user_id uuid, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_attempt uuid;
  v_connection calsie_private.gmail_connections%rowtype;
  v_changed uuid;
  v_trace uuid;
  v_count integer;
begin
  if p_user_id is null then raise exception 'user required'; end if;
  -- The only executable role is service_role; every call derives user_id from verified NEW auth.
  if p_action = 'session_active' then
    return jsonb_build_object('ok', exists(select 1 from auth.sessions where id = (p_data->>'session_id')::uuid and user_id = p_user_id and (not_after is null or not_after > now())));
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 62419));
  -- Recovery is explicit and logged; pending/claimed records never remain active after TTL.
  for v_changed in update calsie_private.gmail_oauth_attempts set status='expired', expired_at=now(), error_code='GMAIL_STATE_EXPIRED'
    where user_id=p_user_id and status in ('pending','processing') and expires_at <= now() returning id
  loop
    insert into calsie_private.gmail_events(user_id,attempt_id,trace_id,event,error_code,message)
      values(p_user_id,v_changed,v_changed,'attempt_expired','GMAIL_STATE_EXPIRED','Authorization attempt timed out. Start a new connection.');
  end loop;

  if p_action = 'status' then
    select * into v_connection from calsie_private.gmail_connections where user_id=p_user_id;
    return jsonb_build_object('connected', coalesce(v_connection.status='connected',false), 'gmail_email',case when v_connection.status='connected' then v_connection.gmail_email end,
      'connected_at',v_connection.connected_at,'revocation_status',v_connection.revocation_status);
  elsif p_action = 'begin' then
    select * into v_connection from calsie_private.gmail_connections where user_id=p_user_id;
    if v_connection.revocation_status='pending' then
      if v_connection.updated_at > now()-interval '2 minutes' then
        return jsonb_build_object('ok',false,'error_code','GMAIL_REVOCATION_PENDING');
      end if;
      update calsie_private.gmail_connections set revocation_status='unknown',updated_at=now() where user_id=p_user_id;
      insert into calsie_private.gmail_events(user_id,gmail_connection_id,trace_id,event,error_code,message)
        values(p_user_id,v_connection.id,v_connection.disconnect_trace_id,'revocation_timed_out','GMAIL_REVOCATION_UNKNOWN','Revocation timed out; verify Calsie access in Google Account settings before reconnecting.');
    end if;
    v_attempt := (p_data->>'attempt_id')::uuid;
    if p_data->'consent'->>'privacy_accepted' is distinct from 'true' or p_data->'consent'->>'dedicated_email_confirmed' is distinct from 'true'
      or p_data->'consent'->>'policy_version' is null
      or coalesce(p_data->>'nonce_hash','') !~ '^[a-f0-9]{64}$'
      or nullif(p_data->>'expires_at','') is null
      or (p_data->>'expires_at')::timestamptz <= now()
      or (p_data->>'expires_at')::timestamptz > now()+interval '11 minutes' then raise exception 'invalid attempt'; end if;
    for v_changed in update calsie_private.gmail_oauth_attempts set status='cancelled',cancelled_at=now(),error_code='GMAIL_SUPERSEDED'
      where user_id=p_user_id and status in ('pending','processing') returning id
    loop
      insert into calsie_private.gmail_events(user_id,attempt_id,trace_id,event,error_code,message)
        values(p_user_id,v_changed,v_changed,'attempt_cancelled','GMAIL_SUPERSEDED','A newer authorization attempt replaced this attempt.');
    end loop;
    insert into calsie_private.gmail_oauth_attempts(id,user_id,nonce_hash,status,consent,expires_at)
      values(v_attempt,p_user_id,p_data->>'nonce_hash','pending',p_data->'consent',(p_data->>'expires_at')::timestamptz);
    insert into calsie_private.gmail_events(user_id,attempt_id,trace_id,event,message)
      values(p_user_id,v_attempt,v_attempt,'authorization_started','Both consent confirmations recorded; waiting for Google.');
    return jsonb_build_object('ok',true);
  elsif p_action = 'claim' then
    v_attempt := (p_data->>'attempt_id')::uuid;
    update calsie_private.gmail_oauth_attempts set status='processing',claimed_at=now()
      where id=v_attempt and user_id=p_user_id and nonce_hash=p_data->>'nonce_hash' and status='pending' and expires_at>now();
    get diagnostics v_count = row_count;
    if v_count = 0 then return jsonb_build_object('ok',false); end if;
    insert into calsie_private.gmail_events(user_id,attempt_id,trace_id,event,message)
      values(p_user_id,v_attempt,v_attempt,'authorization_claimed','Browser state and initiating login validated; exchanging Google code.');
    return jsonb_build_object('ok',true);
  elsif p_action = 'complete' then
    v_attempt := (p_data->>'attempt_id')::uuid;
    if nullif(p_data->>'token_ciphertext','') is null or nullif(p_data->>'gmail_email','') is null
      or not ('https://www.googleapis.com/auth/gmail.send' = any(string_to_array(p_data->>'scope',' '))) then raise exception 'invalid connection'; end if;
    update calsie_private.gmail_oauth_attempts set status='completed',completed_at=now()
      where id=v_attempt and user_id=p_user_id and status='processing' and expires_at>now();
    get diagnostics v_count = row_count;
    if v_count = 0 then return jsonb_build_object('ok',false); end if;
    insert into calsie_private.gmail_connections(user_id,status,gmail_email,google_subject,token_ciphertext,scope,consent_attempt_id,connected_at)
      values(p_user_id,'connected',p_data->>'gmail_email',p_data->>'google_subject',p_data->>'token_ciphertext',p_data->>'scope',v_attempt,now())
      on conflict(user_id) do update set status='connected',gmail_email=excluded.gmail_email,google_subject=excluded.google_subject,
        token_ciphertext=excluded.token_ciphertext,scope=excluded.scope,consent_attempt_id=excluded.consent_attempt_id,connected_at=now(),
        disconnected_at=null,revocation_status=null,disconnect_trace_id=null,updated_at=now()
      returning * into v_connection;
    insert into calsie_private.gmail_events(user_id,gmail_connection_id,attempt_id,trace_id,event,message)
      values(p_user_id,v_connection.id,v_attempt,v_attempt,'connection_confirmed','Google confirmed send permission and offline access; encrypted credentials saved.');
    return jsonb_build_object('ok',true);
  elsif p_action = 'fail' then
    v_attempt := (p_data->>'attempt_id')::uuid;
    update calsie_private.gmail_oauth_attempts set status='failed',failed_at=now(),error_code=p_data->>'error_code'
      where id=v_attempt and user_id=p_user_id and status='processing';
    get diagnostics v_count = row_count;
    if v_count > 0 then
      insert into calsie_private.gmail_events(user_id,attempt_id,trace_id,event,error_code,message)
        values(p_user_id,v_attempt,v_attempt,'authorization_failed',p_data->>'error_code','Authorization was not completed. Start a new connection.');
    end if;
    return jsonb_build_object('ok',true);
  elsif p_action = 'disconnect' then
    select * into v_connection from calsie_private.gmail_connections where user_id=p_user_id;
    v_trace := (p_data->>'trace_id')::uuid;
    for v_changed in update calsie_private.gmail_oauth_attempts set status='cancelled',cancelled_at=now(),error_code='GMAIL_DISCONNECTED'
      where user_id=p_user_id and status in ('pending','processing') returning id
    loop
      insert into calsie_private.gmail_events(user_id,attempt_id,trace_id,event,error_code,message)
        values(p_user_id,v_changed,v_trace,'attempt_cancelled','GMAIL_DISCONNECTED','Disconnect cancelled this authorization attempt.');
    end loop;
    select * into v_connection from calsie_private.gmail_connections where user_id=p_user_id;
    -- Repeated disconnect must never replace an in-flight revocation's trace or
    -- falsely confirm revocation because the first request already cleared tokens.
    if v_connection.status='disconnected' and v_connection.revocation_status in ('pending','unknown') then
      return jsonb_build_object('ok',true,'revocation_pending',v_connection.revocation_status='pending','revocation_unknown',v_connection.revocation_status='unknown');
    end if;
    update calsie_private.gmail_connections set status='disconnected',token_ciphertext=null,gmail_email=null,google_subject=null,scope=null,
      disconnected_at=now(),revocation_status=case when token_ciphertext is null then 'confirmed' else 'pending' end,
      disconnect_trace_id=v_trace,updated_at=now() where user_id=p_user_id;
    insert into calsie_private.gmail_events(user_id,gmail_connection_id,trace_id,event,message)
      values(p_user_id,v_connection.id,v_trace,'connection_disconnected','Local credentials cleared and pending authorizations cancelled.');
    return jsonb_build_object('ok',true,'token_ciphertext',v_connection.token_ciphertext);
  elsif p_action = 'revocation_result' then
    v_trace := (p_data->>'trace_id')::uuid;
    update calsie_private.gmail_connections set revocation_status=case when (p_data->>'confirmed')::boolean then 'confirmed' else 'unknown' end,updated_at=now()
      where user_id=p_user_id and disconnect_trace_id=v_trace and status='disconnected';
    insert into calsie_private.gmail_events(user_id,trace_id,event,error_code,message)
      values(p_user_id,v_trace,'revocation_result',case when (p_data->>'confirmed')::boolean then null else 'GMAIL_REVOCATION_UNKNOWN' end,
        case when (p_data->>'confirmed')::boolean then 'Google revocation confirmed, or no local credential existed.' else 'Local credentials cleared; Google revocation could not be confirmed. Remove access in Google Account settings.' end);
    return jsonb_build_object('ok',true);
  end if;
  raise exception 'unknown gmail transition';
end $$;
revoke all on function public.calsie_gmail_transition(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.calsie_gmail_transition(text,uuid,jsonb) to service_role;
comment on function public.calsie_gmail_transition(text,uuid,jsonb) is 'Server-only NEW-project Gmail state machine. Never expose tokens or this function to browsers.';
