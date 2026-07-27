begin;

-- The deployed v3 orchestrator emits these two legitimate stages, but the
-- production constraint does not currently allow them.
alter table public.orchestrator_runs
  drop constraint if exists orchestrator_runs_stage_check;

alter table public.orchestrator_runs
  add constraint orchestrator_runs_stage_check check (
    current_stage = any (array[
      'queued'::text,
      'compiling_search_plan'::text,
      'checking_catalogue'::text,
      'calculating_shortage'::text,
      'fetching_jobs'::text,
      'fetch_attempt_1'::text,
      'fetch_attempt_2'::text,
      'fetch_attempt_3'::text,
      'storing_jobs'::text,
      'matching_jobs'::text,
      'judging_live_jobs'::text,
      'selecting_jobs'::text,
      'filling_company_opportunities'::text,
      'enrichment_queued'::text,
      'waiting_for_enrichment'::text,
      'generating_drafts'::text,
      'ready_for_review'::text,
      'completed'::text,
      'failed'::text
    ])
  );

-- Permanent batch identity. Nullable supports non-selected and historical rows.
alter table public.campaign_job_matches
  add column if not exists batch_date date,
  add column if not exists campaign_day integer;

alter table public.campaign_company_candidates
  add column if not exists batch_date date,
  add column if not exists campaign_day integer;

alter table public.campaign_job_matches
  drop constraint if exists campaign_job_matches_campaign_day_check;
alter table public.campaign_job_matches
  add constraint campaign_job_matches_campaign_day_check
  check (campaign_day is null or campaign_day between 1 and 90);

alter table public.campaign_company_candidates
  drop constraint if exists campaign_company_candidates_campaign_day_check;
alter table public.campaign_company_candidates
  add constraint campaign_company_candidates_campaign_day_check
  check (campaign_day is null or campaign_day between 1 and 90);

create index if not exists campaign_job_matches_campaign_batch_idx
  on public.campaign_job_matches (campaign_id, batch_date desc, campaign_day desc)
  where selected_for_campaign = true;

create index if not exists campaign_company_candidates_campaign_batch_idx
  on public.campaign_company_candidates (campaign_id, batch_date desc, campaign_day desc)
  where selected_for_campaign = true;

-- Backfill from the run that selected the row first; fall back to the preserved
-- selection timestamp. Campaign day is calculated in Australia/Sydney.
with resolved as (
  select
    m.id,
    coalesce(r.run_date, (m.selected_at at time zone 'Australia/Sydney')::date,
      (m.first_matched_at at time zone 'Australia/Sydney')::date,
      (m.created_at at time zone 'Australia/Sydney')::date) as resolved_date,
    greatest(1, least(90,
      1 + (
        coalesce(r.run_date, (m.selected_at at time zone 'Australia/Sydney')::date,
          (m.first_matched_at at time zone 'Australia/Sydney')::date,
          (m.created_at at time zone 'Australia/Sydney')::date)
        - coalesce(
            ((c.outreach ->> 'started_at')::timestamptz at time zone 'Australia/Sydney')::date,
            (c.created_at at time zone 'Australia/Sydney')::date
          )
      )
    ))::integer as resolved_day
  from public.campaign_job_matches m
  join public.campaigns c on c.id = m.campaign_id
  left join public.orchestrator_runs r on r.id = m.orchestrator_run_id
  where m.selected_for_campaign = true
)
update public.campaign_job_matches m
set batch_date = coalesce(m.batch_date, resolved.resolved_date),
    campaign_day = coalesce(m.campaign_day, resolved.resolved_day)
from resolved
where m.id = resolved.id
  and (m.batch_date is null or m.campaign_day is null);

with resolved as (
  select
    cc.id,
    coalesce(r.run_date, (cc.selected_at at time zone 'Australia/Sydney')::date,
      (cc.created_at at time zone 'Australia/Sydney')::date) as resolved_date,
    greatest(1, least(90,
      1 + (
        coalesce(r.run_date, (cc.selected_at at time zone 'Australia/Sydney')::date,
          (cc.created_at at time zone 'Australia/Sydney')::date)
        - coalesce(
            ((c.outreach ->> 'started_at')::timestamptz at time zone 'Australia/Sydney')::date,
            (c.created_at at time zone 'Australia/Sydney')::date
          )
      )
    ))::integer as resolved_day
  from public.campaign_company_candidates cc
  join public.campaigns c on c.id = cc.campaign_id
  left join public.orchestrator_runs r on r.id = cc.orchestrator_run_id
  where cc.selected_for_campaign = true
)
update public.campaign_company_candidates cc
set batch_date = coalesce(cc.batch_date, resolved.resolved_date),
    campaign_day = coalesce(cc.campaign_day, resolved.resolved_day)
from resolved
where cc.id = resolved.id
  and (cc.batch_date is null or cc.campaign_day is null);

