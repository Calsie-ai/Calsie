create or replace function public.claim_apify_template_campaign(p_run_date date)
returns table(run_id uuid, campaign_id uuid, pool_key text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_campaign record;
begin
  select c.id as campaign_id, l.pool_key
  into selected_campaign
  from public.campaigns c
  join public.template_job_pool_links l on l.template_id = c.template_id
  where c.status in ('active', 'launched', 'scheduled')
    and coalesce((c.outreach ->> 'active')::boolean, true) = true
    and not exists (
      select 1
      from public.orchestrator_runs r
      where r.campaign_id = c.id
        and r.run_date = p_run_date
        and r.run_type = 'apify_template_daily'
    )
  order by case l.pool_key
    when 'disability' then 1
    when 'childcare' then 2
    when 'aged_care' then 3
    else 4
  end, c.created_at, c.id
  for update of c skip locked
  limit 1;

  if not found then return; end if;

  insert into public.orchestrator_runs (
    campaign_id, run_date, run_type, trigger, status, current_stage,
    started_at, heartbeat_at, counters, stage_results
  ) values (
    selected_campaign.campaign_id, p_run_date, 'apify_template_daily',
    'scheduled', 'running', 'checking_catalogue', now(), now(),
    jsonb_build_object('job_pool', selected_campaign.pool_key), '{}'::jsonb
  )
  on conflict (campaign_id, run_date, run_type) do nothing
  returning id, orchestrator_runs.campaign_id
  into run_id, campaign_id;

  if run_id is null then return; end if;
  pool_key := selected_campaign.pool_key;
  return next;
end;
$$;

revoke all on function public.claim_apify_template_campaign(date)
from public, anon, authenticated;
grant execute on function public.claim_apify_template_campaign(date) to service_role;

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
  if local_hour < 6 or local_hour >= 12 then return null; end if;

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
    if endpoint is null then return null; end if;
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
    where r.id is null or r.status <> 'completed'
    order by c.sequence_no
    limit 1;

    if found and candidate.status = 'failed' and candidate.attempts >= 3 then
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
        and not (
          r.status = 'failed'
          and coalesce((r.metadata->>'start_attempts')::integer, 0) >= 3
        )
      order by c.sequence_no
      limit 1;
    end if;

    if found then
      endpoint := candidate.endpoint;
      request_body := jsonb_build_object('action', 'start', 'scheduled_run', true);
    else
      endpoint := 'applix-apify-campaign-matcher';
      request_body := jsonb_build_object(
        'run_date', local_date,
        'catalogue_scan_limit', 500
      );
    end if;
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

revoke all on function app_private.dispatch_apify_nsw_job_pipeline()
from public, anon, authenticated;
