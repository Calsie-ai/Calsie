# Company Contact Pool and Queue

This branch adds a production-safe path for preparing many approved applications without making a single Edge Function request do all the expensive work.

## Why the Pool Exists

`company_contacts_pool` is a global reusable company contact cache. It is shared across campaigns and users, so Applix can avoid repeatedly searching for the same company email.

A pool row is reusable only when:

- `status = 'active'`
- `confidence >= 70`
- `email` is valid and not blocked
- the email is not from blocked infrastructure, ATS, job-board, Sentry, ingest, test, or no-reply sources
- when an official website is known, same-domain email is preferred

A pool hit updates matching `jobs.extracted_email` and increments `use_count` without calling Outscraper.

## Why the Queue Exists

`enrich-job-emails` can still be used for direct single-job tests and small manual runs. For production, the app should avoid running 25 website/email hunts inside one request.

The scalable path is:

1. User approves individual jobs.
2. User clicks `Prepare approved applications`.
3. `prepare-approved-applications` checks the pool.
4. Pool hits update `jobs` immediately.
5. Missing companies are inserted or merged into `company_enrichment_queue`.
6. `process-company-enrichment-queue` processes 1-5 companies per run.
7. Found contacts are saved to `company_contacts_pool` and `lead_contact_emails`.
8. Matching jobs are updated.
9. `generate-job-outreach-drafts` creates draft `outreach_queue` rows.
10. Sending still requires approved queued outreach and is handled by `send-queued-outreach`.

## User Requests 25 Applications

The dashboard can ask for 25 approved applications, but the backend does not run 25 full email hunts synchronously.

`prepare-approved-applications` returns quickly with counts:

- `approved_jobs_seen`
- `companies_seen`
- `pool_hits`
- `queued_companies`
- `already_ready`

The queue worker then handles small chunks, usually 1-2 companies per scheduled invocation.

## Required Secrets

Do not hardcode these values.

```text
OUTSCRAPER_API_KEY
OUTSCRAPER_JOBS_API_URL
OUTSCRAPER_INDEED_BASE_URL
WEBSITE_SEARCH_API_URL
WEBSITE_SEARCH_API_KEY
EMAIL_FINDER_URL
EMAIL_FINDER_API_KEY
CRON_SECRET or APPLIX_CRON_SECRET
```

Expected provider URLs:

```text
OUTSCRAPER_JOBS_API_URL=https://api.outscraper.cloud/indeed-search
OUTSCRAPER_INDEED_BASE_URL=https://au.indeed.com/jobs
WEBSITE_SEARCH_API_URL=https://api.outscraper.cloud/company-website-finder?query={query}&async=false
EMAIL_FINDER_URL=https://api.outscraper.cloud/emails-and-contacts?query={query}&async=false
```

## Manual Worker Run

Run a small worker batch:

```bash
curl -X POST "$SUPABASE_URL/functions/v1/process-company-enrichment-queue" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"limit":2,"max_company_searches":2,"max_email_finder_calls":2}'
```

Prepare approved applications from the dashboard or with a user JWT:

```bash
curl -X POST "$SUPABASE_URL/functions/v1/prepare-approved-applications" \
  -H "Authorization: Bearer $USER_JWT" \
  -H "Content-Type: application/json" \
  -d '{"campaign_id":"<campaign-id>","limit":25}'
```

## Sending Limit

`send-queued-outreach` sends only rows where:

- `status = 'queued'`
- `review_status = 'approved'`
- `scheduled_send_at <= now()`

It now enforces:

- max 25 sent rows per rolling 24 hours per `user_identifier`
- max 5 sent rows per rolling hour per `user_identifier`

When a limit is reached, the row stays queued and is rescheduled. No Gmail send call is made.

## Manual Approval Rules

- Individual job approval only marks the job approved.
- Email enrichment never sends.
- Draft generation creates drafts by default.
- Sending only happens through `send-queued-outreach` after a row is queued and approved.

## Bad Email Troubleshooting

Bad contacts are blocked by migration and runtime filters. Examples:

- `sentry.io`
- `ingest`
- `.ingest.`
- `noreply`
- `no-reply`
- `privacy@`
- `accounts@`
- `billing@`
- `example@`
- `test@`
- `support@indeed`
- known unrelated examples such as `info@cserickson.com`

Known ATS/job-board domains are rejected as official company websites, including Indeed, Seek, LinkedIn, Greenhouse, Lever, Ashby, Workday jobs, Teamtailor, Jobvite, BambooHR, and `jobs.employmenthero.com`.

`employmenthero.com` itself is not blocked, because Employment Hero can be a real employer domain. Only `jobs.employmenthero.com` is blocked as an ATS/job-board page.

## Verification Scenarios

1. Single company test:
   - Approve one job.
   - Run `prepare-approved-applications`.
   - Run `process-company-enrichment-queue` with `limit = 1`.
   - Confirm website/email is saved and job gets `extracted_email`.

2. Pool hit test:
   - Approve another job at the same company.
   - Run `prepare-approved-applications`.
   - Confirm no provider call is required and pool `use_count` increments.

3. Queue test:
   - Approve 25 jobs.
   - Run `prepare-approved-applications`.
   - Confirm the response returns quickly and missing companies are queued.

4. Bad email test:
   - Seed or discover Sentry/ingest/ATS/unrelated emails.
   - Confirm they are not reused from the pool and are not saved as valid job contacts.

5. Send limit test:
   - Queue more than 25 approved rows for one `user_identifier`.
   - Run `send-queued-outreach` repeatedly.
   - Confirm only 25 send in a rolling 24-hour window and later rows are rescheduled.

## Notes

`outscraper-jobs` remains the job-fetch source and is intentionally untouched in this branch. Daily job-fetch notifications can be wired there later using `user_notifications`, but this branch avoids changing that function to protect the existing fetch flow.
