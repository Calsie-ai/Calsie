-- Allow signed-in users to load their own saved jobs in the Job Tracker.
-- Without this policy, the browser Supabase client can receive 0 rows even when jobs exist.

alter table public.jobs enable row level security;

drop policy if exists "Users can read their own jobs" on public.jobs;
create policy "Users can read their own jobs"
on public.jobs
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own jobs" on public.jobs;
create policy "Users can insert their own jobs"
on public.jobs
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own jobs" on public.jobs;
create policy "Users can update their own jobs"
on public.jobs
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
