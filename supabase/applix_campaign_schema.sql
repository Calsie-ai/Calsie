-- Applix campaign, scraping, enrichment, outreach, and dashboard schema
-- Run this in Supabase SQL Editor.

create extension if not exists pgcrypto;

-- 1. Main 30-day campaign created when user clicks Launch campaign.
create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  status text default 'queued',

  target_role text not null,
  industry text,
  target_keywords text[] default '{}',

  selected_address text,
  google_place_id text,
  latitude numeric,
  longitude numeric,
  radius_km integer default 20,

  resume_source text default 'applix_profile',
  resume_profile_id uuid,
  uploaded_resume_name text,
  uploaded_resume_url text,

  daily_limit integer default 25,
  campaign_days integer default 30,
  total_target integer default 750,
  total_scraped integer default 0,
  total_enriched integer default 0,
  total_queued integer default 0,
  total_sent integer default 0,
  total_replied integer default 0,
  total_failed integer default 0,

  started_at timestamp with time zone,
  ends_at timestamp with time zone,
  completed_at timestamp with time zone,
  error_message text,

  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create index if not exists campaigns_user_id_idx on campaigns(user_id);
create index if not exists campaigns_status_idx on campaigns(status);
create index if not exists campaigns_created_at_idx on campaigns(created_at desc);

