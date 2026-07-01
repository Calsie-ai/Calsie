# Applix AI Coding Instructions

This file is for Codex or any AI coding agent working on Applix. Read this before changing automation, Edge Functions, Supabase logic, or campaign flow.

## Core product principle

Simplicity is the key. Applix should not feel like a massive dashboard. It should feel like a simple job application assistant where the user can set up a campaign quickly, review drafts clearly, approve safely, and track outcomes.

## Automation architecture principle

Break Applix automation by responsibility, not by unnecessary agent names.

The desired production flow is:

```txt
Campaign
-> Job Fetcher
-> Job Filter / Scorer
-> Contact Resolver
-> Draft Generator
-> Human Review
-> Email Scheduler
-> Gmail Sender
-> Tracking
```

## Current instruction

Refactor Applix automation into clearer production-ready responsibility layers without changing the product flow.

Read these first:

1. `docs/PRODUCTION_READY_PATCHES.md`
2. Existing Supabase Edge Functions under `supabase/functions/`

Goal:

Separate responsibilities clearly inside the current Edge Functions. Do not create many new Edge Functions unless absolutely necessary. Keep the current external API contracts stable.

## Important rules

- Do not redesign UI.
- Do not change subscription logic.
- Do not touch Gmail OAuth callback unless required for compile errors.
- Do not add automatic production sending without approval.
- Do not send `pending_user_approval` rows.
- Do not approve fake/test recipients.
- Do not remove existing safety checks.
- Keep service-role usage only inside backend Edge Functions.
- Keep user-facing functions JWT-protected.
- Preserve current table names unless a migration is clearly required.
- Be conservative. Refactor structure and safety only. Do not invent new product features.
- Show the diff before final commit when working interactively.

## Responsibility boundaries

### 1. Campaign setup

Purpose:

```txt
User creates campaign preferences.
```

It should only save:

```txt
job title
location
job type
resume source
daily limit
user_id
sender Gmail
status
```

It should not scrape and should not send.

### 2. Job fetcher

Purpose:

```txt
Fetch jobs from Outscraper, Adzuna, or other sources.
```

Output should be only:

```txt
raw jobs
job_posts
source URL
company
title
location
description
```

It should not generate emails.

### 3. Job filter / scorer

Purpose:

```txt
Decide if a job is good enough for the campaign.
```

Output:

```txt
match_score
reason
matched/not_matched
```

This is where bad matches should be removed, including:

```txt
Director role
Senior manager role
wrong industry
wrong location
not entry-level
resume mismatch
```

Before a lead can become a draft, check:

- role matches campaign target
- location is acceptable
- seniority is acceptable
- email exists and is not fake/test
- lead score is above threshold
- job is not obviously wrong for the resume/campaign

If a lead fails, mark it as skipped/needs_review with a reason instead of generating a draft.

Use clear reasons like:

```txt
missing_email
fake_email
low_score
seniority_mismatch
location_mismatch
role_mismatch
resume_mismatch
```

### 4. Contact / email resolver

Purpose:

```txt
Find real recipient email.
```

Output:

```txt
real email
source of email
confidence
email_status
```

Block fake/test recipients:

```txt
hostsajan@gmail.com
hostsajan+applix...
empty emails
malformed emails
```

Production drafts must not be created for fake/test recipients.

Test mode may still use a configured test inbox, but it must be clearly marked as `test_mode` in `ai_notes`.

### 5. Draft generator

Purpose:

```txt
Generate email/resume draft.
```

Input:

```txt
campaign
resume profile
job
company
email
```

Output:

```txt
subject
email_body
resume_sections
warnings
personalization_notes
```

It should not send.

### 6. Human review / approval

Purpose:

```txt
User checks draft and approves/declines.
```

Output:

```txt
approved -> queued
declined -> declined
```

`approve-outreach-draft` must:

