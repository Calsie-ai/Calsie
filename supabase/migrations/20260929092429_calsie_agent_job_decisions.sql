-- Calsie owns user decisions; the Jobs project owns the referenced catalogue.
-- Cross-project job IDs cannot have a PostgreSQL foreign key here.
create table public.calsie_agent_job_decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  source_table text not null check (source_table in (
    'disability_jobs_apify', 'childcare_jobs_apify', 'agecare_jobs_apify'
  )),
  source_job_id bigint not null check (source_job_id > 0),
  decision text not null check (decision in ('approved', 'skipped')),
  job_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(job_snapshot) = 'object'),
  reviewed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, source_table, source_job_id)
);

create index calsie_agent_decisions_user_campaign_reviewed_idx
  on public.calsie_agent_job_decisions (user_id, campaign_id, reviewed_at desc);

alter table public.calsie_agent_job_decisions enable row level security;

revoke all on public.calsie_agent_job_decisions from anon, public;
grant select, insert, update on public.calsie_agent_job_decisions to authenticated;

create policy "Users read own campaign decisions"
  on public.calsie_agent_job_decisions for select to authenticated
  using (
    user_id = (select auth.uid()) and exists (
      select 1 from public.campaigns c
      where c.id = campaign_id and c.user_id = (select auth.uid())
    )
  );

create policy "Users add own campaign decisions"
  on public.calsie_agent_job_decisions for insert to authenticated
  with check (
    user_id = (select auth.uid()) and exists (
      select 1 from public.campaigns c
      where c.id = campaign_id and c.user_id = (select auth.uid())
    )
  );

create policy "Users update own campaign decisions"
  on public.calsie_agent_job_decisions for update to authenticated
  using (
    user_id = (select auth.uid()) and exists (
      select 1 from public.campaigns c
      where c.id = campaign_id and c.user_id = (select auth.uid())
    )
  )
  with check (
    user_id = (select auth.uid()) and exists (
      select 1 from public.campaigns c
      where c.id = campaign_id and c.user_id = (select auth.uid())
    )
  );
