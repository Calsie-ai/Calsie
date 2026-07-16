alter table public.orchestrator_runs
  drop constraint if exists orchestrator_runs_stage_check;

alter table public.orchestrator_runs
  add constraint orchestrator_runs_stage_check
  check (
    current_stage = any (
      array[
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
        'selecting_jobs'::text,
        'enrichment_queued'::text,
        'waiting_for_enrichment'::text,
        'generating_drafts'::text,
        'ready_for_review'::text,
        'completed'::text,
        'failed'::text
      ]
    )
  );
