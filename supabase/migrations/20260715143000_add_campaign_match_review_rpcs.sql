alter table public.campaign_job_matches
  add column if not exists user_decision text,
  add column if not exists reviewed_at timestamptz;

alter table public.campaign_job_matches
  drop constraint if exists campaign_job_matches_user_decision_check,
  add constraint campaign_job_matches_user_decision_check
    check (
      user_decision is null
      or user_decision = any (array['approved'::text, 'skipped'::text])
    );

alter table public.campaign_job_matches
  drop constraint if exists campaign_job_matches_ai_status_check,
  add constraint campaign_job_matches_ai_status_check
    check (
      ai_status = any (
        array[
          'pending'::text,
          'processing'::text,
          'completed'::text,
          'failed'::text,
          'stale'::text,
          'skipped'::text
        ]
      )
    );

create index if not exists campaign_job_matches_review_queue_idx
  on public.campaign_job_matches (
    campaign_id,
    selected_for_campaign,
    user_decision,
    selected_at desc
  );

create or replace function public.get_review_jobs(
  p_campaign_id uuid default null,
  p_limit integer default 100
)
returns table (
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
  created_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    m.id as match_id,
    j.id,
    m.campaign_id,
    j.title,
    j.company,
    j.location,
    j.source,
    coalesce(j.apply_url, j.canonical_apply_url),
    j.extracted_email,
    j.description,
    coalesce(m.user_decision, 'review') as status,
    coalesce(m.selected_at, m.created_at)
  from public.campaign_job_matches m
  join public.campaigns c on c.id = m.campaign_id
  join public.jobs j on j.id = m.job_id
  where c.user_id = auth.uid()
    and m.selected_for_campaign = true
    and m.ai_status = 'completed'
    and m.ai_verdict = 'pass'
    and m.filter_status = 'eligible'
    and m.user_decision is null
    and (p_campaign_id is null or m.campaign_id = p_campaign_id)
  order by m.selected_at desc nulls last, m.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 100));
$$;

create or replace function public.decide_campaign_job(
  p_campaign_id uuid,
  p_job_id uuid,
  p_decision text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_decision not in ('approved', 'skipped') then
    raise exception 'Invalid campaign job decision';
  end if;

  update public.campaign_job_matches m
  set
    user_decision = p_decision,
    reviewed_at = now(),
    updated_at = now()
  from public.campaigns c
  where m.campaign_id = c.id
    and c.user_id = auth.uid()
    and m.campaign_id = p_campaign_id
    and m.job_id = p_job_id
    and m.selected_for_campaign = true
    and m.ai_status = 'completed'
    and m.ai_verdict = 'pass';

  return found;
end;
$$;

revoke all on function public.get_review_jobs(uuid, integer) from public;
revoke all on function public.decide_campaign_job(uuid, uuid, text) from public;

grant execute on function public.get_review_jobs(uuid, integer) to authenticated;
grant execute on function public.decide_campaign_job(uuid, uuid, text) to authenticated;
