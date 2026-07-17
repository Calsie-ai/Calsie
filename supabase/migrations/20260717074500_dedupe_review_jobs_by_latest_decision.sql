create or replace function public.get_review_jobs(p_campaign_id uuid, p_limit integer)
returns table(
  match_id uuid,
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
  ai_reason text
)
language sql
stable
security definer
set search_path = ''
as $$
  with ranked as (
    select
      m.*,
      row_number() over (
        partition by m.campaign_id, m.job_id
        order by coalesce(m.reviewed_at, m.updated_at, m.selected_at, m.created_at) desc, m.id desc
      ) as rn
    from public.campaign_job_matches m
    join public.campaigns c on c.id = m.campaign_id
    where c.user_id = auth.uid()
      and (p_campaign_id is null or m.campaign_id = p_campaign_id)
  )
  select
    r.id as match_id,
    j.id,
    r.campaign_id,
    j.title,
    j.company,
    j.location,
    j.source,
    coalesce(j.apply_url, j.canonical_apply_url),
    j.extracted_email,
    j.description,
    coalesce(r.user_decision, 'pending_review') as status,
    coalesce(r.reviewed_at, r.selected_at, r.created_at) as created_at,
    r.ai_role_relevance_score,
    r.ai_reason
  from ranked r
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
  order by
    case when r.user_decision = 'approved' then 1 else 0 end,
    coalesce(r.reviewed_at, r.selected_at, r.created_at) desc
  limit greatest(1, least(coalesce(p_limit, 100), 100));
$$;

revoke all on function public.get_review_jobs(uuid, integer) from public, anon;
grant execute on function public.get_review_jobs(uuid, integer) to authenticated, service_role;

create or replace function public.get_review_jobs(p_campaign_id uuid default null)
returns table(
  match_id uuid,
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
  ai_reason text
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.get_review_jobs(p_campaign_id, 100);
$$;

revoke all on function public.get_review_jobs(uuid) from public, anon;
grant execute on function public.get_review_jobs(uuid) to authenticated, service_role;