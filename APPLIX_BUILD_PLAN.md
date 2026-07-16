# APPLIX BUILD PLAN

Last updated: 2026-07-16

This is the main technical context file for Applix. Read this before changing campaign launch, job fetching, AI matching, tracker, enrichment, drafting, Gmail, cron, pause/resume, or sending.

## Product rule

```text
Find jobs
  -> deterministic filtering
  -> AI judgment
  -> daily selection
  -> user reviews
  -> user approves
  -> prepare application
  -> enrich missing company email
  -> generate draft
  -> user reviews draft
  -> user explicitly sends
```

Never send automatically merely because a cron, queue, or scheduled worker exists.

## Current production problem

Two job pipelines currently exist beside each other.

```text
LEGACY PIPELINE
Campaign launch -> Outscraper -> public.jobs -> legacy draft/tracker

NEW PIPELINE
Campaign -> catalogue -> deterministic match -> AI judge
         -> daily selection -> campaign tracker -> approval
         -> enrichment -> draft -> explicit send
```

The campaign launch page is still wired to the legacy pipeline. This is why a campaign can scrape jobs successfully but produce zero `orchestrator_runs`, zero `campaign_job_matches`, and zero AI-approved tracker jobs.

## Full live system

```text
                             APPLIX LIVE SYSTEM
================================================================================

 USER
  |
  +-- Connect Gmail
  |      |
  |      +-- connect-gmail
  |      +-- Google OAuth consent
  |      +-- gmail-oauth-callback
  |                   |
  |                   v
  |          user_email_authorizations
  |
  +-- Create / Start Campaign
  |      |
  |      v
  |   launch-applix-campaign                    CURRENT LEGACY WIRING
  |      |
  |      +-- run-outscraper-campaigns
  |      |        |
  |      |        +-- outscraper-jobs
  |      |                  |
  |      |                  v
  |      |              public.jobs
  |      |
  |      +-- generate-outreach-drafts
  |                   |
  |                   v
  |          old outreach / old tracker
  |
  +-- Target production launch
         |
         v
     calsie-campaign-orchestrator-v2
         |
         +-- compile-campaign-search-plan
         |
         +-- match-campaign-jobs
         |       |
         |       +-- enough catalogue jobs? -- yes ------------------+
         |       |                                                    |
         |       +-- no -> fetch-job-catalogue-v2                     |
         |                    |                                       |
         |                    +-- store/update public.jobs            |
         |                    +-- match-campaign-jobs again           |
         |                                                            |
         +------------------------------------------------------------+
         |
         +-- judge-campaign-jobs
         |       |
         |       +-- pass
         |       +-- review
         |       +-- reject
         |       +-- reuse cached decision when AI input hash matches
         |
         +-- select-daily-job-batch
                    |
                    v
            campaign_job_matches
                    |
                    v
              NEW JOB TRACKER
                 /       \
              Approve    Skip
                 |         |
                 |         +-- user_decision = skipped
                 |
                 +-- user_decision = approved
                          |
                          v
              prepare-approved-applications
                          |
                    email available?
                     /          \
                   yes          no
                    |            |
                    |            v
                    |   company_enrichment_queue
                    |            |
                    |            v
                    |   drain-company-enrichment-queue
                    |            |
                    |            v
                    |   process-company-enrichment-queue
                    |            |
                    |            v
                    |      enrich-job-emails
                    |            |
                    +------------+
                          |
                          v
              generate-job-outreach-drafts
                          |
                          v
                    outreach_queue
                          |
                          v
                approve-outreach-draft
                          |
                          v
                send-queued-outreach
                          |
                          v
                      gmail-send
                          |
                          v
                        GMAIL
```

## Correct campaign orchestrator flow

```text
Start Campaign / Find New Jobs Now
                |
                v
calsie-campaign-orchestrator-v2
                |
                v
compile-campaign-search-plan
                |
                v
match-campaign-jobs
                |
        enough suitable jobs?
            /          \
          yes           no
           |             |
           |             v
           |    fetch-job-catalogue-v2
           |             |
           |             v
           |    match-campaign-jobs again
           |             |
           +-------------+
                |
                v
judge-campaign-jobs
                |
                v
select-daily-job-batch
                |
                v
campaign_job_matches
                |
                v
get_review_jobs RPC -> JobSwipeDeck
```

## Tracker flow

