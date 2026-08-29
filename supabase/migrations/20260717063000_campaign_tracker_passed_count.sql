drop function if exists public.get_campaign_tracker_counts(uuid);

create function public.get_campaign_tracker_counts(p_campaign_id uuid)
returns table(waiting_count bigint, approved_count bigint, passed_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    count(*) filter (
      where m.user_decision is null
        and m.selected_for_campaign = true
        and m.ai_status = 'completed'
        and m.ai_verdict = 'pass'
    ) as waiting_count,
    count(*) filter (where m.user_decision = 'approved') as approved_count,
    count(*) filter (where m.user_decision = 'skipped') as passed_count
  from public.campaign_job_matches m
  join public.campaigns c on c.id = m.campaign_id
  where c.id = p_campaign_id
    and c.user_id = auth.uid();
$$;

revoke all on function public.get_campaign_tracker_counts(uuid) from public, anon;
grant execute on function public.get_campaign_tracker_counts(uuid) to authenticated, service_role;
