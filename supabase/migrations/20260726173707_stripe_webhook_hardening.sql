begin;

create table if not exists public.applix_purchases (
  id uuid primary key default gen_random_uuid(),
  purchase_sequence bigint generated always as identity unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  pending_intent_id text not null,
  stripe_checkout_session_id text not null unique,
  stripe_checkout_created_at timestamptz not null,
  stripe_payment_intent_id text,
  stripe_customer_id text,
  template_id uuid not null references public.campaign_templates(id) on delete restrict,
  postcode text not null,
  expected_amount integer not null,
  actual_amount integer,
  currency text not null,
  payment_status text not null default 'unpaid',
  purchase_status text not null default 'checkout_started',
  refund_status text not null default 'none',
  amount_refunded integer not null default 0,
  stripe_mode text not null default 'payment',
  livemode boolean not null,
  latest_stripe_event_id text,
  latest_stripe_event_created_at timestamptz,
  latest_event_precedence smallint not null default 0,
  terminal_state_at timestamptz,
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint applix_purchases_pending_intent_check
    check (pending_intent_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,191}$'),
  constraint applix_purchases_session_check
    check (stripe_checkout_session_id ~ '^cs_(test|live)_[A-Za-z0-9]+$'),
  constraint applix_purchases_postcode_check
    check (postcode ~ '^[0-9]{4}$'),
  constraint applix_purchases_amounts_check
    check (
      expected_amount >= 0
      and (actual_amount is null or actual_amount >= 0)
      and amount_refunded >= 0
      and (actual_amount is null or amount_refunded <= actual_amount)
    ),
  constraint applix_purchases_currency_check
    check (currency ~ '^[a-z]{3}$'),
  constraint applix_purchases_payment_status_check
    check (payment_status in ('unpaid', 'paid', 'no_payment_required')),
  constraint applix_purchases_status_check
    check (purchase_status in (
      'checkout_started',
      'pending',
      'payment_failed',
      'paid',
      'partially_refunded',
      'fully_refunded',
      'expired'
    )),
  constraint applix_purchases_refund_status_check
    check (refund_status in ('none', 'partial', 'full')),
  constraint applix_purchases_mode_check
    check (stripe_mode = 'payment'),
  constraint applix_purchases_precedence_check
    check (latest_event_precedence between 0 and 50)
);

create unique index if not exists applix_purchases_payment_intent_key
  on public.applix_purchases (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

create index if not exists applix_purchases_user_sequence_idx
  on public.applix_purchases (
    user_id,
    stripe_checkout_created_at desc,
    purchase_sequence desc
  );

create index if not exists applix_purchases_status_idx
  on public.applix_purchases (purchase_status, updated_at);

create table if not exists public.stripe_webhook_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null unique,
  event_type text not null,
  stripe_created_at timestamptz not null,
  livemode boolean not null,
  stripe_object_id text,
  checkout_session_id text,
  payment_intent_id text,
  charge_id text,
  refund_id text,
  user_id uuid,
  pending_intent_id text,
  template_id uuid,
  processing_status text not null default 'received',
  processing_attempt_count integer not null default 0,
  received_at timestamptz not null default now(),
  processing_started_at timestamptz,
  processed_at timestamptz,
  next_retry_at timestamptz,
  failure_code text,
  safe_failure_message text,
  payload_hash text not null,
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stripe_webhook_events_event_id_check
    check (stripe_event_id ~ '^evt_[A-Za-z0-9]+$'),
  constraint stripe_webhook_events_attempt_check
    check (processing_attempt_count between 0 and 8),
  constraint stripe_webhook_events_payload_hash_check
    check (payload_hash ~ '^[a-f0-9]{64}$'),
  constraint stripe_webhook_events_status_check
    check (processing_status in (
      'received',
      'processing',
      'processed',
      'ignored',
      'stale',
      'retryable_failed',
      'permanently_rejected'
    )),
  constraint stripe_webhook_events_failure_code_check
    check (
      failure_code is null
      or failure_code in (
        'invalid_object',
        'purchase_not_found',
        'ownership_mismatch',
        'pending_intent_mismatch',
        'template_mismatch',
        'postcode_mismatch',
        'amount_mismatch',
        'currency_mismatch',
        'mode_mismatch',
        'payment_intent_mismatch',
        'stale_event',
        'unsupported_event_type',
        'stripe_retrieval_failed',
        'temporary_database_failure',
        'maximum_attempts_exceeded'
      )
    )
);

