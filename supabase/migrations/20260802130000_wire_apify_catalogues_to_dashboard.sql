-- Route the three Apify source catalogues into the existing campaign review
-- pipeline without returning to the retired public.jobs ingestion table.

create table if not exists public.template_job_catalogue
as select * from public.disability_jobs_nsw with no data;

alter table public.template_job_catalogue
  add column if not exists apply_method text not null default 'apply_url';

alter table public.template_job_catalogue
  alter column id set not null,
  alter column pool_key set not null,
  alter column template_slug set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.template_job_catalogue'::regclass
      and contype = 'p'
  ) then
    alter table public.template_job_catalogue
      add constraint template_job_catalogue_pkey primary key (id);
  end if;
end;
$$;

create unique index if not exists template_job_catalogue_pool_dedupe_uidx
  on public.template_job_catalogue (pool_key, dedupe_key);
create index if not exists template_job_catalogue_pool_fresh_idx
  on public.template_job_catalogue (pool_key, is_active, posted_at desc, fetched_at desc);

alter table public.template_job_catalogue enable row level security;
revoke all on public.template_job_catalogue from public, anon, authenticated;
grant select, insert, update, delete on public.template_job_catalogue to service_role;

create table if not exists public.template_job_pool_links (
  template_id uuid primary key references public.campaign_templates(id) on delete cascade,
  pool_key text not null unique check (pool_key in ('disability', 'childcare', 'aged_care')),
  source_table text not null unique check (
    source_table in ('disability_jobs_nsw', 'childcare_jobs_nsw', 'aged_care_jobs_nsw')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.template_job_pool_links enable row level security;
revoke all on public.template_job_pool_links from public, anon, authenticated;
grant select, insert, update, delete on public.template_job_pool_links to service_role;

insert into public.template_job_pool_links (template_id, pool_key, source_table)
select id, 'disability', 'disability_jobs_nsw'
from public.campaign_templates where slug = 'support-worker'
on conflict (template_id) do update
set pool_key = excluded.pool_key, source_table = excluded.source_table, updated_at = now();

insert into public.template_job_pool_links (template_id, pool_key, source_table)
select id, 'childcare', 'childcare_jobs_nsw'
from public.campaign_templates where slug = 'childcare'
on conflict (template_id) do update
set pool_key = excluded.pool_key, source_table = excluded.source_table, updated_at = now();

insert into public.template_job_pool_links (template_id, pool_key, source_table)
select id, 'aged_care', 'aged_care_jobs_nsw'
from public.campaign_templates where slug = 'agecare'
on conflict (template_id) do update
set pool_key = excluded.pool_key, source_table = excluded.source_table, updated_at = now();

create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

create or replace function app_private.sync_template_job_catalogue_row()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  target_pool text := tg_argv[0];
  target_slug text := tg_argv[1];
  target_category text := tg_argv[2];
  row_value public.template_job_catalogue;
begin
  select * into row_value
  from jsonb_populate_record(
    null::public.template_job_catalogue,
    to_jsonb(new) || jsonb_build_object(
      'pool_key', target_pool,
      'template_slug', target_slug,
      'category', target_category,
      'apply_method', case
        when nullif(btrim(new.extracted_email), '') is not null then 'email'
        else 'apply_url'
      end
    )
  );

  insert into public.template_job_catalogue
  select row_value.*
  on conflict (id) do update set
    source_job_id = excluded.source_job_id,
    title = excluded.title,
    company = excluded.company,
    location = excluded.location,
    city = excluded.city,
    state = excluded.state,
    country = excluded.country,
    description = excluded.description,
    apply_url = excluded.apply_url,
    source_url = excluded.source_url,
    posted_at = excluded.posted_at,
    job_type = excluded.job_type,
    is_remote = excluded.is_remote,
    salary = excluded.salary,
    salary_min = excluded.salary_min,
    salary_max = excluded.salary_max,
    salary_currency = excluded.salary_currency,
    salary_interval = excluded.salary_interval,
    experience_level = excluded.experience_level,
    work_mode = excluded.work_mode,
    required_certificates = excluded.required_certificates,
    requires_driver_licence = excluded.requires_driver_licence,
    visa_sponsorship = excluded.visa_sponsorship,
    company_url = excluded.company_url,
    company_logo = excluded.company_logo,
    emails = excluded.emails,
    normalized_title = excluded.normalized_title,
    normalized_company = excluded.normalized_company,
    canonical_apply_url = excluded.canonical_apply_url,
    dedupe_key = excluded.dedupe_key,
    source = excluded.source,
    provider = excluded.provider,
    search_query = excluded.search_query,
    template_slug = excluded.template_slug,
    category = excluded.category,
    pool_key = excluded.pool_key,
    apify_actor_id = excluded.apify_actor_id,
    apify_run_id = excluded.apify_run_id,
    apify_dataset_id = excluded.apify_dataset_id,
    raw_payload = excluded.raw_payload,
    catalogue_status = excluded.catalogue_status,
    status = excluded.status,
    extracted_email = coalesce(excluded.extracted_email, public.template_job_catalogue.extracted_email),
    extracted_contact_name = coalesce(excluded.extracted_contact_name, public.template_job_catalogue.extracted_contact_name),
    company_website_url = coalesce(excluded.company_website_url, public.template_job_catalogue.company_website_url),
    fetched_at = excluded.fetched_at,
    last_seen_at = excluded.last_seen_at,
    expires_at = excluded.expires_at,
    closed_at = excluded.closed_at,
    is_active = excluded.is_active,
    updated_at = greatest(excluded.updated_at, public.template_job_catalogue.updated_at);

  return new;
end;
$$;

revoke all on function app_private.sync_template_job_catalogue_row() from public, anon, authenticated;

drop trigger if exists sync_disability_jobs_to_dashboard on public.disability_jobs_nsw;
create trigger sync_disability_jobs_to_dashboard
after insert or update on public.disability_jobs_nsw
for each row execute function app_private.sync_template_job_catalogue_row(
  'disability', 'support-worker', 'disability'
);

drop trigger if exists sync_childcare_jobs_to_dashboard on public.childcare_jobs_nsw;
create trigger sync_childcare_jobs_to_dashboard
after insert or update on public.childcare_jobs_nsw
for each row execute function app_private.sync_template_job_catalogue_row(
  'childcare', 'childcare', 'childcare'
);

drop trigger if exists sync_aged_care_jobs_to_dashboard on public.aged_care_jobs_nsw;
create trigger sync_aged_care_jobs_to_dashboard
after insert or update on public.aged_care_jobs_nsw
for each row execute function app_private.sync_template_job_catalogue_row(
  'aged_care', 'agecare', 'aged_care'
);

-- Backfill existing Apify rows through the same trigger path.
update public.disability_jobs_nsw set updated_at = updated_at;
update public.childcare_jobs_nsw set updated_at = updated_at;
update public.aged_care_jobs_nsw set updated_at = updated_at;

alter table public.campaign_job_matches
  add column if not exists job_pool text;

-- Preserve already selected legacy rows so historical dashboard cards remain readable.
insert into public.template_job_catalogue
select populated.*
from public.jobs legacy
cross join lateral jsonb_populate_record(
  null::public.template_job_catalogue,
  to_jsonb(legacy) || jsonb_build_object(
    'pool_key', 'legacy',
    'template_slug', 'legacy',
    'category', coalesce(legacy.category, 'legacy'),
    'provider', coalesce(legacy.source, 'legacy'),
    'source_job_id', coalesce(legacy.source_job_id, 'legacy:' || legacy.id::text),
    'is_active', coalesce(legacy.catalogue_status, 'active') not in ('expired', 'closed', 'invalid'),
    'apply_method', coalesce(legacy.apply_method, 'apply_url')
  )
) populated
where exists (
  select 1 from public.campaign_job_matches m where m.job_id = legacy.id
)
on conflict (id) do nothing;

update public.campaign_job_matches m
set job_pool = coalesce(c.pool_key, 'legacy')
from public.template_job_catalogue c
where c.id = m.job_id
  and m.job_pool is null;

alter table public.campaign_job_matches
  alter column job_pool set default 'legacy';

alter table public.campaign_job_matches
  drop constraint if exists campaign_job_matches_job_id_fkey;

alter table public.campaign_job_matches
  add constraint campaign_job_matches_job_id_fkey
  foreign key (job_id) references public.template_job_catalogue(id) on delete cascade;

create index if not exists campaign_job_matches_pool_campaign_idx
  on public.campaign_job_matches (job_pool, campaign_id, selected_for_campaign);

create or replace function public.get_review_jobs(p_campaign_id uuid, p_limit integer)
returns table(
  match_id uuid, id uuid, campaign_id uuid, title text, company text,
  location text, source text, apply_url text, extracted_email text,
  description text, status text, created_at timestamptz,
  ai_role_relevance_score integer, ai_reason text
)
language sql stable security definer set search_path = ''
as $$
  with ranked as (
    select m.*, row_number() over (
      partition by m.campaign_id, m.job_id
      order by coalesce(m.reviewed_at, m.updated_at, m.selected_at, m.created_at) desc, m.id desc
    ) as rn
    from public.campaign_job_matches m
    join public.campaigns c on c.id = m.campaign_id
    where c.user_id = auth.uid()
      and (p_campaign_id is null or m.campaign_id = p_campaign_id)
  )
  select r.id, j.id, r.campaign_id, j.title, j.company, j.location, j.source,
         coalesce(j.apply_url, j.canonical_apply_url), j.extracted_email,
         j.description, coalesce(r.user_decision, 'pending_review'),
         coalesce(r.reviewed_at, r.selected_at, r.created_at),
         r.ai_role_relevance_score, r.ai_reason
  from ranked r
  join public.template_job_catalogue j on j.id = r.job_id
  where r.rn = 1
    and (
      r.user_decision = 'approved'
      or (r.user_decision is null and r.selected_for_campaign = true
          and r.ai_status = 'completed' and r.ai_verdict = 'pass')
    )
  order by case when r.user_decision = 'approved' then 1 else 0 end,
           coalesce(r.reviewed_at, r.selected_at, r.created_at) desc
  limit greatest(1, least(coalesce(p_limit, 100), 100));
$$;

create or replace function public.get_review_opportunities_v2(
  p_campaign_id uuid default null,
  p_limit integer default 100,
  p_offset integer default 0,
  p_decision_status text default null,
  p_campaign_day integer default null
)
returns table(
  review_id uuid, opportunity_type text, id uuid, campaign_id uuid, title text,
  company text, location text, source text, apply_url text, extracted_email text,
  description text, status text, created_at timestamptz, selected_at timestamptz,
  reviewed_at timestamptz, batch_date date, campaign_day integer,
  ai_role_relevance_score integer, ai_reason text,
  service_categories text[], service_postcodes text[]
)
language sql stable security definer set search_path = ''
as $$
with job_rows(
  review_id, opportunity_type, id, campaign_id, title, company, location,
  source, apply_url, extracted_email, description, status, created_at,
  selected_at, reviewed_at, batch_date, campaign_day,
  ai_role_relevance_score, ai_reason, service_categories, service_postcodes
) as (
  select m.id, 'live_job'::text, j.id, m.campaign_id, j.title, j.company,
         j.location, j.source, coalesce(j.apply_url, j.canonical_apply_url),
         j.extracted_email, j.description,
         coalesce(m.user_decision, 'pending_review'), m.created_at,
         m.selected_at, m.reviewed_at, m.batch_date, m.campaign_day,
         m.ai_role_relevance_score, m.ai_reason,
         array[]::text[], array[]::text[]
  from public.campaign_job_matches m
  join public.campaigns c on c.id = m.campaign_id
  join public.template_job_catalogue j on j.id = m.job_id
  where c.user_id = auth.uid()
    and m.selected_for_campaign = true
    and (p_campaign_id is null or m.campaign_id = p_campaign_id)
    and (p_decision_status is null or coalesce(m.user_decision, 'pending_review') = p_decision_status)
    and (p_campaign_day is null or m.campaign_day = p_campaign_day)
), company_rows as (
  select cc.id, 'direct_company'::text, cc.contact_id, cc.campaign_id,
         case cc.pool_key when 'aged_care' then 'Direct aged care outreach'
              when 'childcare' then 'Direct childcare outreach'
              else 'Direct disability support outreach' end,
         coalesce(dp.company_name, ap.company_name, cp.company_name),
         coalesce(cc.location_reason, 'Serves Greater Sydney'),
         case cc.pool_key when 'aged_care' then 'Aged care company pool'
              when 'childcare' then 'Childcare company pool'
              else 'Disability provider pool' end,
         coalesce(dp.company_website_url, ap.company_website_url, cp.company_website_url),
         coalesce(dp.email, ap.email, cp.email),
         coalesce(array_to_string(dp.ndis_service_categories, ', '),
                  array_to_string(ap.aged_care_service_categories, ', '),
                  array_to_string(cp.ndis_service_categories, ', '),
                  'Verified company contact'),
         coalesce(cc.user_decision, 'pending_review'), cc.created_at,
         cc.selected_at, cc.reviewed_at, cc.batch_date, cc.campaign_day,
         cc.total_score, cc.ai_reason,
         coalesce(dp.ndis_service_categories, ap.aged_care_service_categories,
                  cp.ndis_service_categories, array[]::text[]),
         coalesce(dp.service_postcodes, ap.service_postcodes,
                  cp.service_postcodes, array[]::text[])
  from public.campaign_company_candidates cc
  join public.campaigns c on c.id = cc.campaign_id
  left join public.disability_company_contacts_pool dp
    on cc.pool_key = 'disability' and dp.id = cc.contact_id
  left join public.aged_care_company_contacts_pool ap
    on cc.pool_key = 'aged_care' and ap.id = cc.contact_id
  left join public.childcare_company_contacts_pool cp
    on cc.pool_key = 'childcare' and cp.id = cc.contact_id
  where c.user_id = auth.uid()
    and cc.selected_for_campaign = true
    and (dp.id is not null or ap.id is not null or cp.id is not null)
    and (p_campaign_id is null or cc.campaign_id = p_campaign_id)
    and (p_decision_status is null or coalesce(cc.user_decision, 'pending_review') = p_decision_status)
    and (p_campaign_day is null or cc.campaign_day = p_campaign_day)
), opportunities as (
  select * from job_rows union all select * from company_rows
)
select * from opportunities
order by batch_date desc nulls last, campaign_day desc nulls last,
  case status when 'pending_review' then 0 when 'approved' then 1 else 2 end,
  ai_role_relevance_score desc nulls last, selected_at desc nulls last
limit greatest(1, least(coalesce(p_limit, 100), 500))
offset greatest(0, coalesce(p_offset, 0));
$$;

create or replace function public.get_review_opportunities(
  p_campaign_id uuid default null,
  p_limit integer default 100
)
returns table(
  review_id uuid, opportunity_type text, id uuid, campaign_id uuid, title text,
  company text, location text, source text, apply_url text, extracted_email text,
  description text, status text, created_at timestamptz,
  ai_role_relevance_score integer, ai_reason text,
  service_categories text[], service_postcodes text[]
)
language sql stable security definer set search_path = ''
as $$
  select v.review_id, v.opportunity_type, v.id, v.campaign_id, v.title,
         v.company, v.location, v.source, v.apply_url, v.extracted_email,
         v.description, v.status, v.created_at, v.ai_role_relevance_score,
         v.ai_reason, v.service_categories, v.service_postcodes
  from public.get_review_opportunities_v2(
    p_campaign_id, p_limit, 0, null, null
  ) v;
$$;

comment on table public.template_job_catalogue is
  'Operational campaign catalogue projected from the three Apify template source tables.';
