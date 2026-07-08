# Applix Action Build Plan

_Last updated: 2026-07-09_

This document compiles the current production direction for Applix after the company contact pool, enrichment queue, cron worker, and manual send safety work.

## Current Goal

Applix should let a user approve jobs, prepare safe application drafts, reuse known employer contacts, and send only after explicit user confirmation.

The core production rule is:

```text
Find jobs -> user approves -> prepare applications -> enrich missing emails -> create drafts -> user reviews -> user confirms send
```

Applix must not automatically send emails just because a queue or cron exists.

## Current Backend Status

### Completed

- `company_contacts_pool` exists as a reusable employer contact cache.
- `company_enrichment_queue` exists for company-level enrichment work.
- `company_enrichment_queue_jobs` maps each queue row back to each user, campaign, and job.
- `prepare-approved-applications` prepares approved jobs by checking the pool first and queuing missing-email companies.
- `process-company-enrichment-queue` processes company enrichment safely.
- `generate-job-outreach-drafts` creates draft outreach rows by default.
- `send-queued-outreach` sends only when explicitly confirmed.
- Sending safety guard is deployed.
- Autonomous sending from GitHub Actions or cron is blocked unless the request includes `send_now=true` or `confirm_send=true`.
- Paused, draft, pending, stopped, cancelled, archived, and inactive campaigns are protected from sending.
- Daily and hourly send limits remain enforced.

### Current Safety Rules

- `process-company-enrichment-queue` is safe for cron.
- `send-queued-outreach` must not be scheduled as an autonomous GitHub Action or cron.
- `send-queued-outreach` requires explicit confirmation:

```json
{
  "send_now": true
}
```

or:

```json
{
  "confirm_send": true
}
```

Without one of those fields, the function returns a safe skip response and does not send.

## Production Flow

### 1. Job approval

User approves one or more jobs from the website.

Approval should update the job to something equivalent to:

```text
user_decision = approved
```

or:

```text
status = approved
```

### 2. Prepare applications

Frontend should call:

```text
POST /functions/v1/prepare-approved-applications
```

with body:

```json
{
  "campaign_id": "<campaign-id>",
  "limit": 25
}
```

This function:

- confirms the logged-in user owns the campaign,
- loads approved jobs,
- checks `company_contacts_pool`,
- updates jobs immediately when pool contact exists,
- queues missing companies into `company_enrichment_queue`,
- creates drafts for already-ready jobs.

### 3. Enrichment cron

Only this function should run automatically:

```text
process-company-enrichment-queue
```

Cron body:

```json
{
  "limit": 5,
  "max_email_finder_calls": 5
}
```

The function currently hard-caps itself internally to 1 company per run, even when the request sends `limit: 5`.

This prevents:

- Supabase idle timeout,
- worker resource limit errors,
- accidental multi-company expensive requests,
- stuck processing rows.

### 4. Draft creation

When an email is found or reused from pool, the worker updates the jobs and calls draft generation.

Draft rows should appear in:

```text
outreach_queue
```

The expected safe draft state is:

```text
status = queued
review_status = draft or approved depending UI review flow
```

The user must review before sending.

### 5. Manual send only

Sending should only happen from a user action in the website.

The manual send button should call:

```text
POST /functions/v1/send-queued-outreach
```

with:

```json
{
  "queue_id": "<outreach-queue-id>",
  "send_now": true
}
```

or:

```json
{
  "queue_id": "<outreach-queue-id>",
  "confirm_send": true
}
```

Do not schedule this function.

## Cron Setup

The cron should call only:

```text
process-company-enrichment-queue
```

Recommended schedule:

```text
* * * * *
```

That means every minute.

Recommended SQL shape:

```sql
select cron.schedule(
  'process-company-enrichment-queue-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://bnshgtrqbfuphhhdgccs.supabase.co/functions/v1/process-company-enrichment-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '<CRON_SECRET>'
    ),
    body := jsonb_build_object(
      'limit', 5,
      'max_email_finder_calls', 5
    )
  );
  $$
);
```

Do not paste real secrets into GitHub, frontend code, or public chat.

## GitHub Actions Rule

Keep this workflow disabled for now:

```text
Send queued outreach
```

Reason:

- it is for sending,
- sending must be manual for now,
- backend is protected, but the safest product rule is no autonomous email sending.

The GitHub Action can be revisited later after there is a clear user-controlled scheduling setting.

## Campaign Pause Rule

Campaigns with these statuses should not send:

```text
paused
pause
stopped
cancelled
canceled
archived
draft
pending
```

A paused campaign can still keep historical jobs and drafts, but sending must be blocked.

Recommended user-facing statuses:

```text
draft
active
paused
completed
```

## Frontend Work Still Needed

### A. Confirm prepare button wiring

The website must include a button or action such as:

```text
Prepare approved applications
```

It should call `prepare-approved-applications` with the signed-in user's JWT.

Success response should show counts:

- approved jobs seen,
- pool hits,
- queued companies,
- jobs updated from pool,
- drafts created.

### B. Manual send button

The website send button must send with explicit confirmation:

```json
{
  "queue_id": "<id>",
  "send_now": true
}
```

or:

```json
{
  "queue_id": "<id>",
  "confirm_send": true
}
```

Do not call `send-queued-outreach` without that confirmation field.

### C. Pause campaign button

The frontend should support:

```text
Pause campaign
Resume campaign
```

Pause should set:

```text
campaigns.status = paused
```

Resume should set:

```text
campaigns.status = active
```

The backend send function already respects paused status.

## Verification Checklist

### Backend checks

Check cron exists:

```sql
select jobid, schedule, active, jobname
from cron.job
where jobname = 'process-company-enrichment-queue-every-minute';
```

Check enrichment queue:

```sql
select company_name, status, attempts, last_error, processed_at, updated_at
from public.company_enrichment_queue
order by updated_at desc
limit 20;
```

Check drafts:

```sql
select recipient_company, recipient_email, status, review_status, scheduled_send_at, created_at
from public.outreach_queue
order by created_at desc
limit 20;
```

Check autonomous send protection:

```bash
curl -X POST "https://bnshgtrqbfuphhhdgccs.supabase.co/functions/v1/send-queued-outreach" \
  -H "x-cron-secret: $APPLIX_CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Expected response:

```json
{
  "ok": true,
  "function": "send-queued-outreach",
  "send_skipped": true,
  "reason": "explicit_send_required"
}
```

### Website checks

1. Open a campaign.
2. Approve one `Needs email` job.
3. Trigger `Prepare approved applications`.
4. Confirm company appears in `company_enrichment_queue` if no pool hit exists.
5. Wait for cron to process.
6. Confirm draft appears in `outreach_queue` if email is found.
7. Confirm email does not send until manual send button sends `send_now=true`.

## Merge Checklist

Before merging the branch into `main`:

- Confirm Vercel preview passes.
- Confirm Supabase functions were deployed from the branch.
- Confirm migration files do not insert unsupported `lead_contact_emails.status = 'blocked'` values.
- Keep `Send queued outreach` GitHub Action disabled.
- Rotate exposed service role and cron secrets before real public users.
- Confirm frontend prepare button is wired.
- Confirm manual send button includes `send_now=true` or `confirm_send=true`.

## Current Decision

The backend engine is ready for controlled testing.

The next product task is frontend confirmation:

```text
Approve job -> prepare approved applications -> queue/enrich -> draft appears -> manual send only
```

Do not enable autonomous send workflows until Applix has a user-controlled sending schedule and clear pause/resume controls.
