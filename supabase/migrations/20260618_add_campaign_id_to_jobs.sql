alter table public.jobs
  add column if not exists campaign_id uuid references public.campaigns(id) on delete set null;

create index if not exists jobs_campaign_created_idx on public.jobs(campaign_id, created_at desc);
