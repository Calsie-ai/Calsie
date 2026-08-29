do $$
begin
  if to_regprocedure('public.get_review_jobs(uuid)') is not null then
    execute 'revoke all on function public.get_review_jobs(uuid) from public';
    execute 'revoke all on function public.get_review_jobs(uuid) from anon';
    execute 'grant execute on function public.get_review_jobs(uuid) to authenticated';
    execute 'grant execute on function public.get_review_jobs(uuid) to service_role';
  end if;

  if to_regprocedure('public.get_review_jobs(uuid,integer)') is not null then
    execute 'revoke all on function public.get_review_jobs(uuid, integer) from public';
    execute 'revoke all on function public.get_review_jobs(uuid, integer) from anon';
    execute 'grant execute on function public.get_review_jobs(uuid, integer) to authenticated';
    execute 'grant execute on function public.get_review_jobs(uuid, integer) to service_role';
  end if;

  if to_regprocedure('public.decide_campaign_job(uuid,text)') is not null then
    execute 'revoke all on function public.decide_campaign_job(uuid, text) from public';
    execute 'revoke all on function public.decide_campaign_job(uuid, text) from anon';
    execute 'grant execute on function public.decide_campaign_job(uuid, text) to authenticated';
    execute 'grant execute on function public.decide_campaign_job(uuid, text) to service_role';
  end if;

  if to_regprocedure('public.decide_campaign_job(uuid,uuid,text)') is not null then
    execute 'revoke all on function public.decide_campaign_job(uuid, uuid, text) from public';
    execute 'revoke all on function public.decide_campaign_job(uuid, uuid, text) from anon';
    execute 'grant execute on function public.decide_campaign_job(uuid, uuid, text) to authenticated';
    execute 'grant execute on function public.decide_campaign_job(uuid, uuid, text) to service_role';
  end if;
end;
$$;