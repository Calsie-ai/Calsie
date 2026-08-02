create unique index if not exists job_fetch_runs_one_active_apify_uidx
  on public.job_fetch_runs ((1))
  where provider = 'apify'
    and status in ('started', 'running', 'collecting');

create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

create or replace function app_private.dispatch_apify_nsw_job_pipeline()
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, vault, extensions
as $$
declare
  request_id bigint;
  service_key text;
  cron_secret text;
  local_date date := (now() at time zone 'Australia/Sydney')::date;
  local_hour integer := extract(hour from now() at time zone 'Australia/Sydney');
  active_run record;
  candidate record;
  endpoint text;
  request_body jsonb;
begin
  -- The job runs every two minutes, but performs work only during the local
  -- morning window. This keeps 06:00 stable across Sydney daylight saving.
  if local_hour < 6 or local_hour >= 12 then
    return null;
  end if;

  select decrypted_secret into service_key
  from vault.decrypted_secrets
  where name = 'applix_service_role_key'
  limit 1;

  select decrypted_secret into cron_secret
  from vault.decrypted_secrets
  where name = 'applix_cron_secret'
  limit 1;

  if coalesce(service_key, '') = '' or coalesce(cron_secret, '') = '' then
    raise exception 'Missing Applix cron credentials';
  end if;

  select id, source, status
  into active_run
  from public.job_fetch_runs
  where provider = 'apify'
    and status in ('started', 'running', 'collecting')
  order by started_at
  limit 1;

  if found then
    endpoint := case active_run.source
      when 'apify_indeed_disability' then 'apify-disability-jobs-nsw'
      when 'apify_indeed_childcare' then 'apify-childcare-jobs-nsw'
      when 'apify_indeed_aged_care' then 'apify-aged-care-jobs-nsw'
      else null
    end;
    if endpoint is null then
      return null;
    end if;
    request_body := jsonb_build_object(
      'action', 'collect',
      'fetch_run_id', active_run.id,
      'scheduled_run', true
    );
  else
    with categories(sequence_no, source, endpoint, batch_key) as (
      values
        (1, 'apify_indeed_disability', 'apify-disability-jobs-nsw', 'apify_daily:disability:' || local_date::text),
        (2, 'apify_indeed_childcare', 'apify-childcare-jobs-nsw', 'apify_daily:childcare:' || local_date::text),
        (3, 'apify_indeed_aged_care', 'apify-aged-care-jobs-nsw', 'apify_daily:aged_care:' || local_date::text)
    )
    select c.sequence_no, c.source, c.endpoint, c.batch_key,
           r.status, coalesce((r.metadata->>'start_attempts')::integer, 0) as attempts
    into candidate
    from categories c
    left join public.job_fetch_runs r on r.batch_key = c.batch_key
    where r.id is null
       or r.status not in ('completed')
    order by c.sequence_no
    limit 1;

    if not found then
      return null;
    end if;

    -- After three terminal start/run failures, leave that category visible as
    -- failed and allow the following category to proceed on the next tick.
    if candidate.status = 'failed' and candidate.attempts >= 3 then
      with categories(sequence_no, source, endpoint, batch_key) as (
        values
          (1, 'apify_indeed_disability', 'apify-disability-jobs-nsw', 'apify_daily:disability:' || local_date::text),
          (2, 'apify_indeed_childcare', 'apify-childcare-jobs-nsw', 'apify_daily:childcare:' || local_date::text),
          (3, 'apify_indeed_aged_care', 'apify-aged-care-jobs-nsw', 'apify_daily:aged_care:' || local_date::text)
      )
      select c.sequence_no, c.source, c.endpoint, c.batch_key,
             r.status, coalesce((r.metadata->>'start_attempts')::integer, 0) as attempts
      into candidate
      from categories c
      left join public.job_fetch_runs r on r.batch_key = c.batch_key
      where (r.id is null or r.status <> 'completed')
        and not (r.status = 'failed' and coalesce((r.metadata->>'start_attempts')::integer, 0) >= 3)
      order by c.sequence_no
      limit 1;
      if not found then return null; end if;
    end if;

    endpoint := candidate.endpoint;
    request_body := jsonb_build_object('action', 'start', 'scheduled_run', true);
  end if;

  select net.http_post(
    url := 'https://bnshgtrqbfuphhhdgccs.supabase.co/functions/v1/' || endpoint,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key,
      'apikey', service_key,
      'x-applix-cron-secret', cron_secret
    ),
    body := request_body,
    timeout_milliseconds := 60000
  ) into request_id;

  return request_id;
end;
$$;

revoke all on function app_private.dispatch_apify_nsw_job_pipeline() from public, anon, authenticated;

select cron.unschedule(jobid)
from cron.job
where jobname = 'applix-apify-nsw-job-pipeline';

select cron.schedule(
  'applix-apify-nsw-job-pipeline',
  '*/2 * * * *',
  'select app_private.dispatch_apify_nsw_job_pipeline();'
);

-- Retire the Outscraper scheduler without rewriting historical migrations.
select cron.unschedule(jobid)
from cron.job
where jobname = 'applix-daily-job-fetch';