```text
get_review_jobs RPC
        |
        +-- reads campaign_job_matches
        +-- joins public.jobs
        +-- returns selected, AI-approved, undecided jobs
        |
        v
JobSwipeDeck
   /      \
Approve   Skip
  |         |
  +-- decide_campaign_job RPC
              |
              +-- approved -> prepare-approved-applications
              +-- skipped  -> retain as campaign history
```

The old application tracker that directly reads user-owned rows from `public.jobs` is legacy history. It must not be presented as the new review queue.

## Company enrichment flow

```text
prepare-approved-applications
            |
            +-- contact in company_contacts_pool?
            |          |
            |          +-- yes -> update job and create draft
            |
            +-- no -> company_enrichment_queue
                           |
                           v
              drain-company-enrichment-queue
                           |
                           v
             process-company-enrichment-queue
                           |
                           v
                  enrich-job-emails
                           |
             +-------------+-------------+
             |             |             |
      contact pool   known contacts   website/email discovery
             |             |             |
             +-------------+-------------+
                           |
                           v
             generate-job-outreach-drafts
```

## Draft and Gmail flow

```text
outreach_queue
      |
      v
User reviews subject, body, recipient and resume
      |
      v
approve-outreach-draft
      |
      v
send-queued-outreach
      |
      +-- requires send_now=true or confirm_send=true
      +-- checks campaign status
      +-- checks hourly/daily limits
      |
      v
gmail-send
      |
      v
Google Gmail API
```

## Gmail OAuth

```text
User clicks Connect Gmail
          |
          v
connect-gmail
          |
          v
Google consent screen
          |
          v
gmail-oauth-callback
          |
          v
user_email_authorizations
          |
          v
gmail-send
```

## Live database cron jobs

### 1. Daily job fetch

```text
Name:      applix-daily-job-fetch
Schedule:  0 20 * * *
UTC:       20:00 daily
Sydney:    about 6:00 AM AEST / 7:00 AM AEDT
```

```text
pg_cron
   |
   v
dispatch_applix_daily_job_fetch()
   |
   +-- reads service credential from Vault
   |
   v
applix-daily-job-fetcher
```

Current issue: this cron still calls `applix-daily-job-fetcher`, not the new campaign dispatcher/orchestrator. A recent live call returned 401, so its authentication and final responsibility need correction.

Target:

```text
Daily cron
   |
   v
active-campaign dispatcher
   |
   +-- query campaigns where status = active
   +-- invoke calsie-campaign-orchestrator-v2 once per campaign
   +-- never run paused/draft/archived/completed campaigns
```

### 2. Company enrichment recovery

```text
Name:      applix-company-enrichment-recovery
Schedule:  */5 * * * *
Frequency: every 5 minutes
```

```text
pg_cron
   |
   v
kick_company_enrichment_drain()
   |
   +-- pending due work exists? -- no -> stop
   |
   +-- yes
        |
        v
   drain-company-enrichment-queue
        |
        v
   process-company-enrichment-queue
        |
        v
   enrich-job-emails
```

This cron is appropriate because it enriches data but does not send emails.

## Live Edge Function inventory

### New AI campaign pipeline - keep

```text
calsie-campaign-orchestrator-v2
compile-campaign-search-plan
match-campaign-jobs
fetch-job-catalogue-v2
judge-campaign-jobs
select-daily-job-batch
```

### Approval, enrichment and drafting - keep

```text
approve-job-for-outreach
prepare-approved-applications
run-company-enrichment-chain
drain-company-enrichment-queue
process-company-enrichment-queue
enrich-job-emails
generate-job-outreach-drafts
approve-outreach-draft
send-queued-outreach
```

`run-company-enrichment-chain` is a wrapper and must be reviewed because one historical call returned 500 while lower-level functions succeeded.

### Gmail - keep

```text
connect-gmail
gmail-oauth-callback
gmail-send
```

### Current launch and scheduling - rewire

```text
launch-applix-campaign
applix-daily-job-fetcher
applix-campaign-runner
applix-agent-orchestrator
applix-agent-email-scheduler
applix-hourly-draft-runner
```

### Legacy or test candidates - inspect before removal

```text
run-outscraper-campaigns
generate-outreach-drafts
outscraper-jobs
fetch-adzuna-jobs
launch-applix-test
gmail-send-test
bright-responder
```

These may still support tests or fallback ingestion. Do not delete them until call sites, cron jobs and production logs confirm they are unused.

