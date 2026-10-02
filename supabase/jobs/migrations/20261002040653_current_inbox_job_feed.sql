-- Apply only to NEW Jobs project ibgmpamvkvjzdxirzxzr, before the feed release.
-- Preserve legacy numeric IDs; inbox jobs use UUID strings in the same column.
alter table public.calsie_job_swipe_decisions
  alter column source_job_id type text using source_job_id::text;
alter table public.calsie_job_swipe_decisions
  drop constraint calsie_job_swipe_decisions_source_table_check;
alter table public.calsie_job_swipe_decisions
  add constraint calsie_job_swipe_decisions_source_table_check check (source_table in (
    'disability_jobs_apify', 'childcare_jobs_apify', 'agecare_jobs_apify',
    'disability_jobs_view', 'childcare_jobs_view', 'agecare_jobs_view'
  ));
-- Existing unique key, ownership FK, active-agent trigger, RLS and grants remain.
-- No new browser access to the inbox or category views.
-- Roll back the frontend/feed together; retain this widened column.
-- Never cast back to bigint once UUID decisions have been saved.
