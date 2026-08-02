-- Dedicated NSW job catalogues used by the three Apify/Indeed template pools.
-- These are service-only ingestion tables; the dashboard routes will be moved
-- from public.jobs in a later migration.

create table if not exists public.disability_jobs_nsw (
  id uuid primary key default gen_random_uuid(),
  source_job_id text not null check (length(btrim(source_job_id)) > 0),
  title text not null check (length(btrim(title)) > 0),
  company text not null check (length(btrim(company)) > 0),
  location text,
  city text,
  state text not null default 'NSW',
  country text not null default 'Australia',
  description text,
  apply_url text not null check (length(btrim(apply_url)) > 0),
  source_url text,
  posted_at timestamptz,
  job_type text,
  is_remote boolean,
  salary text,
  salary_min numeric,
  salary_max numeric,
  salary_currency text,
  salary_interval text,
  experience_level text,
  work_mode text,
  required_certificates text[] not null default '{}',
  requires_driver_licence boolean not null default false,
  visa_sponsorship boolean not null default false,
  company_url text,
  company_logo text,
  emails text[] not null default '{}',
  normalized_title text,
  normalized_company text,
  canonical_apply_url text not null,
  dedupe_key text not null,
  source text not null default 'indeed',
  provider text not null default 'apify',
  search_query text,
  template_slug text not null default 'support-worker' check (template_slug = 'support-worker'),
  category text not null default 'disability' check (category = 'disability'),
  pool_key text not null default 'disability' check (pool_key = 'disability'),
  apify_actor_id text,
  apify_run_id text,
  apify_dataset_id text,
  raw_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(raw_payload) = 'object'),
  catalogue_status text not null default 'raw',
  match_score integer check (match_score between 0 and 100),
  status text not null default 'new',
  user_decision text,
  reviewed_at timestamptz,
  extracted_email text,
  extracted_contact_name text,
  email_extraction_status text not null default 'not_started',
  email_extraction_attempt_count integer not null default 0 check (email_extraction_attempt_count >= 0),
  email_extraction_attempted_at timestamptz,
  email_extraction_source text,
  email_extraction_confidence integer not null default 0 check (email_extraction_confidence between 0 and 100),
  email_extraction_error text,
  email_contact_id uuid,
  company_website_url text,
  website_discovery_status text not null default 'not_started',
  website_discovery_source text,
  website_discovery_confidence integer not null default 0 check (website_discovery_confidence between 0 and 100),
  website_discovery_error text,
  website_discovery_attempt_count integer not null default 0 check (website_discovery_attempt_count >= 0),
  website_discovery_attempted_at timestamptz,
  fetched_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  closed_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (salary_min is null or salary_max is null or salary_max >= salary_min)
);

create table if not exists public.childcare_jobs_nsw
  (like public.disability_jobs_nsw including defaults including constraints including storage including comments);

create table if not exists public.aged_care_jobs_nsw
  (like public.disability_jobs_nsw including defaults including constraints including storage including comments);

alter table public.childcare_jobs_nsw
  alter column template_slug set default 'childcare',
  alter column category set default 'childcare',
  alter column pool_key set default 'childcare';
alter table public.childcare_jobs_nsw
  drop constraint if exists disability_jobs_nsw_template_slug_check,
  drop constraint if exists disability_jobs_nsw_category_check,
  drop constraint if exists disability_jobs_nsw_pool_key_check;

alter table public.aged_care_jobs_nsw
  alter column template_slug set default 'agecare',
  alter column category set default 'aged_care',
  alter column pool_key set default 'aged_care';
