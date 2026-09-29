-- A purchased draft can be reviewed before a separate campaign launch.
-- Check the linked purchase under the caller's identity, without exposing
-- purchase records to the browser or the Jobs project.
create or replace function public.calsie_is_paid_agent_campaign(p_campaign_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.campaigns c
    join public.applix_purchases p on p.id = c.source_purchase_id
    where c.id = p_campaign_id
      and c.user_id = (select auth.uid())
      and p.user_id = (select auth.uid())
      and p.template_id = c.template_id
      and p.purchase_status in ('paid', 'partially_refunded')
      and p.payment_status in ('paid', 'no_payment_required')
  );
$$;

revoke all on function public.calsie_is_paid_agent_campaign(uuid) from public, anon;
grant execute on function public.calsie_is_paid_agent_campaign(uuid) to authenticated;