create index if not exists stripe_webhook_events_reconciliation_idx
  on public.stripe_webhook_events (next_retry_at, received_at)
  where processing_status = 'retryable_failed';

create index if not exists stripe_webhook_events_stuck_idx
  on public.stripe_webhook_events (processing_started_at)
  where processing_status = 'processing';

create index if not exists stripe_webhook_events_session_idx
  on public.stripe_webhook_events (checkout_session_id, stripe_created_at);

alter table public.applix_subscriptions
  add column if not exists current_purchase_id uuid references public.applix_purchases(id) on delete set null,
  add column if not exists current_purchase_sequence bigint not null default 0,
  add column if not exists current_checkout_created_at timestamptz,
  add column if not exists latest_stripe_event_id text,
  add column if not exists latest_stripe_event_created_at timestamptz,
  add column if not exists latest_event_precedence smallint not null default 0;

create index if not exists applix_subscriptions_current_purchase_idx
  on public.applix_subscriptions (current_purchase_id)
  where current_purchase_id is not null;

insert into public.applix_purchases (
  user_id,
  pending_intent_id,
  stripe_checkout_session_id,
  stripe_checkout_created_at,
  stripe_payment_intent_id,
  stripe_customer_id,
  template_id,
  postcode,
  expected_amount,
  actual_amount,
  currency,
  payment_status,
  purchase_status,
  refund_status,
  stripe_mode,
  livemode,
  safe_metadata,
  created_at,
  updated_at
)
select
  subscriptions.user_id,
  subscriptions.checkout_metadata->>'pending_intent_id',
  subscriptions.stripe_checkout_session_id,
  subscriptions.created_at,
  subscriptions.stripe_payment_intent_id,
  subscriptions.stripe_customer_id,
  subscriptions.template_id,
  subscriptions.postcode,
  subscriptions.price_amount,
  case when subscriptions.status = 'active' then subscriptions.price_amount else null end,
  lower(subscriptions.currency),
  case when subscriptions.status = 'active' then 'paid' else 'unpaid' end,
  case
    when subscriptions.status = 'active' then 'paid'
    when subscriptions.status = 'expired' then 'expired'
    when subscriptions.status in ('failed', 'payment_failed') then 'payment_failed'
    else 'checkout_started'
  end,
  'none',
  'payment',
  subscriptions.stripe_checkout_session_id like 'cs_live_%',
  jsonb_strip_nulls(jsonb_build_object(
    'migration_source', 'applix_subscriptions',
    'plan_name', subscriptions.plan_name,
    'return_panel', subscriptions.checkout_metadata->>'return_panel',
    'return_path', subscriptions.checkout_metadata->>'return_path',
    'originating_path', subscriptions.checkout_metadata->>'originating_path'
  )),
  subscriptions.created_at,
  subscriptions.updated_at
from public.applix_subscriptions subscriptions
where subscriptions.user_id is not null
  and subscriptions.stripe_checkout_session_id is not null
  and subscriptions.template_id is not null
  and subscriptions.postcode is not null
  and subscriptions.checkout_metadata->>'pending_intent_id'
      ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,191}$'
on conflict (stripe_checkout_session_id) do nothing;

update public.applix_subscriptions subscriptions
set
  current_purchase_id = purchases.id,
  current_purchase_sequence = purchases.purchase_sequence,
  current_checkout_created_at = purchases.stripe_checkout_created_at,
  latest_event_precedence = purchases.latest_event_precedence
from public.applix_purchases purchases
where purchases.stripe_checkout_session_id = subscriptions.stripe_checkout_session_id
  and subscriptions.current_purchase_id is null;

alter table public.applix_purchases enable row level security;
alter table public.stripe_webhook_events enable row level security;

