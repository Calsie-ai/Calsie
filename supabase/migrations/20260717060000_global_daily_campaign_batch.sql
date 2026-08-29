create unique index if not exists job_fetch_runs_batch_key_uidx
  on public.job_fetch_runs(batch_key)
  where batch_key is not null;

create unique index if not exists orchestrator_runs_campaign_date_type_uidx
  on public.orchestrator_runs(campaign_id, run_date, run_type);

create or replace function public.claim_global_daily_campaign_batch(
  p_run_date date,
  p_batch_size integer default 25
)
returns table(run_id uuid, campaign_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $func$
begin
  return query
  with eligible_campaigns as (
    select c.id as campaign_id
    from public.campaigns c
    where c.status in ('active', 'launched', 'scheduled')
      and coalesce((c.outreach->>'active')::boolean, true) = true
      and coalesce((c.outreach->>'scheduled')::boolean, true) = true
      and not exists (
        select 1
        from public.orchestrator_runs r
        where r.campaign_id = c.id
          and r.run_date = p_run_date
          and r.run_type = 'global_daily_catalogue'
      )
    order by c.created_at, c.id
    limit greatest(1, least(coalesce(p_batch_size, 25), 100))
  ), inserted as (
    insert into public.orchestrator_runs (
      campaign_id,
      run_date,
      run_type,
      trigger,
      status,
      current_stage,
      started_at,
      heartbeat_at,
      counters,
      stage_results
    )
    select
      e.campaign_id,
      p_run_date,
      'global_daily_catalogue',
      'scheduled_global_daily',
      'running',
      'checking_catalogue',
      now(),
      now(),
      '{}'::jsonb,
      '{"mode":"shared_global_catalogue"}'::jsonb
    from eligible_campaigns e
    on conflict (campaign_id, run_date, run_type) do nothing
    returning id, orchestrator_runs.campaign_id
  )
  select inserted.id, inserted.campaign_id from inserted;
end;
$func$;

revoke all on function public.claim_global_daily_campaign_batch(date, integer)
  from public, anon, authenticated;

grant execute on function public.claim_global_daily_campaign_batch(date, integer)
  to service_role;