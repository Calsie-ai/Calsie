create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  campaign_id uuid,
  type text not null,
  title text not null,
  message text not null,
  status text not null default 'unread',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists idx_user_notifications_user_status_created
  on public.user_notifications (user_id, status, created_at desc);

create index if not exists idx_user_notifications_campaign_created
  on public.user_notifications (campaign_id, created_at desc);

comment on table public.user_notifications is
  'Safe additive notification table for daily Applix review prompts. TODO: enable RLS after matching the project user notification policy pattern.';
