create table if not exists public.company_contacts_pool (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  normalized_company text not null,
  company_domain text,
  company_website_url text,
  email text,
  email_type text,
  source text,
  confidence integer not null default 0,
  status text not null default 'active',
  quality_status text not null default 'unverified',
  last_verified_at timestamptz,
  last_used_at timestamptz,
  use_count integer not null default 0,
  first_job_id uuid,
  first_campaign_id uuid,
  raw_source jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.company_contacts_pool
  add column if not exists company_name text,
  add column if not exists normalized_company text,
  add column if not exists company_domain text,
  add column if not exists company_website_url text,
  add column if not exists email text,
  add column if not exists email_type text,
  add column if not exists source text,
  add column if not exists confidence integer not null default 0,
  add column if not exists status text not null default 'active',
  add column if not exists quality_status text not null default 'unverified',
  add column if not exists last_verified_at timestamptz,
  add column if not exists last_used_at timestamptz,
  add column if not exists use_count integer not null default 0,
  add column if not exists first_job_id uuid,
  add column if not exists first_campaign_id uuid,
  add column if not exists raw_source jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_company_contacts_pool_normalized_company_active
  on public.company_contacts_pool (normalized_company)
  where status = 'active';

create index if not exists idx_company_contacts_pool_domain_active
  on public.company_contacts_pool (company_domain)
  where status = 'active';

create index if not exists idx_company_contacts_pool_email_active
  on public.company_contacts_pool (email)
  where status = 'active';

create index if not exists idx_company_contacts_pool_updated_at
  on public.company_contacts_pool (updated_at desc);

create table if not exists public.company_enrichment_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  campaign_id uuid,
  normalized_company text not null,
  company_name text not null,
  location text,
  job_ids uuid[] not null default '{}',
  status text not null default 'pending',
  priority integer not null default 100,
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  last_error text,
  locked_at timestamptz,
  locked_by text,
  available_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_company_enrichment_queue_pending
  on public.company_enrichment_queue (status, available_at, priority, created_at);

create index if not exists idx_company_enrichment_queue_company
  on public.company_enrichment_queue (normalized_company);

create index if not exists idx_company_enrichment_queue_campaign
  on public.company_enrichment_queue (campaign_id, status);

create unique index if not exists idx_company_enrichment_queue_one_active_company
  on public.company_enrichment_queue (normalized_company)
  where status in ('pending', 'processing');

create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  campaign_id uuid,
  type text not null,
  title text not null,
  message text not null,
  status text not null default 'unread',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists idx_user_notifications_user_status_created
  on public.user_notifications (user_id, status, created_at desc);

create index if not exists idx_user_notifications_campaign_created
  on public.user_notifications (campaign_id, created_at desc);

update public.lead_contact_emails
set status = 'blocked',
    updated_at = now()
where status <> 'blocked'
  and (
    email ilike '%sentry%'
    or email ilike '%ingest%'
    or email ilike '%@zalando.de'
    or lower(email) = 'info@cserickson.com'
  );

update public.company_contacts_pool
set status = 'blocked',
    updated_at = now()
where status <> 'blocked'
  and (
    email ilike '%sentry%'
    or email ilike '%ingest%'
    or email ilike '%@zalando.de'
    or lower(email) = 'info@cserickson.com'
  );

comment on table public.company_contacts_pool is
  'Global reusable company contact pool. Only active rows with confidence >= 70 and valid emails should be reused by application code.';

comment on table public.company_enrichment_queue is
  'Small-batch company enrichment queue for approved jobs missing contact emails. Workers process a few companies per invocation.';
