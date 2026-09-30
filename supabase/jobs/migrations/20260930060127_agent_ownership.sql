-- Apply ONLY to the new project ibgmpamvkvjzdxirzxzr.
-- Re-establish the app's existing agent contract, without importing legacy data.
create table if not exists public.calsie_agents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('disability', 'aged_care', 'childcare')),
  name text not null,
  status text not null default 'draft',
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, category),
  unique (id, user_id, category)
);
alter table public.calsie_agents
  add column if not exists preferences jsonb not null default '{}'::jsonb,
  add column if not exists payment_status text not null default 'deferred',
  add column if not exists started_at timestamptz,
  add column if not exists paused_at timestamptz;
alter table public.calsie_agents alter column status set default 'draft';
alter table public.calsie_agents drop constraint if exists calsie_agents_status_check;
alter table public.calsie_agents add constraint calsie_agents_status_check
  check (status in ('draft', 'active', 'paused'));
alter table public.calsie_agents add constraint calsie_agents_payment_status_check
  check (payment_status = 'deferred');
alter table public.calsie_agents add constraint calsie_agents_preferences_check
  check (jsonb_typeof(preferences) = 'object');

alter table public.calsie_agents enable row level security;
revoke all on public.calsie_agents from public, anon, authenticated;
grant select on public.calsie_agents to authenticated;
grant insert (user_id, category, name, preferences) on public.calsie_agents to authenticated;
grant update (status) on public.calsie_agents to authenticated;
grant select on public.calsie_agents to service_role;
-- SELECT FOR SHARE in the decision guard also requires an UPDATE privilege.
grant update (status) on public.calsie_agents to service_role;
drop policy if exists "Read own Calsie agents" on public.calsie_agents;
drop policy if exists "Create own Calsie agents" on public.calsie_agents;
drop policy if exists "Update own Calsie agents" on public.calsie_agents;
create policy "Read own Calsie agents" on public.calsie_agents
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Create own Calsie agents" on public.calsie_agents
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Update own Calsie agents" on public.calsie_agents
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Clients cannot forge or rewrite lifecycle history.
create table public.calsie_agent_events (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.calsie_agents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('agent_chosen', 'campaign_started', 'campaign_paused')),
  previous_status text,
  next_status text not null,
  occurred_at timestamptz not null default now()
);
create index calsie_agent_events_owner_idx on public.calsie_agent_events(user_id, agent_id, occurred_at);
alter table public.calsie_agent_events enable row level security;
revoke all on public.calsie_agent_events from public, anon, authenticated;
grant select on public.calsie_agent_events to authenticated;
create policy "Read own agent events" on public.calsie_agent_events
  for select to authenticated using (user_id = (select auth.uid()));

create schema if not exists calsie_private;
revoke all on schema calsie_private from public, anon, authenticated;
create function calsie_private.record_agent_lifecycle()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or auth.uid() <> new.user_id then
    raise exception using errcode = '42501', message = 'agent_owner_required';
  end if;
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception using errcode = '23514', message = 'new_agent_must_be_draft';
    end if;
    insert into public.calsie_agent_events(agent_id, user_id, event_type, next_status)
      values (new.id, new.user_id, 'agent_chosen', new.status);
  elsif new.status is distinct from old.status then
    if not ((old.status in ('draft','paused') and new.status = 'active')
      or (old.status = 'active' and new.status = 'paused')) then
      raise exception using errcode = '23514', message = 'invalid_campaign_transition';
    end if;
    insert into public.calsie_agent_events(agent_id, user_id, event_type, previous_status, next_status)
      values (new.id, new.user_id, case when new.status = 'active' then 'campaign_started' else 'campaign_paused' end, old.status, new.status);
  end if;
  return new;
end;
$$;
revoke all on function calsie_private.record_agent_lifecycle() from public, anon, authenticated;
create trigger calsie_agents_lifecycle after insert or update on public.calsie_agents
  for each row execute function calsie_private.record_agent_lifecycle();

create function calsie_private.stamp_agent_status()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    new.updated_at := now();
    if new.status = 'active' then new.started_at := coalesce(old.started_at, now()); end if;
    if new.status = 'paused' then new.paused_at := now(); end if;
  end if;
  return new;
end;
$$;
revoke all on function calsie_private.stamp_agent_status() from public, anon, authenticated;
create trigger calsie_agents_status_timestamp before update on public.calsie_agents
  for each row execute function calsie_private.stamp_agent_status();

create function public.calsie_choose_agent(p_category text, p_location text default 'Australia')
returns setof public.calsie_agents language plpgsql security invoker set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_name text;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  v_name := case p_category when 'disability' then 'Disability Agent'
    when 'aged_care' then 'Aged Care Agent' when 'childcare' then 'Childcare Agent' end;
  if v_name is null then raise exception using errcode = '22023', message = 'invalid_agent_category'; end if;
  if length(coalesce(p_location, '')) > 200 then
    raise exception using errcode = '22023', message = 'invalid_agent_location';
  end if;
  -- A repeated selection returns the existing owned agent, preserving state/history.
  insert into public.calsie_agents (user_id, category, name, preferences)
    values (v_user_id, p_category, v_name,
      jsonb_build_object('location', coalesce(nullif(btrim(p_location), ''), 'Australia')))
    on conflict (user_id, category) do nothing;
  return query select * from public.calsie_agents where user_id = v_user_id and category = p_category;
end;
$$;
revoke all on function public.calsie_choose_agent(text, text) from public, anon;
grant execute on function public.calsie_choose_agent(text, text) to authenticated;

-- Do not delete or rewrite existing swipe history. Enforce ownership for new writes.
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.calsie_job_swipe_decisions'::regclass
    and conname = 'calsie_swipes_agent_fk') then
    alter table public.calsie_job_swipe_decisions add constraint calsie_swipes_agent_fk
      foreign key (agent_id, user_id, category) references public.calsie_agents(id, user_id, category)
      on delete cascade not valid;
  end if;
end $$;

-- Serialize decisions with pause updates: whichever commits first determines
-- whether this decision can be written. A stale browser cannot bypass pause.
create function calsie_private.guard_agent_decision()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_status text;
begin
  if auth.uid() is not null and auth.uid() <> new.user_id then
    raise exception using errcode = '42501', message = 'agent_owner_required';
  end if;
  select status into v_status from public.calsie_agents
    where id = new.agent_id and user_id = new.user_id and category = new.category
    for share;
  if v_status is distinct from 'active' then
    raise exception using errcode = '23514', message = 'campaign_not_active';
  end if;
  return new;
end;
$$;
revoke all on function calsie_private.guard_agent_decision() from public, anon, authenticated;
create trigger calsie_swipes_active_agent before insert on public.calsie_job_swipe_decisions
  for each row execute function calsie_private.guard_agent_decision();
