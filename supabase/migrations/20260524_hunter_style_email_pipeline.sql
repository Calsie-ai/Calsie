-- Hunter-style Applix enrichment pipeline.
-- job_leads stores raw job leads.
-- company_domains stores discovered company domains.
-- email_candidates stores found/guessed emails with confidence.

create table if not exists job_leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  external_job_id text,
  title text not null,
  company text,
  location text,
  salary text,
  job_type text,
  description text,
  source_website text default 'adzuna',
  apply_url text,
  posted_at timestamptz,
  posted_ago text,
  tags jsonb default '[]'::jsonb,
  requested_role text,
  requested_industry text,
  requested_specialisation text,
  requested_location text,
  status text default 'pending',
  created_at timestamptz default now(),
  refreshed_at timestamptz default now(),
  unique (user_id, external_job_id)
);

create table if not exists company_domains (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  company text not null,
  domain text not null,
  confidence text default 'unknown',
  source_url text,
  created_at timestamptz default now(),
  refreshed_at timestamptz default now(),
  unique (user_id, company, domain)
);

create table if not exists email_candidates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  external_job_id text,
  company text,
  domain text,
  email text not null,
  email_type text default 'unknown',
  confidence text default 'low',
  source_url text,
  source_method text default 'scrape',
  verified_status text default 'unverified',
  notes jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  refreshed_at timestamptz default now(),
  unique (user_id, external_job_id, email)
);

create index if not exists job_leads_user_status_idx
on job_leads(user_id, status, refreshed_at desc);

create index if not exists company_domains_user_company_idx
on company_domains(user_id, company);

create index if not exists email_candidates_user_job_idx
on email_candidates(user_id, external_job_id, confidence);

alter table job_leads enable row level security;
alter table company_domains enable row level security;
alter table email_candidates enable row level security;

create policy if not exists "Users can read own job leads"
on job_leads for select
using (auth.uid() = user_id);

create policy if not exists "Users can read own company domains"
on company_domains for select
using (auth.uid() = user_id);

create policy if not exists "Users can read own email candidates"
on email_candidates for select
using (auth.uid() = user_id);

create policy if not exists "Users can insert own job leads"
on job_leads for insert
with check (auth.uid() = user_id);

create policy if not exists "Users can insert own company domains"
on company_domains for insert
with check (auth.uid() = user_id);

create policy if not exists "Users can insert own email candidates"
on email_candidates for insert
with check (auth.uid() = user_id);

create policy if not exists "Users can update own job leads"
on job_leads for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy if not exists "Users can update own company domains"
on company_domains for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy if not exists "Users can update own email candidates"
on email_candidates for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
