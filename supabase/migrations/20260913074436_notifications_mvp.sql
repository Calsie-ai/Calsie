-- Notification inbox contract. Workflow functions create immutable content;
-- authenticated users may only change their own presentation state.
alter table public.user_notifications
  add column if not exists category text not null default 'account',
  add column if not exists priority text not null default 'info',
  add column if not exists action_url text,
  add column if not exists action_label text,
  add column if not exists entity_type text,
  add column if not exists entity_id uuid,
  add column if not exists dedupe_key text,
  add column if not exists source_event_id uuid,
  add column if not exists trace_id uuid,
  add column if not exists resolved_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists expires_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

update public.user_notifications
set status = case when read_at is null then 'unread' else 'read' end
where status not in ('unread', 'read', 'archived');

alter table public.user_notifications
  drop constraint if exists user_notifications_status_check,
  drop constraint if exists user_notifications_category_check,
  drop constraint if exists user_notifications_priority_check,
  drop constraint if exists user_notifications_action_url_check;

alter table public.user_notifications
  add constraint user_notifications_status_check check (status in ('unread', 'read', 'archived')),
  add constraint user_notifications_category_check check (category in ('attention', 'applications', 'campaigns', 'account')),
  add constraint user_notifications_priority_check check (priority in ('action_required', 'update', 'info')),
  add constraint user_notifications_action_url_check check (
    action_url is null or action_url ~ '^/dashboard\?panel=(overview|templates|resume|buildResume|gmail|campaign|approve|tracker|profile|notifications)([&][A-Za-z0-9_=%.-]+)*$'
  );

create unique index if not exists user_notifications_user_dedupe_unique
  on public.user_notifications (user_id, dedupe_key);

create index if not exists user_notifications_user_active_created_idx
  on public.user_notifications (user_id, created_at desc)
  where archived_at is null;

alter table public.user_notifications enable row level security;

drop policy if exists "Users can read own notifications" on public.user_notifications;
create policy "Users can read own notifications"
  on public.user_notifications for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can update own notifications" on public.user_notifications;
drop policy if exists "Users can update own notification state" on public.user_notifications;
create policy "Users can update own notification state"
  on public.user_notifications for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on table public.user_notifications from anon;
revoke insert, delete, truncate, references, trigger on table public.user_notifications from authenticated;
revoke update on table public.user_notifications from authenticated;
grant select on table public.user_notifications to authenticated;
grant update (status, read_at, archived_at) on table public.user_notifications to authenticated;

comment on column public.user_notifications.dedupe_key is
  'Stable server-generated key for one user outcome, preventing duplicate inbox items.';
comment on column public.user_notifications.trace_id is
  'Links the notification to the originating workflow trace without exposing provider payloads.';
