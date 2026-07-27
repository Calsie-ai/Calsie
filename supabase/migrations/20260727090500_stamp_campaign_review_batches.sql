begin;

create or replace function public.stamp_campaign_review_batch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_run_date date;
  v_start_date date;
  v_campaign_days integer;
begin
  if new.selected_for_campaign is distinct from true then
    return new;
  end if;

  -- Batch identity is immutable after first assignment.
  if old.batch_date is not null and old.campaign_day is not null then
    new.batch_date := old.batch_date;
    new.campaign_day := old.campaign_day;
    return new;
  end if;

  select r.run_date
    into v_run_date
  from public.orchestrator_runs r
  where r.id = new.orchestrator_run_id
    and r.campaign_id = new.campaign_id;

  select
    coalesce(
      ((c.outreach ->> 'started_at')::timestamptz at time zone 'Australia/Sydney')::date,
      (c.created_at at time zone 'Australia/Sydney')::date
    ),
    greatest(1, least(90, coalesce((c.outreach ->> 'campaign_days')::integer, 30)))
    into v_start_date, v_campaign_days
  from public.campaigns c
  where c.id = new.campaign_id;

  new.batch_date := coalesce(
    new.batch_date,
    v_run_date,
    (coalesce(new.selected_at, now()) at time zone 'Australia/Sydney')::date
  );
  new.campaign_day := coalesce(
    new.campaign_day,
    greatest(1, least(v_campaign_days, 1 + (new.batch_date - v_start_date)))
  );

  return new;
end;
$function$;

revoke all on function public.stamp_campaign_review_batch() from public, anon, authenticated;

drop trigger if exists stamp_campaign_job_match_batch on public.campaign_job_matches;
create trigger stamp_campaign_job_match_batch
before insert or update of selected_for_campaign, orchestrator_run_id, selected_at
on public.campaign_job_matches
for each row
when (new.selected_for_campaign = true)
execute function public.stamp_campaign_review_batch();

drop trigger if exists stamp_campaign_company_candidate_batch on public.campaign_company_candidates;
create trigger stamp_campaign_company_candidate_batch
before insert or update of selected_for_campaign, orchestrator_run_id, selected_at
on public.campaign_company_candidates
for each row
when (new.selected_for_campaign = true)
execute function public.stamp_campaign_review_batch();

commit;