### Utility

```text
applix-health
```

## Pause, resume, refresh and archive behaviour

Pause and refresh are different actions.

```text
Pause Campaign
  -> campaigns.status = paused
  -> scheduled dispatcher skips campaign
  -> orchestrator rejects execution
  -> sending remains blocked
  -> data and history remain

Resume Campaign
  -> campaigns.status = active
  -> future scheduled runs resume
  -> previous AI judgments and decisions remain

Find New Jobs Now
  -> allowed only for active campaign
  -> invokes calsie-campaign-orchestrator-v2
  -> does not delete previous reviewed history

Archive Campaign
  -> status = archived
  -> hidden from active campaigns
  -> no scheduling, processing or sending
  -> historical records preserved
```

Required campaign card controls:

```text
RUNNING
[Find New Jobs Now] [Edit Campaign] [Pause Campaign] [...]

PAUSED
[Resume Campaign] [Edit Campaign] [Archive Campaign]
```

The orchestrator must explicitly reject non-active statuses. Loading `campaigns.status` without enforcing it is insufficient.

## Database ownership model

```text
auth.users
   |
   +-- profiles
   +-- resume_profiles                    preserved account/resume identity
   +-- campaigns
          |
          +-- campaign_resume_sources
          +-- orchestrator_runs
          +-- campaign_job_matches
          +-- company_enrichment_queue
          +-- outreach_queue
          +-- notifications/logs

public.jobs                             shared catalogue where possible
   |
   +-- campaign_job_matches             campaign-specific state
   +-- lead_contact_emails
   +-- company_enrichment_queue_jobs
   +-- outreach_queue
```

Do not make the global job record itself the source of campaign review state. Campaign-specific filtering, AI judgment, selection and user decisions belong in `campaign_job_matches`.

## Immediate wiring plan

```text
1. launch-applix-campaign
   -> create/update campaign only
   -> call calsie-campaign-orchestrator-v2
   -> stop calling generate-outreach-drafts during launch

2. Find New Jobs Now
   -> call calsie-campaign-orchestrator-v2
   -> show run stage and counters

3. Daily cron
   -> replace legacy fetch call with active-campaign dispatcher
   -> dispatcher invokes calsie-campaign-orchestrator-v2

4. Tracker
   -> load get_review_jobs RPC
   -> display campaign_job_matches queue
   -> move old public.jobs rows to Legacy History

5. Approval
   -> decide_campaign_job
   -> prepare-approved-applications

6. Enrichment
   -> queue missing-email companies
   -> five-minute recovery cron drains queue

7. Drafting
   -> generate-job-outreach-drafts only after approval/email readiness

8. Sending
   -> manual explicit confirmation only

9. Pause protection
   -> scheduler skips paused campaigns
   -> orchestrator rejects paused campaigns
   -> send function rejects paused campaigns
```

## Required smoke test

Use a fresh controlled campaign with a daily target of 2.

```text
Create campaign
  -> orchestrator_run created
  -> search plan compiled
  -> catalogue checked/fetched
  -> campaign_job_matches created
  -> AI rejects false positives
  -> exactly relevant jobs selected
  -> tracker displays selected jobs
  -> approve one
  -> skip one
  -> approved job reaches preparation
  -> email enrichment runs only when needed
  -> draft appears
  -> no email sends without explicit confirmation
```

Pass criteria:

```text
campaign status: active
orchestrator run: completed or waiting_for_enrichment
AI judgments: present
selected jobs: expected count
tracker: only new selected jobs
legacy history: separated
outreach: draft only after approval
sending: zero until user confirms
```

## Safety rules

- Never expose service-role, cron, OAuth or provider secrets.
- Internal-only AI judge calls require service-role authorization.
- Paused, draft, pending, archived, stopped, cancelled and completed campaigns must not process or send.
- `send-queued-outreach` must not be autonomous.
- User approval is required before application preparation.
- User confirmation is required before Gmail send.
- Keep global catalogue data separate from campaign-specific decisions.
- Do not delete legacy functions until all call sites and cron jobs are accounted for.

## Definition of the target production architecture

```text
Campaign launch or manual refresh
              |
              v
calsie-campaign-orchestrator-v2
              |
              v
AI-approved campaign review queue
              |
              v
User approval
              |
              v
Prepare -> enrich -> draft
              |
              v
User review and explicit Gmail send
```

This is the architecture new work should move toward.