-- Job email enrichment state.
-- jobs.extracted_email is the selected email for the job.
-- lead_contact_emails stores reusable company/contact emails.
-- outreach_queue should only receive drafts after a job has a valid extracted email.

alter table public.jobs
  add column if not exists email_extraction_status text default 'not_started',
  add column if not exists email_extraction_attempt_count integer default 0,
  add column if not exists email_extraction_attempted_at timestamptz,
  add column if not exists email_extraction_source text,
  add column if not exists email_extraction_confidence integer default 0,
  add column if not exists email_extraction_error text,
  add column if not exists email_contact_id uuid;

alter table public.lead_contact_emails
  add column if not exists job_id uuid;

alter table public.jobs
  alter column email_extraction_status set default 'not_started',
  alter column email_extraction_attempt_count set default 0,
  alter column email_extraction_confidence set default 0;

update public.jobs
set
  email_extraction_status = coalesce(email_extraction_status, 'not_started'),
  email_extraction_attempt_count = coalesce(email_extraction_attempt_count, 0),
  email_extraction_confidence = coalesce(email_extraction_confidence, 0);

comment on column public.jobs.extracted_email is
  'Selected email for this job. Future outreach draft creation should read this value as the job email source of truth.';

comment on column public.lead_contact_emails.job_id is
  'Optional source job that produced or most recently refreshed this reusable contact email.';

comment on table public.lead_contact_emails is
  'Reusable company/contact emails discovered during job email enrichment and related outreach workflows.';

comment on table public.outreach_queue is
  'Final reviewable outreach drafts. Rows should only be created after a job has a valid selected email in jobs.extracted_email.';
