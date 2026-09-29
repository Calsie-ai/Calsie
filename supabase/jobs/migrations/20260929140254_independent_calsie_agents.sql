-- Fresh standalone Calsie application state in the Jobs Supabase project.
-- Job catalogue rows stay in the existing category-specific Apify tables.
create table public.calsie_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  location text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.calsie_agents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('disability','aged_care','childcare')),
  name text not null,
  status text not null default 'active' check (status in ('active','paused')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, category),
  unique (id, user_id, category)
);

-- This temporary table was empty when inspected. Reuse it for the new app.
alter table public.calsie_job_swipe_decisions rename column main_user_id to user_id;
alter table public.calsie_job_swipe_decisions rename column campaign_id to agent_id;
alter table public.calsie_job_swipe_decisions
  add column job_snapshot jsonb not null default '{}'::jsonb,
  add constraint calsie_swipes_snapshot_object check (jsonb_typeof(job_snapshot) = 'object'),
  add constraint calsie_swipes_user_fk foreign key (user_id) references auth.users(id) on delete cascade,
  add constraint calsie_swipes_agent_fk foreign key (agent_id, user_id, category)
    references public.calsie_agents(id, user_id, category) on delete cascade;

create index calsie_swipes_agent_reviewed_idx
  on public.calsie_job_swipe_decisions (agent_id, reviewed_at desc);

alter table public.calsie_profiles enable row level security;
alter table public.calsie_agents enable row level security;
alter table public.calsie_job_swipe_decisions enable row level security;

revoke all on public.calsie_profiles, public.calsie_agents, public.calsie_job_swipe_decisions from anon, public;
grant select, insert, update on public.calsie_profiles, public.calsie_agents to authenticated;
grant select on public.calsie_job_swipe_decisions to authenticated;
revoke insert, update, delete on public.calsie_job_swipe_decisions from authenticated;

create policy "Read own Calsie profile" on public.calsie_profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "Create own Calsie profile" on public.calsie_profiles
  for insert to authenticated with check (id = (select auth.uid()));
create policy "Update own Calsie profile" on public.calsie_profiles
  for update to authenticated using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "Read own Calsie agents" on public.calsie_agents
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Create own Calsie agents" on public.calsie_agents
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Update own Calsie agents" on public.calsie_agents
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Read own Calsie decisions" on public.calsie_job_swipe_decisions
  for select to authenticated using (user_id = (select auth.uid()));
