# APPLIX BUILD PLAN

Last updated: 2026-07-16

This is the main technical context file for Applix. Read this before changing campaign launch, job fetching, AI matching, tracker, enrichment, drafting, Gmail, cron, pause/resume, retry logic, or sending.

## Product rule

```text
Find jobs
  -> deterministic filtering
  -> AI judgment
  -> select up to the user's daily target
  -> user reviews
  -> user approves
  -> prepare application
  -> enrich missing company email
  -> generate draft
  -> user reviews draft
  -> user explicitly sends
```

No cron, queue, orchestrator, or campaign launch may send email automatically.

## Current production architecture

```text
USER
 |
 +-- Start Campaign / Find New Jobs Now
 |       |
 |       v
 |   launch-applix-campaign
 |       |
 |       v
 |   calsie-campaign-orchestrator-v3
 |       |
 |       +-- compile-campaign-search-plan
 |       +-- match-campaign-jobs
 |       +-- controlled fetch attempts
 |       +-- judge-campaign-jobs
 |       +-- select-daily-job-batch
 |       |
 |       v
 |   campaign_job_matches
 |       |
 |       v
 |   AI Review Queue
 |      / \
 |  Approve Skip
 |     |     |
 |     |     +-- user_decision = skipped
 |     |
 |     +-- user_decision = approved
 |             |
 |             v
 |     prepare-approved-applications
 |             |
 |       email available?
 |        /          \
 |      yes          no
 |       |            |
 |       |            v
 |       |    company_enrichment_queue
 |       |            |
 |       |            v
 |       |    process-company-enrichment-queue
 |       |            |
 |       +------------+
 |             |
 |             v
 |     generate-job-outreach-drafts
 |             |
 |             v
 |       outreach_queue
 |             |
 |             v
 |     approve-outreach-draft
 |             |
 |             v
 |     send-queued-outreach
 |             |
 |             v
 |         gmail-send
 |
 +-- Pause Campaign
         |
         +-- scheduler skips campaign
         +-- orchestrator rejects campaign
         +-- send functions remain blocked
```

## Three-stage daily fetch strategy

The daily target is the number of final AI-approved jobs shown to the user. It is not the raw provider fetch count.

Default daily target:

```text
24 selected AI-approved jobs
```

Maximum raw provider request budget:

```text
Attempt 1: 100
Attempt 2: 300 additional
Attempt 3: 700 additional
Maximum: 1,100 requested raw jobs
```

### Full retry diagram

```text
┌──────────────────────────────────────────────┐
│ ATTEMPT 1                                    │
│ Fetch up to 100 raw jobs                     │
│ Deduplicate                                  │
│ Deterministic filtering                      │
│ AI judgment                                  │
│ Select up to 24                              │
└──────────────────────┬───────────────────────┘
                       │
              Selected jobs < 24?
                 /            \
               NO              YES
               │                │
               ▼                ▼
             STOP       ┌──────────────────────┐
                        │ ATTEMPT 2            │
                        │ Fetch up to 300 more │
                        │ Match + AI judge     │
                        │ Fill remaining quota │
                        └──────────┬───────────┘
                                   │
                          Selected jobs < 24?
                             /            \
                           NO              YES
                           │                │
                           ▼                ▼
                         STOP       ┌──────────────────────┐
                                    │ ATTEMPT 3            │
                                    │ Fetch up to 700 more │
                                    │ Match + AI judge     │
                                    │ Fill remaining quota │
                                    └──────────┬───────────┘
                                               │
                                               ▼
                                             STOP
```

### Provider call breakdown

`fetch-job-catalogue-v2` currently accepts a maximum of 200 per call. The 100/300/700 plan is implemented as multiple provider calls:

```text
Attempt 1
  -> 1 call x 100

Attempt 2
  -> 2 calls x 150

Attempt 3
  -> 4 calls x 175
```

Each call rotates to another compiled search query. Global job deduplication prevents the same provider job, canonical URL, or company-title-location record from being stored twice.

### Stop conditions

```text
Stop immediately when:

1. selected_count >= daily_target
2. attempt_number = 3 and target is still not reached
3. campaign becomes paused, archived, inactive, stopped, or cancelled
4. provider returns zero results for an attempt
5. an attempt produces no usable unique catalogue jobs
6. provider/API cost guard is reached
7. an unrecoverable function error occurs
```

A partial result is allowed:

```text
Target:   24
Selected: 17
Result:   ready_for_review with shortage_after_attempts = 7
```

Zero selected jobs produces:

```text
status: needs_attention
current_stage: failed
```

## Query rotation

Compiled campaign queries are rotated across provider calls so retries do not simply repeat the same first search.

Example:

```text
Call 1 -> Caseworker Sydney NSW
Call 2 -> Community Caseworker Sydney NSW
Call 3 -> Family Support Caseworker Sydney NSW
Call 4 -> Youth Caseworker Sydney NSW
Call 5 -> Housing Caseworker Sydney NSW
Call 6 -> Domestic Violence Caseworker Sydney NSW
Call 7 -> Settlement Caseworker Sydney NSW
```

The provider may still return overlapping jobs. Deduplication remains mandatory.

## Orchestrator counters

Every run should record:

