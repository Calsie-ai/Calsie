create table if not exists public.company_enrichment_queue_jobs (
  id uuid primary key default gen_random_uuid(),
  queue_id uuid references public.company_enrichment_queue(id) on delete cascade,
  job_id uuid not null,
  user_id uuid,
  campaign_id uuid,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  unique(queue_id, job_id)
);

create index if not exists idx_company_enrichment_queue_jobs_queue_status
  on public.company_enrichment_queue_jobs (queue_id, status);

create index if not exists idx_company_enrichment_queue_jobs_job
  on public.company_enrichment_queue_jobs (job_id);

create index if not exists idx_company_enrichment_queue_jobs_user_campaign
  on public.company_enrichment_queue_jobs (user_id, campaign_id, status);

-- Backfill mapping rows for any queue rows that were created before this migration.
insert into public.company_enrichment_queue_jobs (queue_id, job_id, user_id, campaign_id, status)
select q.id, job_id, q.user_id, q.campaign_id, 'pending'
from public.company_enrichment_queue q
cross join lateral unnest(coalesce(q.job_ids, '{}'::uuid[])) as job_id
where job_id is not null
on conflict (queue_id, job_id) do nothing;

-- Safe cleanup: block known bad contacts instead of deleting history.
update public.lead_contact_emails
set status = 'blocked',
    updated_at = now()
where coalesce(status, '') <> 'blocked'
  and (
    email ilike '%sentry%'
    or email ilike '%ingest%'
    or email ilike '%@zalando.de'
    or lower(email) = 'info@cserickson.com'
  );

update public.company_contacts_pool
set status = 'blocked',
    updated_at = now()
where coalesce(status, '') <> 'blocked'
  and (
    email ilike '%sentry%'
    or email ilike '%ingest%'
    or email ilike '%@zalando.de'
    or lower(email) = 'info@cserickson.com'
  );

alter table public.company_contacts_pool enable row level security;
alter table public.company_enrichment_queue enable row level security;
alter table public.company_enrichment_queue_jobs enable row level security;
alter table public.user_notifications enable row level security;

-- Pool and queue tables intentionally have no browser write policies.
-- Service-role Edge Functions bypass RLS. This prevents client-side tampering.

drop policy if exists "Users can read own notifications" on public.user_notifications;
create policy "Users can read own notifications"
  on public.user_notifications
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can update own notifications" on public.user_notifications;
create policy "Users can update own notifications"
  on public.user_notifications
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

comment on table public.company_enrichment_queue_jobs is
  'Per-job consumers waiting on a company-level enrichment row. Prevents one shared company queue row from overwriting user/campaign context across many users.';