-- Versioned RPC keeps the old RPC available for backward compatibility.
create or replace function public.get_review_opportunities_v2(
  p_campaign_id uuid default null,
  p_limit integer default 100,
  p_offset integer default 0,
  p_decision_status text default null,
  p_campaign_day integer default null
)
returns table(
  review_id uuid,
  opportunity_type text,
  id uuid,
  campaign_id uuid,
  title text,
  company text,
  location text,
  source text,
  apply_url text,
  extracted_email text,
  description text,
  status text,
  created_at timestamptz,
  selected_at timestamptz,
  reviewed_at timestamptz,
  batch_date date,
  campaign_day integer,
  ai_role_relevance_score integer,
  ai_reason text,
  service_categories text[],
  service_postcodes text[]
)
language sql
stable
security definer
set search_path = ''
as $function$
with job_rows as (
  select
    m.id as review_id,
    'live_job'::text as opportunity_type,
    j.id,
    m.campaign_id,
    j.title,
    j.company,
    j.location,
    j.source,
    coalesce(j.apply_url, j.canonical_apply_url) as apply_url,
    null::text as extracted_email,
    j.description,
    coalesce(m.user_decision, 'pending_review') as status,
    m.created_at,
    m.selected_at,
    m.reviewed_at,
    m.batch_date,
    m.campaign_day,
    m.ai_role_relevance_score,
    m.ai_reason,
    array[]::text[] as service_categories,
    array[]::text[] as service_postcodes
  from public.campaign_job_matches m
  join public.campaigns c on c.id = m.campaign_id
  join public.jobs j on j.id = m.job_id
  where c.user_id = auth.uid()
    and m.selected_for_campaign = true
    and (p_campaign_id is null or m.campaign_id = p_campaign_id)
    and (p_decision_status is null or coalesce(m.user_decision, 'pending_review') = p_decision_status)
    and (p_campaign_day is null or m.campaign_day = p_campaign_day)
), company_rows as (
  select
    cc.id as review_id,
    'direct_company'::text as opportunity_type,
    cc.contact_id as id,
    cc.campaign_id,
    case cc.pool_key
      when 'aged_care' then 'Direct aged care outreach'
      when 'childcare' then 'Direct childcare outreach'
      else 'Direct disability support outreach'
    end as title,
    coalesce(dp.company_name, ap.company_name, cp.company_name) as company,
    coalesce(cc.location_reason, 'Serves Greater Sydney') as location,
    case cc.pool_key
      when 'aged_care' then 'Aged care company pool'
      when 'childcare' then 'Childcare company pool'
      else 'Disability provider pool'
    end as source,
    coalesce(dp.company_website_url, ap.company_website_url, cp.company_website_url) as apply_url,
    null::text as extracted_email,
    coalesce(
      array_to_string(dp.ndis_service_categories, ', '),
      array_to_string(ap.aged_care_service_categories, ', '),
      array_to_string(cp.ndis_service_categories, ', '),
      'Verified company contact'
    ) as description,
    coalesce(cc.user_decision, 'pending_review') as status,
    cc.created_at,
    cc.selected_at,
    cc.reviewed_at,
    cc.batch_date,
    cc.campaign_day,
    cc.total_score as ai_role_relevance_score,
    cc.ai_reason,
    coalesce(dp.ndis_service_categories, ap.aged_care_service_categories, cp.ndis_service_categories, array[]::text[]) as service_categories,
    coalesce(dp.service_postcodes, ap.service_postcodes, cp.service_postcodes, array[]::text[]) as service_postcodes
  from public.campaign_company_candidates cc
  join public.campaigns c on c.id = cc.campaign_id
  left join public.disability_company_contacts_pool dp
    on cc.pool_key = 'disability' and dp.id = cc.contact_id
  left join public.aged_care_company_contacts_pool ap
    on cc.pool_key = 'aged_care' and ap.id = cc.contact_id
  left join public.childcare_company_contacts_pool cp
    on cc.pool_key = 'childcare' and cp.id = cc.contact_id
  where c.user_id = auth.uid()
    and cc.selected_for_campaign = true
    and (dp.id is not null or ap.id is not null or cp.id is not null)
    and (p_campaign_id is null or cc.campaign_id = p_campaign_id)
    and (p_decision_status is null or coalesce(cc.user_decision, 'pending_review') = p_decision_status)
    and (p_campaign_day is null or cc.campaign_day = p_campaign_day)
), opportunities as (
  select * from job_rows
  union all
  select * from company_rows
)
select *
from opportunities
order by
  opportunities.batch_date desc nulls last,
  opportunities.campaign_day desc nulls last,
  case opportunities.status when 'pending_review' then 0 when 'approved' then 1 else 2 end,
  opportunities.ai_role_relevance_score desc nulls last,
  opportunities.selected_at desc nulls last
limit greatest(1, least(coalesce(p_limit, 100), 500))
offset greatest(0, coalesce(p_offset, 0));
$function$;

revoke all on function public.get_review_opportunities_v2(uuid, integer, integer, text, integer) from public, anon;
grant execute on function public.get_review_opportunities_v2(uuid, integer, integer, text, integer) to authenticated;

-- A failed run that never moved beyond compile has not completed work. Mark it
-- needs_attention rather than falsely completing it. The next idempotent retry
-- can resume using the same run identity.
update public.orchestrator_runs
set status = 'needs_attention',
    current_stage = 'failed',
    completed_at = coalesce(completed_at, now()),
    last_error = coalesce(last_error, 'Interrupted by the former orchestrator stage constraint'),
    updated_at = now()
where status = 'running'
  and current_stage = 'compiling_search_plan'
  and heartbeat_at < now() - interval '10 minutes';

commit;
