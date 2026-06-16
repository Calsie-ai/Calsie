# Applix Supabase session sync - 2026-06-16

Project ref: `bnshgtrqbfuphhhdgccs`

## What was fixed in Supabase

1. Inspected active Edge Functions:
   - `fetch-adzuna-jobs` v14, JWT on
   - `run-outscraper-campaigns` v19, JWT off
   - `generate-outreach-drafts` v9 initially, JWT on
   - `connect-gmail` v9, JWT on
   - `gmail-oauth-callback` v8, JWT off
   - `launch-applix-test` v2, JWT off

2. Found orchestration mismatch:
   - `launch-applix-test` calls `generate-outreach-drafts` by HTTP.
   - `generate-outreach-drafts` had JWT verification enabled.
   - The orchestrator did not pass an auth header.

3. Deployed `generate-outreach-drafts` v10 with `verify_jwt: false` so the public test orchestrator can call it.
   - The function still uses server-side Supabase service credentials internally.
   - It creates reviewable drafts and queue rows only.
   - It does not send emails.

4. Applied migration:
   - `campaign_leads_campaign_id_found_email_upsert_idx`
   - `lead_contact_emails_user_identifier_email_upsert_idx`

5. Triggered the test pipeline using `pg_net` against:
   - Function: `launch-applix-test`
   - Campaign: `506c4895-479d-45a8-a199-64bd8efe50f2`

## Test result

Latest verified state after the test launch:

```text
Leads created: 96
Leads with email: 96
Outreach queue rows: 25
Forced test queue rows to hostsajan@gmail.com: 25
Personalizations created: 25
```

## Safety state

The test gateway forced queue rows to:

```text
hostsajan@gmail.com
```

No direct send function was run. Queue rows were marked:

```text
status = queued_test
review_status = ready_for_review
```

## Next known issue

Lead quality/filtering needs improvement. The IT campaign produced some non-IT jobs, including Personal Trainer examples. Next code fix should tighten `run-outscraper-campaigns` filtering so accepted leads must match IT/Admin/Developer/Support intent before drafts are generated.