alter table public.aged_care_jobs_nsw
  drop constraint if exists disability_jobs_nsw_template_slug_check,
  drop constraint if exists disability_jobs_nsw_category_check,
  drop constraint if exists disability_jobs_nsw_pool_key_check;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.childcare_jobs_nsw'::regclass and contype = 'p') then
    alter table public.childcare_jobs_nsw add primary key (id);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.aged_care_jobs_nsw'::regclass and contype = 'p') then
    alter table public.aged_care_jobs_nsw add primary key (id);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.childcare_jobs_nsw'::regclass and conname = 'childcare_jobs_nsw_template_slug_check') then
    alter table public.childcare_jobs_nsw add constraint childcare_jobs_nsw_template_slug_check check (template_slug = 'childcare');
    alter table public.childcare_jobs_nsw add constraint childcare_jobs_nsw_category_check check (category = 'childcare');
    alter table public.childcare_jobs_nsw add constraint childcare_jobs_nsw_pool_key_check check (pool_key = 'childcare');
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.aged_care_jobs_nsw'::regclass and conname = 'aged_care_jobs_nsw_template_slug_check') then
    alter table public.aged_care_jobs_nsw add constraint aged_care_jobs_nsw_template_slug_check check (template_slug = 'agecare');
    alter table public.aged_care_jobs_nsw add constraint aged_care_jobs_nsw_category_check check (category = 'aged_care');
    alter table public.aged_care_jobs_nsw add constraint aged_care_jobs_nsw_pool_key_check check (pool_key = 'aged_care');
  end if;
end;
$$;

create unique index if not exists disability_jobs_nsw_source_job_uidx on public.disability_jobs_nsw (source, source_job_id);
create unique index if not exists disability_jobs_nsw_canonical_url_uidx on public.disability_jobs_nsw (canonical_apply_url);
create unique index if not exists disability_jobs_nsw_dedupe_key_uidx on public.disability_jobs_nsw (dedupe_key);
create index if not exists disability_jobs_nsw_active_posted_idx on public.disability_jobs_nsw (is_active, posted_at desc);
create index if not exists disability_jobs_nsw_expires_idx on public.disability_jobs_nsw (expires_at) where is_active;
create index if not exists disability_jobs_nsw_company_idx on public.disability_jobs_nsw (normalized_company);
create index if not exists disability_jobs_nsw_apify_run_idx on public.disability_jobs_nsw (apify_run_id);

create unique index if not exists childcare_jobs_nsw_source_job_uidx on public.childcare_jobs_nsw (source, source_job_id);
create unique index if not exists childcare_jobs_nsw_canonical_url_uidx on public.childcare_jobs_nsw (canonical_apply_url);
create unique index if not exists childcare_jobs_nsw_dedupe_key_uidx on public.childcare_jobs_nsw (dedupe_key);
create index if not exists childcare_jobs_nsw_active_posted_idx on public.childcare_jobs_nsw (is_active, posted_at desc);
create index if not exists childcare_jobs_nsw_expires_idx on public.childcare_jobs_nsw (expires_at) where is_active;
create index if not exists childcare_jobs_nsw_company_idx on public.childcare_jobs_nsw (normalized_company);
create index if not exists childcare_jobs_nsw_apify_run_idx on public.childcare_jobs_nsw (apify_run_id);

create unique index if not exists aged_care_jobs_nsw_source_job_uidx on public.aged_care_jobs_nsw (source, source_job_id);
create unique index if not exists aged_care_jobs_nsw_canonical_url_uidx on public.aged_care_jobs_nsw (canonical_apply_url);
create unique index if not exists aged_care_jobs_nsw_dedupe_key_uidx on public.aged_care_jobs_nsw (dedupe_key);
create index if not exists aged_care_jobs_nsw_active_posted_idx on public.aged_care_jobs_nsw (is_active, posted_at desc);
create index if not exists aged_care_jobs_nsw_expires_idx on public.aged_care_jobs_nsw (expires_at) where is_active;
create index if not exists aged_care_jobs_nsw_company_idx on public.aged_care_jobs_nsw (normalized_company);
create index if not exists aged_care_jobs_nsw_apify_run_idx on public.aged_care_jobs_nsw (apify_run_id);

alter table public.disability_jobs_nsw enable row level security;
alter table public.childcare_jobs_nsw enable row level security;
alter table public.aged_care_jobs_nsw enable row level security;

revoke all on table public.disability_jobs_nsw, public.childcare_jobs_nsw, public.aged_care_jobs_nsw from public, anon, authenticated;
grant select, insert, update, delete on table public.disability_jobs_nsw, public.childcare_jobs_nsw, public.aged_care_jobs_nsw to service_role;

comment on table public.disability_jobs_nsw is 'NSW disability job catalogue populated by the Apify Indeed actor.';
comment on table public.childcare_jobs_nsw is 'NSW childcare job catalogue populated by the Apify Indeed actor.';
comment on table public.aged_care_jobs_nsw is 'NSW aged-care job catalogue populated by the Apify Indeed actor.';
