alter table public.jobs
  add column if not exists campaign_id uuid references public.campaigns(id) on delete cascade;

create index if not exists jobs_campaign_created_idx
  on public.jobs(campaign_id, created_at desc);

create index if not exists jobs_user_campaign_created_idx
  on public.jobs(user_id, campaign_id, created_at desc);