```json
{
  "daily_target": 24,
  "attempts_completed": 3,
  "attempt_limits": [100, 300, 700],
  "raw_requested": 1100,
  "raw_fetched": 684,
  "normalized": 620,
  "new_jobs_stored": 430,
  "existing_jobs_updated": 170,
  "duplicates_skipped": 20,
  "deterministic_eligible": 51,
  "ai_considered": 51,
  "ai_passed": 27,
  "selected": 24,
  "held_for_later": 3,
  "shortage_after_attempts": 0,
  "target_reached": true
}
```

Each attempt must also be stored in `stage_results.attempts` with fetch calls, matching results, AI results, selection state, and stop reason.

## Function map

### Campaign execution

```text
launch-applix-campaign
  -> calsie-campaign-orchestrator-v3

applix-daily-job-fetcher-v2
  -> calsie-campaign-orchestrator-v3
```

### Three-stage orchestrator

```text
calsie-campaign-orchestrator-v3
  -> compile-campaign-search-plan
  -> match-campaign-jobs
  -> fetch-job-catalogue-v2
  -> judge-campaign-jobs
  -> select-daily-job-batch
```

### Review and preparation

```text
get_review_jobs RPC
  -> campaign_job_matches

decide_campaign_job RPC
  -> approved or skipped

prepare-approved-applications
  -> company contact reuse
  -> enrichment queue when needed
  -> draft generation only after approval
```

### Enrichment

```text
applix-company-enrichment-recovery cron
  -> drain-company-enrichment-queue
  -> process-company-enrichment-queue
  -> enrich-job-emails
```

### Gmail

```text
connect-gmail
  -> gmail-oauth-callback
  -> user_email_authorizations

approve-outreach-draft
  -> send-queued-outreach
  -> gmail-send
```

## Daily cron

```text
Name:      applix-daily-job-fetch
Schedule:  0 20 * * *
UTC:       20:00 daily
Sydney:    about 6:00 AM AEST / 7:00 AM AEDT
```

Target call chain:

```text
pg_cron
  -> dispatch_applix_daily_job_fetch()
  -> applix-daily-job-fetcher-v2
  -> active campaigns only
  -> calsie-campaign-orchestrator-v3
```

The database dispatcher must send both:

```text
Authorization: Bearer <service-role token>
x-applix-cron-secret: <cron secret>
```

Never expose either secret in logs, frontend code, or documentation values.

## Pause, resume, refresh, and archive

```text
RUNNING
[Find New Jobs Now] [Edit Campaign] [Pause Campaign] [...]

PAUSED
[Resume Campaign] [Edit Campaign] [Archive Campaign]
```

```text
Pause Campaign
  -> status = paused
  -> scheduled dispatcher skips
  -> orchestrator rejects
  -> sending blocked

Resume Campaign
  -> status = active
  -> future scheduled runs resume
  -> cached AI judgments remain reusable

Find New Jobs Now
  -> active campaigns only
  -> unique run_type for same-day manual execution
  -> uses the same 100/300/700 retry policy

Archive Campaign
  -> status = archived
  -> no scheduling, processing, drafting, or sending
  -> history preserved
```

## Tracker ownership model

```text
public.jobs
  -> shared catalogue record

campaign_job_matches
  -> deterministic result
  -> AI judgment
  -> selected_for_campaign
  -> user decision
  -> reviewed_at
```

Do not place campaign-specific review state on the global job record.

Tracker views:

```text
AI Review Queue
  -> selected AI-pass jobs from campaign_job_matches

Legacy History
  -> old user-owned public.jobs rows
```

## Safety rules

- Never expose service-role, cron, OAuth, OpenAI, Gmail, or provider secrets.
- Never send email during campaign launch, fetching, matching, AI judgment, or selection.
- User approval is required before application preparation.
- User confirmation is required before Gmail send.
- Paused, archived, draft, pending, stopped, cancelled, completed, and inactive campaigns must not process or send.
- Maximum provider request budget is 1,100 raw jobs per campaign run unless a future reviewed configuration changes it.
- Maximum selected user-facing jobs remains 24 per daily run.
- Keep v2 orchestrator and original daily worker available until v3 passes production smoke tests.

## Rollout status

Branch:

```text
feat/three-stage-job-fetch-retries
```

Added or changed:

```text
calsie-campaign-orchestrator-v3
applix-daily-job-fetcher-v2
launch-applix-campaign -> v3
cron dispatcher migration -> daily-job-fetcher-v2
APPLIX_BUILD_PLAN.md
```

Rollback path:

```text
calsie-campaign-orchestrator-v2
applix-daily-job-fetcher
```

## Required smoke test

Use one controlled active campaign with daily target 2.

```text
1. Start unique manual run
2. Confirm run uses orchestrator v3
3. Confirm attempt 1 requests 100
4. If fewer than 2 selected, confirm attempt 2 requests 300
5. If still fewer than 2, confirm attempt 3 requests 700
6. Confirm target stops later attempts
7. Confirm provider-zero stop works
8. Confirm paused campaign is rejected
9. Confirm AI Review Queue shows only selected AI-pass jobs
10. Approve one and skip one
11. Confirm preparation/enrichment begins only for approved job
12. Confirm no email is sent
```

Pass criteria:

```text
orchestrator run exists
attempt counters are correct
target never exceeds 2 in smoke test
production target remains 24
selected jobs are relevant
tracker uses campaign_job_matches
legacy history remains separate
no draft before approval
no send without explicit confirmation
```
