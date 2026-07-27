begin;

alter table public.campaigns
  add column if not exists source_purchase_id uuid
  references public.applix_purchases(id) on delete restrict;

create unique index if not exists campaigns_user_source_purchase_unique
  on public.campaigns (user_id, source_purchase_id)
  where source_purchase_id is not null;

comment on column public.campaigns.source_purchase_id is
  'Immutable source purchase used to create this template campaign exactly once.';

commit;
