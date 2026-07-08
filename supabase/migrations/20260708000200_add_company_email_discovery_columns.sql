alter table public.jobs
  add column if not exists company_website_url text,
  add column if not exists website_discovery_status text default 'not_started',
  add column if not exists website_discovery_source text,
  add column if not exists website_discovery_confidence integer default 0,
  add column if not exists website_discovery_error text,
  add column if not exists website_discovery_attempt_count integer default 0,
  add column if not exists website_discovery_attempted_at timestamptz;

alter table public.lead_contact_emails
  add column if not exists company_domain text,
  add column if not exists company_website_status text,
  add column if not exists website_confidence integer,
  add column if not exists last_checked_at timestamptz;

create index if not exists idx_jobs_normalized_company_email_pending
  on public.jobs (normalized_company, email_extraction_status)
  where extracted_email is null;

create index if not exists idx_jobs_company_website_discovery_status
  on public.jobs (website_discovery_status);

create index if not exists idx_lead_contact_emails_company_domain
  on public.lead_contact_emails (company_domain)
  where status = 'active';

create index if not exists idx_lead_contact_emails_company_name_active
  on public.lead_contact_emails (lower(company_name))
  where status = 'active';
