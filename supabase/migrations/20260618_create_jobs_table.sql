create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  company text,
  location text,
  source text,
  apply_url text,
  description text,
  posted_at text,
  status text not null default 'new',
  created_at timestamptz not null default now()
);

alter table public.jobs enable row level security;

drop policy if exists "jobs_select_own" on public.jobs;
create policy "jobs_select_own"
  on public.jobs
  for select
  using (auth.uid() = user_id);

drop policy if exists "jobs_insert_own" on public.jobs;
create policy "jobs_insert_own"
  on public.jobs
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "jobs_update_own" on public.jobs;
create policy "jobs_update_own"
  on public.jobs
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists jobs_user_created_idx on public.jobs(user_id, created_at desc);