create or replace function public.applix_preserve_purchase_identity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.id <> old.id
    or new.purchase_sequence <> old.purchase_sequence
    or new.user_id <> old.user_id
    or new.pending_intent_id <> old.pending_intent_id
    or new.stripe_checkout_session_id <> old.stripe_checkout_session_id
    or new.stripe_checkout_created_at <> old.stripe_checkout_created_at
    or new.stripe_customer_id is distinct from old.stripe_customer_id
    or new.template_id <> old.template_id
    or new.postcode <> old.postcode
    or new.expected_amount <> old.expected_amount
    or new.currency <> old.currency
    or new.stripe_mode <> old.stripe_mode
    or new.livemode <> old.livemode
    or new.created_at <> old.created_at
    or (
      old.stripe_payment_intent_id is not null
      and new.stripe_payment_intent_id is distinct from old.stripe_payment_intent_id
    )
  then
    raise exception using
      errcode = '23514',
      message = 'purchase identity is immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists applix_purchases_preserve_identity
  on public.applix_purchases;
create trigger applix_purchases_preserve_identity
before update on public.applix_purchases
for each row execute function public.applix_preserve_purchase_identity();

create or replace function public.applix_preserve_stripe_event_identity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.id <> old.id
    or new.stripe_event_id <> old.stripe_event_id
    or new.event_type <> old.event_type
    or new.stripe_created_at <> old.stripe_created_at
    or new.livemode <> old.livemode
    or new.payload_hash <> old.payload_hash
    or new.received_at <> old.received_at
    or new.created_at <> old.created_at
  then
    raise exception using
      errcode = '23514',
      message = 'stripe event identity is immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists stripe_webhook_events_preserve_identity
  on public.stripe_webhook_events;
create trigger stripe_webhook_events_preserve_identity
before update on public.stripe_webhook_events
for each row execute function public.applix_preserve_stripe_event_identity();

revoke all on table public.applix_purchases from anon, authenticated;
revoke all on table public.stripe_webhook_events from anon, authenticated;
revoke all on sequence public.applix_purchases_purchase_sequence_seq from anon, authenticated;
revoke delete, truncate on table public.applix_purchases from service_role;
revoke delete, truncate on table public.stripe_webhook_events from service_role;
grant select, insert, update on table public.applix_purchases to service_role;
grant select, insert, update on table public.stripe_webhook_events to service_role;
grant usage, select on sequence public.applix_purchases_purchase_sequence_seq to service_role;