- require JWT
- get signed-in user
- verify the queue row belongs to a campaign owned by `auth.uid()`
- only approve rows with `review_status = ready_for_review`
- block fake/test recipients in production
- update:

```txt
status = queued
review_status = approved
updated_at = now
```

Do not allow users to approve rows from another user's campaign.

### 7. Email scheduler

Purpose:

```txt
Pick approved queued rows based on limits.
```

It checks:

```txt
daily limit
hourly limit
send_attempts
approved status
sender Gmail
```

It must:

- only send rows with status in approved/queued
- require `review_status = approved`
- use `send_attempts`
- respect daily/hourly limits
- use `sender_user_identifier` or `gmail_user_identifier` correctly
- never send `pending_user_approval`
- never send `blocked_fake_email`
- never send fake/test recipients in production

It should not generate drafts or scrape jobs.

### 8. Gmail sender

Purpose:

```txt
Send exactly one email.
```

Input:

```txt
recipient
subject
body
sender Gmail auth
```

Output:

```txt
provider_message_id
sent / failed
```

It should not choose jobs, approve anything, or scrape.

### 9. Tracking / logging

Purpose:

```txt
Record what happened.
```

Track lightweight metadata in existing JSON columns where possible:

```txt
fetched
normalized
filtered
email_resolved
draft_created
skipped_reason
approved
queued
sent
failed
```

Do not create a complex new logging system unless needed. Prefer lightweight JSON metadata in existing columns.

## Function-specific refactor instructions

### `run-outscraper-campaigns`

Break internal logic into clear helper sections/functions:

- `parseRequestInput`
- `loadCampaign`
- `fetchJobsFromProvider`
- `normalizeJobs`
- `filterJobIntent`
- `resolveCompanyAndContactEmail`
- `saveJobAndLead`
- `updateCampaignOutreachSummary`

It should only:

- fetch jobs
- normalize jobs
- resolve/save leads and contact emails
- update campaign scrape summary

It should not:

- generate email drafts
- approve drafts
- send emails
- modify Gmail auth

### `generate-outreach-drafts`

Break internal logic into clear helper sections/functions:

- `parseRequestInput`
- `loadCampaignContext`
- `loadResumeSource`
- `loadEligibleLeads`
- `validateLeadForDrafting`
- `buildPromptInput`
- `generateDraft`
- `validateGeneratedDraft`
- `saveDraftToOutreachQueue`
- `updateLeadDraftStatus`

It should only:

- generate draft content
- generate resume section suggestions
- save review-ready queue rows

It should not:

- send emails
- approve queue rows
- scrape jobs
- create fake recipients for production mode

### `approve-outreach-draft`

Confirm it:

- requires JWT
- gets signed-in user
- verifies the queue row belongs to a campaign owned by `auth.uid()`
- only approves rows with `review_status = ready_for_review`
- blocks fake/test recipients in production
- updates:

```txt
status = queued
review_status = approved
updated_at = now
```

Do not allow users to approve rows from another user's campaign.

### `applix-agent-email-scheduler`

Confirm it:

- only sends status in approved/queued
- requires `review_status = approved`
- uses `send_attempts`
- respects daily/hourly limits
- uses `sender_user_identifier` or `gmail_user_identifier` correctly
- never sends `pending_user_approval`
- never sends `blocked_fake_email`
- never sends fake/test recipients in production

## Code quality rules

- Keep functions readable and small.
- Avoid one giant handler.
- Use named helper functions.
- Add comments only where logic is not obvious.
- Do not introduce unnecessary dependencies.
- Keep Deno/Supabase Edge Function compatibility.
- Do not expose service role keys to frontend code.
- Do not move secrets into `NEXT_PUBLIC_` variables.

## Output required from coding agent

After making changes, show:

- files changed
- functions changed
- exact diff summary
- any SQL migration required, if any
- any Supabase function deploy commands needed

Do not commit until the user reviews the diff, unless the user explicitly asks for direct commit.
