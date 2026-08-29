begin;

create or replace function public.applix_activate_purchased_template_campaign(
  p_user_id uuid,
  p_purchase_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_purchase public.applix_purchases%rowtype;
  v_template public.campaign_templates%rowtype;
  v_campaign_id uuid;
begin
  select * into v_purchase
  from public.applix_purchases
  where id = p_purchase_id and user_id = p_user_id
  for update;

  if not found then
    raise exception 'purchase_not_found';
  end if;

  if v_purchase.purchase_status not in ('paid', 'partially_refunded')
     or v_purchase.payment_status not in ('paid', 'no_payment_required') then
    raise exception 'purchase_not_confirmed';
  end if;

  select id into v_campaign_id
  from public.campaigns
  where user_id = p_user_id and source_purchase_id = p_purchase_id;

  if v_campaign_id is not null then
    return v_campaign_id;
  end if;

  select * into v_template
  from public.campaign_templates
  where id = v_purchase.template_id and is_active = true;

  if not found then
    raise exception 'template_not_available';
  end if;

  insert into public.campaigns (
    user_id, name, location, target_business_type, search, filters,
    outreach, status, template_id, source_purchase_id
  ) values (
    p_user_id,
    coalesce(v_template.campaign_name, v_template.title || ' Campaign'),
    coalesce(nullif(v_purchase.postcode, ''), v_template.location),
    v_template.role,
    jsonb_build_object(
      'target_role', v_template.role,
      'target_location', coalesce(nullif(v_purchase.postcode, ''), v_template.location),
      'query_terms', v_template.query_terms,
      'include_title_terms', v_template.include_title_terms,
      'exclude_title_terms', v_template.exclude_title_terms,
      'description_keywords', v_template.description_keywords,
      'job_types', v_template.job_types,
      'posted_within_days', coalesce(v_template.posted_within_days, 30),
      'fetch_frequency', 'daily',
      'campaign_days', 30,
      'daily_job_limit', 24,
      'template_id', v_template.id,
      'source_purchase_id', v_purchase.id
    ),
    jsonb_build_object(
      'location', coalesce(nullif(v_purchase.postcode, ''), v_template.location),
      'job_types', v_template.job_types,
      'posted_within_days', coalesce(v_template.posted_within_days, 30)
    ),
    jsonb_build_object('active', false, 'scheduled', false, 'daily_limit', 24, 'campaign_days', 30),
    'draft',
    v_template.id,
    v_purchase.id
  )
  on conflict (user_id, source_purchase_id) where source_purchase_id is not null
  do update set updated_at = public.campaigns.updated_at
  returning id into v_campaign_id;

  return v_campaign_id;
end;
$$;

revoke all on function public.applix_activate_purchased_template_campaign(uuid, uuid) from public, anon, authenticated;
grant execute on function public.applix_activate_purchased_template_campaign(uuid, uuid) to service_role;

commit;