-- 2. Raw company/job/company-opportunity leads inserted by Python scraper.
create table if not exists company_leads (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns(id) on delete cascade,
  user_id uuid,

  company_name text not null,
  business_category text,
  industry_guess text,
  website text,
  domain text,
  address text,
  phone text,

  google_place_id text,
  latitude numeric,
  longitude numeric,
  distance_km numeric,

  source text,
  source_url text,
  raw_data jsonb default '{}'::jsonb,

  relevance_score numeric default 0,
  relevance_reason text,
  duplicate_key text,
  status text default 'new',

  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create index if not exists company_leads_campaign_id_idx on company_leads(campaign_id);
create index if not exists company_leads_user_id_idx on company_leads(user_id);
create index if not exists company_leads_status_idx on company_leads(status);
create index if not exists company_leads_distance_idx on company_leads(distance_km);
create index if not exists company_leads_duplicate_key_idx on company_leads(duplicate_key);

-- Avoid duplicate company websites inside the same campaign when domain is known.
create unique index if not exists company_leads_campaign_domain_unique
on company_leads(campaign_id, domain)
where domain is not null and domain <> '';

-- Avoid duplicate Google places inside the same campaign when place id is known.
create unique index if not exists company_leads_campaign_place_unique
on company_leads(campaign_id, google_place_id)
where google_place_id is not null and google_place_id <> '';

-- 3. Enrichment details created by n8n/OpenAI after a lead is scraped.
create table if not exists lead_enrichments (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns(id) on delete cascade,
  lead_id uuid references company_leads(id) on delete cascade,
  user_id uuid,

  enrichment_status text default 'pending',
  contact_email text,
  contact_name text,
  contact_role text,
  contact_confidence numeric default 0,

  careers_url text,
  contact_url text,
  about_url text,
  linkedin_url text,
  best_source_url text,

  company_summary text,
  hiring_signal text,
  opportunity_angle text,
  relevance_reason text,
  confidence_score numeric default 0,

  found_emails text[] default '{}',
  found_phones text[] default '{}',
  raw_data jsonb default '{}'::jsonb,
  error_message text,

  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create index if not exists lead_enrichments_campaign_id_idx on lead_enrichments(campaign_id);
create index if not exists lead_enrichments_lead_id_idx on lead_enrichments(lead_id);
create index if not exists lead_enrichments_status_idx on lead_enrichments(enrichment_status);
create index if not exists lead_enrichments_contact_email_idx on lead_enrichments(contact_email);

-- One enrichment row per lead.
create unique index if not exists lead_enrichments_lead_unique on lead_enrichments(lead_id);

-- 4. AI-generated outreach/resume drafts before sending.
create table if not exists outreach_drafts (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns(id) on delete cascade,
  lead_id uuid references company_leads(id) on delete cascade,
  enrichment_id uuid references lead_enrichments(id) on delete set null,
  user_id uuid,

  draft_status text default 'drafted',
  subject text,
  email_body text,
  resume_summary text,
  cover_note text,
  personalization_notes text,
  ai_model text,
  ai_raw jsonb default '{}'::jsonb,

  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create index if not exists outreach_drafts_campaign_id_idx on outreach_drafts(campaign_id);
create index if not exists outreach_drafts_lead_id_idx on outreach_drafts(lead_id);
create index if not exists outreach_drafts_status_idx on outreach_drafts(draft_status);

-- 5. Email queue. n8n/Gmail worker sends max 25 per user per day.
create table if not exists outreach_queue (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns(id) on delete cascade,
  lead_id uuid references company_leads(id) on delete cascade,
  draft_id uuid references outreach_drafts(id) on delete set null,
  user_id uuid,

  recipient_email text,
  recipient_name text,
  subject text,
  body text,
  resume_url text,

  status text default 'queued',
  scheduled_for date default current_date,
  sent_at timestamp with time zone,
  replied_at timestamp with time zone,
  bounced_at timestamp with time zone,

  provider text default 'gmail',
  provider_message_id text,
  thread_id text,
  error_message text,

  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create index if not exists outreach_queue_campaign_id_idx on outreach_queue(campaign_id);
create index if not exists outreach_queue_user_id_idx on outreach_queue(user_id);
create index if not exists outreach_queue_status_idx on outreach_queue(status);
create index if not exists outreach_queue_scheduled_for_idx on outreach_queue(scheduled_for);
create index if not exists outreach_queue_recipient_email_idx on outreach_queue(recipient_email);

-- Prevent duplicate sends to same email inside the same campaign.
create unique index if not exists outreach_queue_campaign_recipient_unique
on outreach_queue(campaign_id, recipient_email)
where recipient_email is not null and recipient_email <> '';

-- 6. Daily quota tracking for 25/day rule.
create table if not exists campaign_daily_usage (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns(id) on delete cascade,
  user_id uuid,
  usage_date date default current_date,

  scraped_count integer default 0,
  enriched_count integer default 0,
  queued_count integer default 0,
  sent_count integer default 0,
  failed_count integer default 0,
  replied_count integer default 0,

  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create unique index if not exists campaign_daily_usage_campaign_date_unique
on campaign_daily_usage(campaign_id, usage_date);

create index if not exists campaign_daily_usage_user_date_idx on campaign_daily_usage(user_id, usage_date);

-- 7. Report table for dashboard summary.
create table if not exists campaign_reports (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns(id) on delete cascade,
  user_id uuid,

  total_scraped integer default 0,
  total_inside_radius integer default 0,
  total_duplicates integer default 0,
  total_enriched integer default 0,
  total_ready_for_send integer default 0,
  total_queued integer default 0,
  total_sent integer default 0,
  total_failed integer default 0,
  total_replies integer default 0,

  last_activity text,
  last_error text,
  report_data jsonb default '{}'::jsonb,

  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create unique index if not exists campaign_reports_campaign_unique on campaign_reports(campaign_id);
create index if not exists campaign_reports_user_id_idx on campaign_reports(user_id);

-- 8. Event log for debugging and dashboard timeline.
create table if not exists campaign_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns(id) on delete cascade,
  lead_id uuid references company_leads(id) on delete set null,
  user_id uuid,

  event_type text not null,
  event_title text,
  event_message text,
  event_data jsonb default '{}'::jsonb,

  created_at timestamp with time zone default now()
);

create index if not exists campaign_events_campaign_id_idx on campaign_events(campaign_id);
create index if not exists campaign_events_event_type_idx on campaign_events(event_type);
create index if not exists campaign_events_created_at_idx on campaign_events(created_at desc);

-- 9. Helper function to refresh campaign report counts.
create or replace function refresh_campaign_report(target_campaign_id uuid)
returns void
language plpgsql
as $$
begin
  insert into campaign_reports (
    campaign_id,
    user_id,
    total_scraped,
    total_inside_radius,
    total_duplicates,
    total_enriched,
    total_ready_for_send,
    total_queued,
    total_sent,
    total_failed,
    total_replies,
    last_activity,
    updated_at
  )
  select
    c.id,
    c.user_id,
    (select count(*) from company_leads l where l.campaign_id = c.id),
    (select count(*) from company_leads l where l.campaign_id = c.id and (l.status is null or l.status <> 'outside_radius')),
    (select count(*) from company_leads l where l.campaign_id = c.id and l.status = 'duplicate'),
    (select count(*) from lead_enrichments e where e.campaign_id = c.id and e.enrichment_status = 'enriched'),
    (select count(*) from company_leads l where l.campaign_id = c.id and l.status = 'ready_for_email'),
    (select count(*) from outreach_queue q where q.campaign_id = c.id and q.status in ('queued','ready')),
    (select count(*) from outreach_queue q where q.campaign_id = c.id and q.status = 'sent'),
    (select count(*) from outreach_queue q where q.campaign_id = c.id and q.status = 'failed'),
    (select count(*) from outreach_queue q where q.campaign_id = c.id and q.status = 'replied'),
    'Report refreshed',
    now()
  from campaigns c
  where c.id = target_campaign_id
  on conflict (campaign_id)
  do update set
    total_scraped = excluded.total_scraped,
    total_inside_radius = excluded.total_inside_radius,
    total_duplicates = excluded.total_duplicates,
    total_enriched = excluded.total_enriched,
    total_ready_for_send = excluded.total_ready_for_send,
    total_queued = excluded.total_queued,
    total_sent = excluded.total_sent,
    total_failed = excluded.total_failed,
    total_replies = excluded.total_replies,
    last_activity = excluded.last_activity,
    updated_at = now();
end;
$$;

-- 10. Optional updated_at helper.
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_campaigns_updated_at
before update on campaigns
for each row execute function set_updated_at();

create trigger set_company_leads_updated_at
before update on company_leads
for each row execute function set_updated_at();

create trigger set_lead_enrichments_updated_at
before update on lead_enrichments
for each row execute function set_updated_at();

create trigger set_outreach_drafts_updated_at
before update on outreach_drafts
for each row execute function set_updated_at();

create trigger set_outreach_queue_updated_at
before update on outreach_queue
for each row execute function set_updated_at();

create trigger set_campaign_daily_usage_updated_at
before update on campaign_daily_usage
for each row execute function set_updated_at();

create trigger set_campaign_reports_updated_at
before update on campaign_reports
for each row execute function set_updated_at();
