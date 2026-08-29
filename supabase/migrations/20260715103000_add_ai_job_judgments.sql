alter table public.campaign_job_matches
  add column if not exists ai_status text not null default 'pending',
  add column if not exists ai_verdict text,
  add column if not exists ai_role_relevance_score integer,
  add column if not exists ai_candidate_fit_score integer,
  add column if not exists ai_confidence numeric,
  add column if not exists ai_role_family text,
  add column if not exists ai_title_relationship text,
  add column if not exists ai_matched_requirements jsonb not null default '[]'::jsonb,
  add column if not exists ai_conflicts jsonb not null default '[]'::jsonb,
  add column if not exists ai_reason text,
  add column if not exists ai_input_hash text,
  add column if not exists ai_prompt_version text,
  add column if not exists ai_model text,
  add column if not exists ai_judged_at timestamptz,
  add column if not exists ai_attempt_count integer not null default 0,
  add column if not exists ai_last_error text;

alter table public.campaign_job_matches
  drop constraint if exists campaign_job_matches_ai_status_check,
  add constraint campaign_job_matches_ai_status_check
    check (ai_status = any (array['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text, 'stale'::text]));

alter table public.campaign_job_matches
  drop constraint if exists campaign_job_matches_ai_verdict_check,
  add constraint campaign_job_matches_ai_verdict_check
    check (ai_verdict is null or ai_verdict = any (array['pass'::text, 'review'::text, 'reject'::text]));

alter table public.campaign_job_matches
  drop constraint if exists campaign_job_matches_ai_scores_check,
  add constraint campaign_job_matches_ai_scores_check
    check (
      (ai_role_relevance_score is null or ai_role_relevance_score between 0 and 100)
      and (ai_candidate_fit_score is null or ai_candidate_fit_score between 0 and 100)
      and (ai_confidence is null or ai_confidence between 0 and 1)
      and ai_attempt_count >= 0
    );

create index if not exists campaign_job_matches_ai_queue_idx
  on public.campaign_job_matches (campaign_id, ai_status, filter_status, match_score desc nulls last);

create index if not exists campaign_job_matches_ai_selection_idx
  on public.campaign_job_matches (campaign_id, ai_verdict, ai_role_relevance_score desc, ai_confidence desc)
  where ai_status = 'completed';

comment on column public.campaign_job_matches.ai_input_hash is
  'SHA-256 of campaign criteria, candidate profile, job content and prompt version. Reuse completed judgment when unchanged.';
