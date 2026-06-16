-- Sync with production fix applied on 2026-06-16.
-- These plain unique indexes are required by PostgREST upsert calls that use:
--   onConflict: "campaign_id,found_email"
--   onConflict: "user_identifier,email"
-- Existing partial/expression indexes are useful for case-insensitive lookups, but they do not satisfy
-- the exact column conflict targets used by the Edge Functions.

create unique index if not exists campaign_leads_campaign_id_found_email_upsert_idx
on public.campaign_leads (campaign_id, found_email);

create unique index if not exists lead_contact_emails_user_identifier_email_upsert_idx
on public.lead_contact_emails (user_identifier, email);
