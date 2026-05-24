-- Stores jobs discovered by the hourly Applix job hunt.
-- Background flow: Adzuna -> Render scraper -> jobs_gateway -> Matching page.

create table if not exists jobs_gateway (
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
  hiring_email text,
  application_method text default 'email',
  contact_confidence text default 'unknown',
  source_url text,
  contact_notes jsonb default '[]'::jsonb,
  tags jsonb default '[]'::jsonb,
  posted_at timestamptz,
  posted_ago text,
  match_score int default 75,
  requested_role text,
  requested_industry text,
  requested_specialisation text,
  requested_location text,
  created_at timestamptz default now(),
  refreshed_at timestamptz default now(),
  unique (user_id, external_job_id)
);

create index if not exists jobs_gateway_user_refreshed_idx
on jobs_gateway(user_id, refreshed_at desc);

create index if not exists jobs_gateway_email_idx
on jobs_gateway(user_id, hiring_email);

alter table jobs_gateway enable row level security;

create policy if not exists "Users can read own gateway jobs"
on jobs_gateway for select
using (auth.uid() = user_id);

create policy if not exists "Users can insert own gateway jobs"
on jobs_gateway for insert
with check (auth.uid() = user_id);

create policy if not exists "Users can update own gateway jobs"
on jobs_gateway for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
