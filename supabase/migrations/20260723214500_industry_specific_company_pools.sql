begin;

-- The existing 16k official NDIS provider records are disability-specific.
alter table public.company_contacts_pool rename to disability_company_contacts_pool;
alter table public.company_contact_template_links rename to disability_company_contact_template_links;

-- Keep older enrichment functions operational while they are migrated gradually.
create view public.company_contacts_pool
with (security_invoker = true)
as select * from public.disability_company_contacts_pool;

revoke all on public.company_contacts_pool from anon, authenticated;
grant select, insert, update, delete on public.company_contacts_pool to service_role;

-- Explicit template -> company pool routing.
create table if not exists public.template_company_pool_links (
  template_id uuid primary key references public.campaign_templates(id) on delete cascade,
  pool_key text not null check (pool_key in ('disability', 'aged_care')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.template_company_pool_links enable row level security;
revoke all on public.template_company_pool_links from anon, authenticated;
grant all on public.template_company_pool_links to service_role;

insert into public.template_company_pool_links (template_id, pool_key, is_active)
values ('cbb00739-5253-4a3f-b301-ae716548ccb5', 'disability', true)
on conflict (template_id) do update
set pool_key = excluded.pool_key,
    is_active = true,
    updated_at = now();

-- Empty pool prepared for the future Aged Care template/import.
create table if not exists public.aged_care_company_contacts_pool (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  normalized_company text,
  company_domain text,
  company_website_url text,
  email text,
  email_type text,
  source text,
  confidence integer not null default 0 check (confidence between 0 and 100),
  status text not null default 'active',
  quality_status text,
  aged_care_active boolean not null default true,
  approved_provider boolean,
  provider_identifier text,
  aged_care_service_categories text[] not null default array[]::text[],
  service_states text[] not null default array[]::text[],
  service_postcodes text[] not null default array[]::text[],
  last_verified_at timestamptz,
  last_used_at timestamptz,
  use_count integer not null default 0,
  raw_source jsonb not null default '{}'::jsonb,
  source_record_count integer not null default 1,
  source_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists aged_care_company_pool_company_idx
  on public.aged_care_company_contacts_pool (normalized_company)
  where status = 'active';
create index if not exists aged_care_company_pool_email_idx
  on public.aged_care_company_contacts_pool (email)
  where status = 'active';
create index if not exists aged_care_company_pool_states_gin_idx
  on public.aged_care_company_contacts_pool using gin (service_states);
create index if not exists aged_care_company_pool_categories_gin_idx
  on public.aged_care_company_contacts_pool using gin (aged_care_service_categories);

alter table public.aged_care_company_contacts_pool enable row level security;
revoke all on public.aged_care_company_contacts_pool from anon, authenticated;
grant all on public.aged_care_company_contacts_pool to service_role;

-- A candidate can now reference a contact from either industry pool.
alter table public.campaign_company_candidates
  add column if not exists pool_key text;
update public.campaign_company_candidates
set pool_key = 'disability'
where pool_key is null;
alter table public.campaign_company_candidates
  alter column pool_key set not null;
alter table public.campaign_company_candidates
  add constraint campaign_company_candidates_pool_key_check
  check (pool_key in ('disability', 'aged_care')) not valid;
alter table public.campaign_company_candidates
  validate constraint campaign_company_candidates_pool_key_check;

alter table public.campaign_company_candidates
  drop constraint if exists campaign_company_candidates_contact_id_fkey;
alter table public.campaign_company_candidates
  drop constraint if exists campaign_company_candidates_campaign_id_contact_id_key;
alter table public.campaign_company_candidates
  add constraint campaign_company_candidates_campaign_pool_contact_key
  unique (campaign_id, pool_key, contact_id);

create index if not exists campaign_company_candidates_pool_idx
  on public.campaign_company_candidates (campaign_id, pool_key, selected_for_campaign, user_decision);

create or replace function public.get_review_opportunities(
  p_campaign_id uuid default null,
  p_limit integer default 100
)
returns table (
  review_id uuid,
  opportunity_type text,
  id uuid,
  campaign_id uuid,
  title text,
  company text,
  location text,
  source text,
  apply_url text,
  extracted_email text,
  description text,
  status text,
  created_at timestamptz,
  ai_role_relevance_score integer,
  ai_reason text,
  service_categories text[],
  service_postcodes text[]
)
language sql
stable
security definer
set search_path = ''
as $function$
  with job_rows as (
    select
      m.id as review_id,
      'live_job'::text as opportunity_type,
      j.id as id,
      m.campaign_id as campaign_id,
      j.title as title,
      j.company as company,
      j.location as location,
      j.source as source,
      coalesce(j.apply_url, j.canonical_apply_url) as apply_url,
      j.extracted_email as extracted_email,
      j.description as description,
      coalesce(m.user_decision, 'pending_review') as status,
      coalesce(m.reviewed_at, m.selected_at, m.created_at) as created_at,
      m.ai_role_relevance_score as ai_role_relevance_score,
      m.ai_reason as ai_reason,
      array[]::text[] as service_categories,
      array[]::text[] as service_postcodes
    from public.campaign_job_matches m
    join public.campaigns c on c.id = m.campaign_id
    join public.jobs j on j.id = m.job_id
    where c.user_id = auth.uid()
      and (p_campaign_id is null or m.campaign_id = p_campaign_id)
      and (
        m.user_decision = 'approved'
        or (
          m.user_decision is null
          and m.selected_for_campaign = true
          and m.ai_status = 'completed'
          and m.ai_verdict = 'pass'
        )
      )
  ),
  company_rows as (
    select
      cc.id as review_id,
      'direct_company'::text as opportunity_type,
      cc.contact_id as id,
      cc.campaign_id as campaign_id,
      case cc.pool_key
        when 'aged_care' then 'Direct aged care outreach'
        else 'Direct disability support outreach'
      end as title,
      coalesce(dp.company_name, ap.company_name) as company,
      coalesce(cc.location_reason, 'Serves Greater Sydney') as location,
      case cc.pool_key
        when 'aged_care' then 'Aged care company pool'
        else 'Disability provider pool'
      end as source,
      coalesce(dp.company_website_url, ap.company_website_url) as apply_url,
      coalesce(dp.email, ap.email) as extracted_email,
      coalesce(
        array_to_string(dp.ndis_service_categories, ', '),
        array_to_string(ap.aged_care_service_categories, ', '),
        'Verified company contact'
      ) as description,
      coalesce(cc.user_decision, 'pending_review') as status,
      coalesce(cc.reviewed_at, cc.selected_at, cc.created_at) as created_at,
      cc.total_score as ai_role_relevance_score,
      cc.ai_reason as ai_reason,
      coalesce(dp.ndis_service_categories, ap.aged_care_service_categories, array[]::text[]) as service_categories,
      coalesce(dp.service_postcodes, ap.service_postcodes, array[]::text[]) as service_postcodes
    from public.campaign_company_candidates cc
    join public.campaigns c on c.id = cc.campaign_id
    left join public.disability_company_contacts_pool dp
      on cc.pool_key = 'disability' and dp.id = cc.contact_id
    left join public.aged_care_company_contacts_pool ap
      on cc.pool_key = 'aged_care' and ap.id = cc.contact_id
    where c.user_id = auth.uid()
      and (p_campaign_id is null or cc.campaign_id = p_campaign_id)
      and (dp.id is not null or ap.id is not null)
      and (
        cc.user_decision = 'approved'
        or (cc.user_decision is null and cc.selected_for_campaign = true)
      )
  )
  select
    opportunities.review_id,
    opportunities.opportunity_type,
    opportunities.id,
    opportunities.campaign_id,
    opportunities.title,
    opportunities.company,
    opportunities.location,
    opportunities.source,
    opportunities.apply_url,
    opportunities.extracted_email,
    opportunities.description,
    opportunities.status,
    opportunities.created_at,
    opportunities.ai_role_relevance_score,
    opportunities.ai_reason,
    opportunities.service_categories,
    opportunities.service_postcodes
  from (
    select * from job_rows
    union all
    select * from company_rows
  ) as opportunities
  order by
    case when opportunities.status = 'approved' then 1 else 0 end,
    opportunities.ai_role_relevance_score desc nulls last,
    opportunities.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 100));
$function$;

revoke all on function public.get_review_opportunities(uuid, integer) from public, anon;
grant execute on function public.get_review_opportunities(uuid, integer) to authenticated;

commit;
