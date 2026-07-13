create table if not exists public.applix_admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin' check (role in ('owner', 'admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.campaign_templates (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  role text not null,
  location text not null default 'Sydney NSW',
  description text not null default '',
  category text not null default 'General',
  query_terms text[] not null default '{}',
  include_title_terms text[] not null default '{}',
  exclude_title_terms text[] not null default '{}',
  description_keywords text[] not null default '{}',
  job_types text[] not null default array['Casual','Part-time','Full-time'],
  posted_within_days integer not null default 30 check (posted_within_days between 1 and 365),
  daily_job_limit integer not null default 24 check (daily_job_limit between 1 and 500),
  daily_email_limit integer not null default 24 check (daily_email_limit between 1 and 500),
  hourly_email_limit integer not null default 1 check (hourly_email_limit between 1 and 100),
  campaign_days integer not null default 30 check (campaign_days between 1 and 365),
  total_cap integer not null default 720 check (total_cap between 1 and 100000),
  require_email boolean not null default true,
  require_user_approval boolean not null default true,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) default auth.uid(),
  updated_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.applix_admin_users enable row level security;
alter table public.campaign_templates enable row level security;

grant select on public.applix_admin_users to authenticated;
grant select, insert, update, delete on public.campaign_templates to authenticated;

create policy "Admins can view their own admin membership"
on public.applix_admin_users for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Authenticated users can view active campaign templates"
on public.campaign_templates for select
to authenticated
using (
  is_active = true or exists (
    select 1 from public.applix_admin_users admins
    where admins.user_id = (select auth.uid())
  )
);

create policy "Admins can create campaign templates"
on public.campaign_templates for insert
to authenticated
with check (
  exists (select 1 from public.applix_admin_users admins where admins.user_id = (select auth.uid()))
  and created_by = (select auth.uid())
  and updated_by = (select auth.uid())
);

create policy "Admins can update campaign templates"
on public.campaign_templates for update
to authenticated
using (exists (select 1 from public.applix_admin_users admins where admins.user_id = (select auth.uid())))
with check (
  exists (select 1 from public.applix_admin_users admins where admins.user_id = (select auth.uid()))
  and updated_by = (select auth.uid())
);

create policy "Admins can delete campaign templates"
on public.campaign_templates for delete
to authenticated
using (exists (select 1 from public.applix_admin_users admins where admins.user_id = (select auth.uid())));

create or replace function public.set_campaign_template_audit_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.set_campaign_template_audit_fields() from public, anon, authenticated;

create trigger set_campaign_template_audit_fields
before insert or update on public.campaign_templates
for each row execute function public.set_campaign_template_audit_fields();
