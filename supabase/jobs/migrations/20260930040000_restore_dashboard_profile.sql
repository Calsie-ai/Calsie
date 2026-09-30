-- Additive restoration of owned workspace state in NEW project only.
-- Rollback: revert UI first; retain profile data and uploaded files.
alter table public.calsie_profiles
  add column email text,
  add column avatar_url text,
  add column preferences jsonb not null default '{}'::jsonb,
  add column resume_file_path text,
  add column resume_file_name text,
  add column resume_file_type text,
  add column resume_draft jsonb not null default '{}'::jsonb;
alter table public.calsie_agents add column preferences jsonb not null default '{}'::jsonb;

create table public.calsie_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid references public.calsie_agents(id) on delete cascade,
  type text not null,
  category text not null check (category in ('attention','applications','campaigns','account')),
  priority text not null check (priority in ('action_required','update','info')),
  title text not null,
  message text not null,
  status text not null default 'unread' check (status in ('unread','read','archived')),
  action_url text,
  action_label text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  resolved_at timestamptz,
  archived_at timestamptz
);
create index calsie_notifications_user_created_idx on public.calsie_notifications(user_id, created_at desc);
alter table public.calsie_notifications enable row level security;
revoke all on public.calsie_notifications from public, anon, authenticated;
grant select on public.calsie_notifications to authenticated;
grant update (status, read_at, archived_at) on public.calsie_notifications to authenticated;
create policy "Read own workspace notifications" on public.calsie_notifications
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Update own workspace notifications" on public.calsie_notifications
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Existing private resumes bucket already has owner-folder policies.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg','image/png','image/webp']);
create policy "Calsie avatar insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Calsie avatar read" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Calsie avatar update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Calsie avatar delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
