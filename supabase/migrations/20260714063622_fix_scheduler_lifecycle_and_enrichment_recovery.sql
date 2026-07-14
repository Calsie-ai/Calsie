-- Scheduler lifecycle repair.
--
-- Daily job fetching runs at 20:00 UTC. This is 06:00 in Sydney during
-- AEST (UTC+10) and 07:00 during AEDT (UTC+11).
--
-- Authentication is intentionally unchanged here. Both dispatchers reuse the
-- existing applix_service_role_key Vault secret and the current service-role
-- Authorization/apikey header pattern. Cron authentication standardisation is
-- reserved for the separate Step 3 change.

create or replace function public.dispatch_applix_daily_job_fetch()
returns bigint
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare
  request_id bigint;
  service_key text;
begin
  select decrypted_secret
  into service_key
  from vault.decrypted_secrets
  where name = 'applix_service_role_key'
  limit 1;

  if coalesce(service_key, '') = '' then
    raise exception 'Missing vault secret applix_service_role_key; daily job fetch was not dispatched';
  end if;

  select net.http_post(
    url := 'https://bnshgtrqbfuphhhdgccs.supabase.co/functions/v1/applix-daily-job-fetcher',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key,
      'apikey', service_key
    ),
    body := jsonb_build_object(
      'scheduled_run', true,
      'source', 'pg_cron_daily_job_fetch'
    )
  ) into request_id;

  return request_id;
end;
$$;

comment on function public.dispatch_applix_daily_job_fetch() is
  'Dispatches applix-daily-job-fetcher through pg_net and returns its traceable request ID.';

revoke all on function public.dispatch_applix_daily_job_fetch() from public, anon, authenticated;
grant execute on function public.dispatch_applix_daily_job_fetch() to postgres, service_role;

-- The drainer is the only authoritative global lease owner. It uses
-- queue_worker_leases through acquire_queue_worker_lease/release_queue_worker_lease.
-- Older lease tables and functions are retained for compatibility, but the
-- active trigger, compatibility dispatchers, and recovery cron no longer use
-- them.
create or replace function public.kick_company_enrichment_drain()
returns bigint
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare
  request_id bigint;
  service_key text;
  has_due_work boolean;
begin
  select exists (
    select 1
    from public.company_enrichment_queue
    where status = 'pending'
      and available_at <= now()
      and attempts < max_attempts
  ) into has_due_work;

  if not has_due_work then
    return null;
  end if;

  select decrypted_secret
  into service_key
  from vault.decrypted_secrets
  where name = 'applix_service_role_key'
  limit 1;

  if coalesce(service_key, '') = '' then
    raise exception 'Missing vault secret applix_service_role_key; company enrichment drainer was not dispatched';
  end if;

  select net.http_post(
    url := 'https://bnshgtrqbfuphhhdgccs.supabase.co/functions/v1/drain-company-enrichment-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key,
      'apikey', service_key
    ),
    body := jsonb_build_object('source', 'database_kick')
  ) into request_id;

  return request_id;
end;
$$;

comment on function public.kick_company_enrichment_drain() is
  'Starts the canonical company-enrichment drainer when due work exists and returns the pg_net request ID.';

-- Compatibility wrappers retain existing function signatures while routing all
-- active callers through the canonical drainer instead of directly to the
-- process-company-enrichment-queue worker.
create or replace function public.dispatch_company_enrichment_worker()
returns void
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
begin
  perform public.kick_company_enrichment_drain();
end;
$$;

create or replace function public.kick_company_enrichment_worker(
  p_reason text default 'queue_event'
)
returns jsonb
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare
  request_id bigint;
begin
  select public.kick_company_enrichment_drain() into request_id;

  if request_id is null then
    return jsonb_build_object(
      'started', false,
      'reason', 'no_due_work',
      'trigger_source', p_reason,
      'canonical_path', 'drain-company-enrichment-queue'
    );
  end if;

  return jsonb_build_object(
    'started', true,
    'reason', p_reason,
    'trigger_source', p_reason,
    'request_id', request_id,
    'canonical_path', 'drain-company-enrichment-queue'
  );
end;
$$;

create or replace function public.company_enrichment_queue_dispatch_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.company_enrichment_queue
    where status = 'pending'
      and available_at <= now()
      and attempts < max_attempts
  ) then
    begin
      perform public.kick_company_enrichment_drain();
    exception when others then
      -- Preserve the queue write but make missing configuration or dispatch
      -- failures visible in Postgres logs. The recovery cron will retry.
      raise warning 'Company enrichment event dispatch failed: %', sqlerrm;
    end;
  end if;

  return null;
end;
$$;

drop trigger if exists company_enrichment_queue_dispatch_after_insert
  on public.company_enrichment_queue;
drop trigger if exists company_enrichment_queue_dispatch_after_status_update
  on public.company_enrichment_queue;
drop trigger if exists company_enrichment_queue_event_kick
  on public.company_enrichment_queue;
drop trigger if exists company_enrichment_queue_event_trigger
  on public.company_enrichment_queue;

create trigger company_enrichment_queue_dispatch
after insert or update of status, available_at
on public.company_enrichment_queue
for each statement
execute function public.company_enrichment_queue_dispatch_trigger();

-- pg_cron rows are only changed through cron.unschedule/cron.schedule. Direct
-- updates to cron.job are intentionally avoided.
do $$
declare
  job record;
begin
  for job in
    select jobid
    from cron.job
    where jobname in (
      'applix-daily-job-fetch',
      'applix-company-enrichment-recovery',
      'company-enrichment-recovery-watchdog'
    )
  loop
    perform cron.unschedule(job.jobid);
  end loop;
end;
$$;

select cron.schedule(
  'applix-daily-job-fetch',
  '0 20 * * *',
  'select public.dispatch_applix_daily_job_fetch();'
);

select cron.schedule(
  'applix-company-enrichment-recovery',
  '*/5 * * * *',
  'select public.kick_company_enrichment_drain();'
);
