create table if not exists public.campaign_company_candidates (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  contact_id uuid not null references public.company_contacts_pool(id) on delete cascade,
  orchestrator_run_id uuid references public.orchestrator_runs(id) on delete set null,
  template_id uuid references public.campaign_templates(id) on delete set null,
  opportunity_type text not null default 'direct_company' check (opportunity_type = 'direct_company'),
  template_score integer not null default 0 check (template_score between 0 and 100),
  location_score integer not null default 0 check (location_score between 0 and 100),
  service_score integer not null default 0 check (service_score between 0 and 100),
  total_score integer not null default 0 check (total_score between 0 and 100),
  location_reason text,
  ai_reason text,
  selected_for_campaign boolean not null default false,
  selected_at timestamptz,
  user_decision text check (user_decision is null or user_decision in ('approved', 'skipped')),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, contact_id)
);

create index if not exists campaign_company_candidates_review_idx
  on public.campaign_company_candidates (campaign_id, selected_for_campaign, user_decision, selected_at desc);

alter table public.campaign_company_candidates enable row level security;

revoke all on public.campaign_company_candidates from anon;
grant select, update on public.campaign_company_candidates to authenticated;
grant all on public.campaign_company_candidates to service_role;

drop policy if exists "Users read own company candidates" on public.campaign_company_candidates;
create policy "Users read own company candidates"
  on public.campaign_company_candidates
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.campaigns c
      where c.id = campaign_company_candidates.campaign_id
        and c.user_id = (select auth.uid())
    )
  );

drop policy if exists "Users update own company candidates" on public.campaign_company_candidates;
create policy "Users update own company candidates"
  on public.campaign_company_candidates
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.campaigns c
      where c.id = campaign_company_candidates.campaign_id
        and c.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.campaigns c
      where c.id = campaign_company_candidates.campaign_id
        and c.user_id = (select auth.uid())
    )
  );

drop policy if exists "Service role manages company candidates" on public.campaign_company_candidates;
create policy "Service role manages company candidates"
  on public.campaign_company_candidates
  for all
  to service_role
  using (true)
  with check (true);

update public.campaigns
set template_id = nullif(search->>'template_id', '')::uuid,
    updated_at = now()
where template_id is null
  and search ? 'template_id'
  and nullif(search->>'template_id', '') is not null;

create or replace function public.get_review_opportunities(
  p_campaign_id uuid default null,
  p_limit integer default 100
)
returns table (
  opportunity_type text,
  review_id uuid,
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
  with owned_campaigns as (
    select c.id
    from public.campaigns c
    where c.user_id = auth.uid()
      and (p_campaign_id is null or c.id = p_campaign_id)
  ),
  ranked_jobs as (
    select
      m.*,
      row_number() over (
        partition by m.campaign_id, m.job_id
        order by coalesce(m.reviewed_at, m.updated_at, m.selected_at, m.created_at) desc, m.id desc
      ) as rn
    from public.campaign_job_matches m
    join owned_campaigns c on c.id = m.campaign_id
  ),
  job_rows as (
    select
      'live_job'::text as opportunity_type,
      r.id as review_id,
      j.id,
      r.campaign_id,
      j.title,
      j.company,
      j.location,
      j.source,
      coalesce(j.apply_url, j.canonical_apply_url) as apply_url,
      j.extracted_email,
      j.description,
      coalesce(r.user_decision, 'pending_review') as status,
      coalesce(r.reviewed_at, r.selected_at, r.created_at) as created_at,
      r.ai_role_relevance_score,
      r.ai_reason,
      null::text[] as service_categories,
      null::text[] as service_postcodes
    from ranked_jobs r
    join public.jobs j on j.id = r.job_id
    where r.rn = 1
      and (
        r.user_decision = 'approved'
        or (
          r.user_decision is null
          and r.selected_for_campaign = true
          and r.ai_status = 'completed'
          and r.ai_verdict = 'pass'
        )
      )
  ),
  company_rows as (
    select
      'direct_company'::text as opportunity_type,
      cc.id as review_id,
      p.id,
      cc.campaign_id,
      'Direct company outreach'::text as title,
      p.company_name as company,
      coalesce(cc.location_reason, 'Greater Sydney') as location,
      'NDIS provider directory'::text as source,
      p.company_website_url as apply_url,
      p.email as extracted_email,
      array_to_string(p.ndis_service_categories, ', ') as description,
      coalesce(cc.user_decision, 'pending_review') as status,
      coalesce(cc.reviewed_at, cc.selected_at, cc.created_at) as created_at,
      cc.total_score as ai_role_relevance_score,
      cc.ai_reason,
      p.ndis_service_categories as service_categories,
      p.service_postcodes as service_postcodes
    from public.campaign_company_candidates cc
    join owned_campaigns c on c.id = cc.campaign_id
    join public.company_contacts_pool p on p.id = cc.contact_id
    where cc.user_decision = 'approved'
       or (cc.user_decision is null and cc.selected_for_campaign = true)
  )
  select *
  from (
    select * from job_rows
    union all
    select * from company_rows
  ) opportunities
  order by
    case when status = 'approved' then 1 else 0 end,
    created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 100));
$function$;

revoke all on function public.get_review_opportunities(uuid, integer) from public, anon;
grant execute on function public.get_review_opportunities(uuid, integer) to authenticated;

create or replace function public.decide_campaign_opportunity(
  p_opportunity_type text,
  p_review_id uuid,
  p_decision text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if p_decision not in ('approved', 'skipped') then
    raise exception 'Invalid decision';
  end if;

  if p_opportunity_type = 'live_job' then
    return public.decide_campaign_job(p_review_id, p_decision);
  elsif p_opportunity_type = 'direct_company' then
    update public.campaign_company_candidates cc
    set user_decision = p_decision,
        reviewed_at = now(),
        updated_at = now()
    from public.campaigns c
    where cc.id = p_review_id
      and c.id = cc.campaign_id
      and c.user_id = auth.uid()
      and cc.selected_for_campaign = true;
    return found;
  end if;

  raise exception 'Invalid opportunity type';
end;
$function$;

revoke all on function public.decide_campaign_opportunity(text, uuid, text) from public, anon;
grant execute on function public.decide_campaign_opportunity(text, uuid, text) to authenticated;