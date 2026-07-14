-- Calsie Jobs Orchestrator V2, Phase 1
-- Additive only. Existing production campaign and jobs flows remain unchanged.

create table if not exists public.orchestrator_runs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  run_date date not null default (now() at time zone 'utc')::date,
  run_type text not null default 'daily_catalogue',
  trigger text not null default 'scheduled',
  status text not null default 'queued',
  current_stage text not null default 'queued',
  search_plan jsonb not null default '{}'::jsonb,
  counters jsonb not null default '{}'::jsonb,
  stage_results jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  heartbeat_at timestamptz,
  retry_count integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orchestrator_runs_status_check check (status in (
    'queued',
    'running',
    'waiting_for_enrichment',
    'ready_for_review',
    'completed',
    'partially_completed',
    'retry_scheduled',
    'needs_attention'
  )),
  constraint orchestrator_runs_stage_check check (current_stage in (
    'queued',
    'compiling_search_plan',
    'checking_catalogue',
    'calculating_shortage',
    'fetching_jobs',
    'storing_jobs',
    'matching_jobs',
    'selecting_jobs',
    'enrichment_queued',
    'waiting_for_enrichment',
    'generating_drafts',
    'ready_for_review',
    'completed',
    'failed'
  ))
);

create unique index if not exists orchestrator_runs_campaign_day_type_uidx
  on public.orchestrator_runs (campaign_id, run_date, run_type);

create index if not exists orchestrator_runs_status_stage_idx
  on public.orchestrator_runs (status, current_stage, created_at);

create index if not exists orchestrator_runs_campaign_created_idx
  on public.orchestrator_runs (campaign_id, created_at desc);

create table if not exists public.campaign_job_matches (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  orchestrator_run_id uuid references public.orchestrator_runs(id) on delete set null,
  filter_status text not null default 'pending',
  match_score integer,
  title_score integer,
  location_score integer,
  experience_score integer,
  description_score integer,
  job_type_score integer,
  matched_rules jsonb not null default '[]'::jsonb,
  rejection_reasons jsonb not null default '[]'::jsonb,
  selected_for_campaign boolean not null default false,
  selected_at timestamptz,
  first_matched_at timestamptz not null default now(),
  last_evaluated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_job_matches_filter_status_check check (filter_status in (
    'pending',
    'eligible',
    'rejected',
    'selected',
    'held_for_later'
  )),
  constraint campaign_job_matches_score_check check (match_score is null or match_score between 0 and 100),
  constraint campaign_job_matches_component_scores_check check (
    (title_score is null or title_score between 0 and 40)
    and (location_score is null or location_score between 0 and 20)
    and (experience_score is null or experience_score between 0 and 15)
    and (description_score is null or description_score between 0 and 15)
    and (job_type_score is null or job_type_score between 0 and 10)
  )
);

create unique index if not exists campaign_job_matches_campaign_job_uidx
  on public.campaign_job_matches (campaign_id, job_id);

create index if not exists campaign_job_matches_campaign_rank_idx
  on public.campaign_job_matches (campaign_id, filter_status, selected_for_campaign, match_score desc nulls last);

create index if not exists campaign_job_matches_run_idx
  on public.campaign_job_matches (orchestrator_run_id, filter_status, match_score desc nulls last);

-- The existing jobs table already supports global catalogue rows because user_id and
-- campaign_id are nullable. These columns make catalogue lifecycle explicit without
-- changing the current user-owned tracker rows.
alter table public.jobs
  add column if not exists catalogue_status text not null default 'raw',
  add column if not exists canonical_apply_url text,
  add column if not exists global_dedupe_key text,
  add column if not exists last_seen_at timestamptz,
  add column if not exists closed_at timestamptz;

alter table public.jobs
  drop constraint if exists jobs_catalogue_status_check;

alter table public.jobs
  add constraint jobs_catalogue_status_check check (catalogue_status in (
    'raw',
    'active',
    'expired',
    'closed',
    'invalid'
  ));

-- Preserve the existing strongest provider identity rule.
create unique index if not exists jobs_global_source_job_id_uidx
  on public.jobs (source, source_job_id)
  where source_job_id is not null;

-- Canonical URL is populated by V2 ingestion code before insert/upsert.
create unique index if not exists jobs_global_canonical_apply_url_uidx
  on public.jobs (canonical_apply_url)
  where canonical_apply_url is not null
    and user_id is null
    and campaign_id is null;

create unique index if not exists jobs_global_dedupe_key_uidx
  on public.jobs (global_dedupe_key)
  where global_dedupe_key is not null
    and user_id is null
    and campaign_id is null;

create index if not exists jobs_catalogue_reuse_idx
  on public.jobs (catalogue_status, expires_at, posted_at desc nulls last, fetched_at desc nulls last)
  where user_id is null and campaign_id is null;

alter table public.orchestrator_runs enable row level security;
alter table public.campaign_job_matches enable row level security;

-- Users can inspect runs only for their own campaigns. Writes remain service-role only.
drop policy if exists orchestrator_runs_select_own_campaign on public.orchestrator_runs;
create policy orchestrator_runs_select_own_campaign
  on public.orchestrator_runs
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.campaigns c
      where c.id = orchestrator_runs.campaign_id
        and c.user_id = (select auth.uid())
    )
  );

drop policy if exists campaign_job_matches_select_own_campaign on public.campaign_job_matches;
create policy campaign_job_matches_select_own_campaign
  on public.campaign_job_matches
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.campaigns c
      where c.id = campaign_job_matches.campaign_id
        and c.user_id = (select auth.uid())
    )
  );

comment on table public.orchestrator_runs is
  'Resumable, idempotent Calsie Jobs campaign orchestration runs.';

comment on table public.campaign_job_matches is
  'Campaign-specific filtering, scoring, rejection and selection state for shared catalogue jobs.';