create or replace function public.applix_register_checkout_purchase(
  p_user_id uuid,
  p_email text,
  p_customer_id text,
  p_checkout_session_id text,
  p_stripe_checkout_created_at timestamptz,
  p_pending_intent_id text,
  p_template_id uuid,
  p_postcode text,
  p_expected_amount integer,
  p_currency text,
  p_plan_name text,
  p_livemode boolean,
  p_safe_metadata jsonb default '{}'::jsonb
)
returns table (
  purchase_id uuid,
  purchase_sequence bigint,
  registered boolean
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_purchase public.applix_purchases%rowtype;
  v_inserted boolean := false;
begin
  insert into public.applix_purchases (
    user_id,
    pending_intent_id,
    stripe_checkout_session_id,
    stripe_checkout_created_at,
    stripe_customer_id,
    template_id,
    postcode,
    expected_amount,
    currency,
    stripe_mode,
    livemode,
    safe_metadata
  )
  values (
    p_user_id,
    p_pending_intent_id,
    p_checkout_session_id,
    p_stripe_checkout_created_at,
    p_customer_id,
    p_template_id,
    p_postcode,
    p_expected_amount,
    lower(p_currency),
    'payment',
    p_livemode,
    coalesce(p_safe_metadata, '{}'::jsonb)
  )
  on conflict (stripe_checkout_session_id) do nothing
  returning * into v_purchase;

  if found then
    v_inserted := true;
  else
    select *
      into v_purchase
      from public.applix_purchases
     where stripe_checkout_session_id = p_checkout_session_id
     for update;
  end if;

  if v_purchase.id is null
    or v_purchase.user_id <> p_user_id
    or v_purchase.pending_intent_id <> p_pending_intent_id
    or v_purchase.stripe_checkout_created_at <> p_stripe_checkout_created_at
    or v_purchase.template_id <> p_template_id
    or v_purchase.postcode <> p_postcode
    or v_purchase.expected_amount <> p_expected_amount
    or v_purchase.currency <> lower(p_currency)
    or v_purchase.livemode <> p_livemode
  then
    raise exception using
      errcode = '23514',
      message = 'checkout purchase identity mismatch';
  end if;

  insert into public.applix_subscriptions (
    user_id,
    email,
    stripe_customer_id,
    stripe_subscription_id,
    stripe_checkout_session_id,
    stripe_payment_intent_id,
    status,
    plan_name,
    price_amount,
    currency,
    current_period_end,
    template_id,
    postcode,
    checkout_metadata,
    current_purchase_id,
    current_purchase_sequence,
    current_checkout_created_at,
    latest_event_precedence,
    updated_at
  )
  values (
    p_user_id,
    p_email,
    p_customer_id,
    null,
    p_checkout_session_id,
    null,
    'checkout_started',
    p_plan_name,
    p_expected_amount,
    lower(p_currency),
    null,
    p_template_id,
    p_postcode,
    coalesce(p_safe_metadata, '{}'::jsonb),
    v_purchase.id,
    v_purchase.purchase_sequence,
    v_purchase.stripe_checkout_created_at,
    0,
    now()
  )
  on conflict (user_id) do update
  set
    email = excluded.email,
    stripe_customer_id = excluded.stripe_customer_id,
    stripe_subscription_id = null,
    stripe_checkout_session_id = excluded.stripe_checkout_session_id,
    stripe_payment_intent_id = null,
    status = 'checkout_started',
    plan_name = excluded.plan_name,
    price_amount = excluded.price_amount,
    currency = excluded.currency,
    current_period_end = null,
    template_id = excluded.template_id,
    postcode = excluded.postcode,
    checkout_metadata = excluded.checkout_metadata,
    current_purchase_id = excluded.current_purchase_id,
    current_purchase_sequence = excluded.current_purchase_sequence,
    current_checkout_created_at = excluded.current_checkout_created_at,
    latest_stripe_event_id = null,
    latest_stripe_event_created_at = null,
    latest_event_precedence = 0,
    updated_at = now()
  where public.applix_subscriptions.current_checkout_created_at is null
     or public.applix_subscriptions.current_checkout_created_at
        < excluded.current_checkout_created_at
     or (
       public.applix_subscriptions.current_checkout_created_at
         = excluded.current_checkout_created_at
       and public.applix_subscriptions.current_purchase_sequence
         < excluded.current_purchase_sequence
     );

  return query
    select v_purchase.id, v_purchase.purchase_sequence, v_inserted;
end;
$$;

create or replace function public.applix_register_stripe_event(
  p_stripe_event_id text,
  p_event_type text,
  p_stripe_created_at timestamptz,
  p_livemode boolean,
  p_stripe_object_id text,
  p_checkout_session_id text,
  p_payment_intent_id text,
  p_charge_id text,
  p_refund_id text,
  p_payload_hash text,
  p_safe_metadata jsonb default '{}'::jsonb
)
returns table (
  claimed boolean,
  event_status text,
  attempt_count integer
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_status text;
  v_attempt_count integer;
begin
  insert into public.stripe_webhook_events (
    stripe_event_id,
    event_type,
    stripe_created_at,
    livemode,
    stripe_object_id,
    checkout_session_id,
    payment_intent_id,
    charge_id,
    refund_id,
    processing_status,
    processing_attempt_count,
    processing_started_at,
    payload_hash,
    safe_metadata
  )
  values (
    p_stripe_event_id,
    p_event_type,
    p_stripe_created_at,
    p_livemode,
    p_stripe_object_id,
    p_checkout_session_id,
    p_payment_intent_id,
    p_charge_id,
    p_refund_id,
    'processing',
    1,
    now(),
    p_payload_hash,
    coalesce(p_safe_metadata, '{}'::jsonb)
  )
  on conflict (stripe_event_id) do nothing
  returning id, processing_status, processing_attempt_count
    into v_id, v_status, v_attempt_count;

  if v_id is not null then
    return query select true, v_status, v_attempt_count;
    return;
  end if;

  update public.stripe_webhook_events
     set processing_status = 'processing',
         processing_attempt_count = processing_attempt_count + 1,
         processing_started_at = now(),
         processed_at = null,
         next_retry_at = null,
         failure_code = null,
         safe_failure_message = null,
         updated_at = now()
   where stripe_event_id = p_stripe_event_id
     and event_type = p_event_type
     and livemode = p_livemode
     and payload_hash = p_payload_hash
     and processing_attempt_count < 8
     and (
       (
         processing_status = 'retryable_failed'
         and coalesce(next_retry_at, updated_at) <= now()
       )
       or (
         processing_status = 'processing'
         and processing_started_at <= now() - interval '5 minutes'
       )
     )
  returning id, processing_status, processing_attempt_count
    into v_id, v_status, v_attempt_count;

  if v_id is not null then
    return query select true, v_status, v_attempt_count;
    return;
  end if;

  select processing_status, processing_attempt_count
    into v_status, v_attempt_count
    from public.stripe_webhook_events
   where stripe_event_id = p_stripe_event_id;

  return query
    select false, coalesce(v_status, 'received'), coalesce(v_attempt_count, 0);
end;
$$;

create or replace function public.applix_finish_stripe_event(
  p_stripe_event_id text,
  p_processing_status text,
  p_failure_code text default null,
  p_safe_failure_message text default null,
  p_next_retry_at timestamptz default null
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_status text;
begin
  if p_processing_status not in (
    'processed',
    'ignored',
    'stale',
    'retryable_failed',
    'permanently_rejected'
  ) then
    raise exception using errcode = '22023', message = 'invalid processing status';
  end if;

  update public.stripe_webhook_events
     set processing_status = p_processing_status,
         failure_code = p_failure_code,
         safe_failure_message = left(p_safe_failure_message, 240),
         next_retry_at = case
           when p_processing_status = 'retryable_failed' then p_next_retry_at
           else null
         end,
         processed_at = case
           when p_processing_status = 'retryable_failed' then null
           else now()
         end,
         updated_at = now()
   where stripe_event_id = p_stripe_event_id
     and processing_status = 'processing'
  returning processing_status into v_status;

  return coalesce(
    v_status,
    (select processing_status
       from public.stripe_webhook_events
      where stripe_event_id = p_stripe_event_id)
  );
end;
$$;

create or replace function public.applix_finalize_stripe_event(
  p_stripe_event_id text,
  p_checkout_session_id text,
  p_payment_intent_id text,
  p_charge_id text,
  p_refund_id text,
  p_user_id uuid,
  p_pending_intent_id text,
  p_template_id uuid,
  p_postcode text,
  p_expected_amount integer,
  p_actual_amount integer,
  p_currency text,
  p_payment_status text,
  p_purchase_status text,
  p_refund_status text,
  p_amount_refunded integer,
  p_event_precedence smallint,
  p_stripe_created_at timestamptz,
  p_safe_metadata jsonb default '{}'::jsonb
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_event public.stripe_webhook_events%rowtype;
  v_purchase public.applix_purchases%rowtype;
  v_failure_code text;
  v_projection_status text;
  v_should_apply boolean := false;
begin
  select *
    into v_event
    from public.stripe_webhook_events
   where stripe_event_id = p_stripe_event_id
   for update;

  if v_event.id is null then
    raise exception using errcode = 'P0002', message = 'stripe event not registered';
  end if;

  if v_event.processing_status <> 'processing' then
    return v_event.processing_status;
  end if;

  select *
    into v_purchase
    from public.applix_purchases
   where stripe_checkout_session_id = p_checkout_session_id
   for update;

  if v_purchase.id is null then
    return public.applix_finish_stripe_event(
      p_stripe_event_id,
      'retryable_failed',
      'purchase_not_found',
      'Persisted checkout is not available yet.',
      now() + interval '1 minute'
    );
  end if;

  v_failure_code := case
    when v_event.livemode <> v_purchase.livemode then 'mode_mismatch'
    when v_purchase.user_id <> p_user_id then 'ownership_mismatch'
    when v_purchase.pending_intent_id <> p_pending_intent_id then 'pending_intent_mismatch'
    when v_purchase.template_id <> p_template_id then 'template_mismatch'
    when v_purchase.postcode <> p_postcode then 'postcode_mismatch'
    when v_purchase.expected_amount <> p_expected_amount then 'amount_mismatch'
    when v_purchase.currency <> lower(p_currency) then 'currency_mismatch'
    when v_purchase.stripe_payment_intent_id is not null
      and p_payment_intent_id is not null
      and v_purchase.stripe_payment_intent_id <> p_payment_intent_id
      then 'payment_intent_mismatch'
    when p_actual_amount < 0
      or p_amount_refunded < 0
      or p_amount_refunded > p_actual_amount
      then 'amount_mismatch'
    when p_payment_status not in ('unpaid', 'paid', 'no_payment_required')
      or p_purchase_status not in (
        'pending',
        'payment_failed',
        'paid',
        'partially_refunded',
        'fully_refunded',
        'expired'
      )
      or p_refund_status not in ('none', 'partial', 'full')
      or p_event_precedence not in (10, 20, 30, 40, 50)
      then 'invalid_object'
    when p_purchase_status in ('paid', 'partially_refunded', 'fully_refunded')
      and p_payment_status = 'paid'
      and p_payment_intent_id is null
      then 'payment_intent_mismatch'
    when p_payment_status = 'no_payment_required'
      and p_payment_intent_id is not null
      then 'payment_intent_mismatch'
    else null
  end;

  if v_failure_code is not null then
    update public.stripe_webhook_events
       set processing_status = 'permanently_rejected',
           failure_code = v_failure_code,
           safe_failure_message = 'Stripe object does not match the persisted purchase.',
           checkout_session_id = p_checkout_session_id,
           payment_intent_id = p_payment_intent_id,
           charge_id = p_charge_id,
           refund_id = p_refund_id,
           user_id = p_user_id,
           pending_intent_id = p_pending_intent_id,
           template_id = p_template_id,
           processed_at = now(),
           updated_at = now()
     where id = v_event.id;
    return 'permanently_rejected';
  end if;

  v_should_apply :=
    p_event_precedence > v_purchase.latest_event_precedence
    or (
      p_event_precedence = v_purchase.latest_event_precedence
      and p_purchase_status in ('partially_refunded', 'fully_refunded')
      and p_amount_refunded > v_purchase.amount_refunded
    );

  if not v_should_apply then
    update public.stripe_webhook_events
       set processing_status = 'stale',
           failure_code = 'stale_event',
           safe_failure_message = 'A newer or equivalent purchase state already exists.',
           checkout_session_id = p_checkout_session_id,
           payment_intent_id = p_payment_intent_id,
           charge_id = p_charge_id,
           refund_id = p_refund_id,
           user_id = p_user_id,
           pending_intent_id = p_pending_intent_id,
           template_id = p_template_id,
           processed_at = now(),
           updated_at = now()
     where id = v_event.id;
    return 'stale';
  end if;

  update public.applix_purchases
     set stripe_payment_intent_id = coalesce(
           stripe_payment_intent_id,
           p_payment_intent_id
         ),
         actual_amount = p_actual_amount,
         payment_status = p_payment_status,
         purchase_status = p_purchase_status,
         refund_status = p_refund_status,
         amount_refunded = p_amount_refunded,
         latest_stripe_event_id = p_stripe_event_id,
         latest_stripe_event_created_at = p_stripe_created_at,
         latest_event_precedence = p_event_precedence,
         terminal_state_at = case
           when p_purchase_status in (
             'payment_failed',
             'paid',
             'fully_refunded',
             'expired'
           ) then now()
           else terminal_state_at
         end,
         safe_metadata = safe_metadata || coalesce(p_safe_metadata, '{}'::jsonb),
         updated_at = now()
   where id = v_purchase.id;

  v_projection_status := case p_purchase_status
    when 'paid' then 'active'
    when 'partially_refunded' then 'partially_refunded'
    when 'fully_refunded' then 'refunded'
    when 'payment_failed' then 'payment_failed'
    when 'expired' then 'expired'
    else 'checkout_completed'
  end;

  update public.applix_subscriptions
     set stripe_payment_intent_id = coalesce(
           stripe_payment_intent_id,
           p_payment_intent_id
         ),
         status = v_projection_status,
         price_amount = p_actual_amount,
         currency = lower(p_currency),
         latest_stripe_event_id = p_stripe_event_id,
         latest_stripe_event_created_at = p_stripe_created_at,
         latest_event_precedence = p_event_precedence,
         checkout_metadata = checkout_metadata || coalesce(p_safe_metadata, '{}'::jsonb),
         updated_at = now()
   where user_id = v_purchase.user_id
     and current_purchase_id = v_purchase.id
     and current_purchase_sequence = v_purchase.purchase_sequence;

  update public.stripe_webhook_events
     set processing_status = 'processed',
         failure_code = null,
         safe_failure_message = null,
         checkout_session_id = p_checkout_session_id,
         payment_intent_id = p_payment_intent_id,
         charge_id = p_charge_id,
         refund_id = p_refund_id,
         user_id = p_user_id,
         pending_intent_id = p_pending_intent_id,
         template_id = p_template_id,
         processed_at = now(),
         next_retry_at = null,
         safe_metadata = safe_metadata || coalesce(p_safe_metadata, '{}'::jsonb),
         updated_at = now()
   where id = v_event.id;

  return 'processed';
end;
$$;

create or replace function public.applix_claim_stripe_events(
  p_batch_size integer default 10,
  p_stale_after_seconds integer default 300
)
returns setof public.stripe_webhook_events
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return query
  with candidates as (
    select events.id
      from public.stripe_webhook_events events
     where events.processing_attempt_count < 8
       and (
         (
           events.processing_status = 'retryable_failed'
           and coalesce(events.next_retry_at, events.updated_at) <= now()
         )
         or (
           events.processing_status = 'processing'
           and events.processing_started_at
               <= now() - make_interval(secs => greatest(p_stale_after_seconds, 60))
         )
       )
     order by coalesce(events.next_retry_at, events.processing_started_at, events.received_at)
     for update skip locked
     limit least(greatest(p_batch_size, 1), 25)
  )
  update public.stripe_webhook_events events
     set processing_status = 'processing',
         processing_attempt_count = events.processing_attempt_count + 1,
         processing_started_at = now(),
         processed_at = null,
         next_retry_at = null,
         failure_code = null,
         safe_failure_message = null,
         updated_at = now()
    from candidates
   where events.id = candidates.id
  returning events.*;
end;
$$;

create or replace function public.applix_reject_exhausted_stripe_events()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.stripe_webhook_events
     set processing_status = 'permanently_rejected',
         failure_code = 'maximum_attempts_exceeded',
         safe_failure_message = 'Automatic reconciliation attempts were exhausted.',
         processed_at = now(),
         next_retry_at = null,
         updated_at = now()
   where processing_status in ('retryable_failed', 'processing')
     and processing_attempt_count >= 8;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.applix_register_checkout_purchase(
  uuid, text, text, text, timestamptz, text, uuid, text, integer, text, text,
  boolean, jsonb
) from public, anon, authenticated;
revoke execute on function public.applix_register_stripe_event(
  text, text, timestamptz, boolean, text, text, text, text, text, text, jsonb
) from public, anon, authenticated;
revoke execute on function public.applix_finish_stripe_event(
  text, text, text, text, timestamptz
) from public, anon, authenticated;
revoke execute on function public.applix_finalize_stripe_event(
  text, text, text, text, text, uuid, text, uuid, text, integer, integer,
  text, text, text, text, integer, smallint, timestamptz, jsonb
) from public, anon, authenticated;
revoke execute on function public.applix_claim_stripe_events(
  integer, integer
) from public, anon, authenticated;
revoke execute on function public.applix_reject_exhausted_stripe_events()
  from public, anon, authenticated;
revoke execute on function public.applix_preserve_purchase_identity()
  from public, anon, authenticated;
revoke execute on function public.applix_preserve_stripe_event_identity()
  from public, anon, authenticated;

grant execute on function public.applix_register_checkout_purchase(
  uuid, text, text, text, timestamptz, text, uuid, text, integer, text, text,
  boolean, jsonb
) to service_role;
grant execute on function public.applix_register_stripe_event(
  text, text, timestamptz, boolean, text, text, text, text, text, text, jsonb
) to service_role;
grant execute on function public.applix_finish_stripe_event(
  text, text, text, text, timestamptz
) to service_role;
grant execute on function public.applix_finalize_stripe_event(
  text, text, text, text, text, uuid, text, uuid, text, integer, integer,
  text, text, text, text, integer, smallint, timestamptz, jsonb
) to service_role;
grant execute on function public.applix_claim_stripe_events(
  integer, integer
) to service_role;
grant execute on function public.applix_reject_exhausted_stripe_events()
  to service_role;

comment on table public.stripe_webhook_events is
  'Server-only Stripe event ledger. Stores selected non-sensitive fields, processing ownership and safe audit outcomes.';
comment on table public.applix_purchases is
  'Server-only immutable checkout identity with mutable, ordered state for one Stripe Checkout Session.';
comment on column public.applix_subscriptions.current_purchase_sequence is
  'Monotonic guard preventing older checkout events from replacing the latest per-user projection.';

commit;
