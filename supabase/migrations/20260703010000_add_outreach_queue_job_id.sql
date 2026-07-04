alter table public.outreach_queue
  add column if not exists job_id uuid;

comment on column public.outreach_queue.job_id is
  'Source job for jobs-first outreach draft generation. Drafts created from public.jobs should use this instead of job_post_id.';

create unique index if not exists outreach_queue_job_id_unique
  on public.outreach_queue (job_id)
  where job_id is not null;
