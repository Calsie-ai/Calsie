# Calsie AI Build Plan

Last updated: 2026-07-24

This is the primary technical context file for Applix.

Read this document before changing:

- campaign creation or launch
- job catalogue fetching
- deterministic job matching
- AI job judgment
- direct-company opportunity matching
- tracker and review queues
- company email enrichment
- application preparation
- outreach draft generation
- Gmail connection or sending
- scheduled jobs and cron dispatchers
- campaign pause, resume, archive, and retry behaviour
- orchestrator execution and recovery logic

---

## 1. Product rule

The required application flow is:

```text
Find opportunities
  -> deterministic filtering
  -> AI judgment for live jobs
  -> select up to the user's daily target
  -> user reviews each opportunity
  -> user approves or skips
  -> prepare approved live-job application
  -> reuse or enrich missing company email
  -> generate outreach draft
  -> user reviews the draft
  -> user explicitly confirms sending
  -> Gmail sends the approved message
```

The system must maintain two separate user approvals:

```text
Approval 1
  -> approve the job or opportunity
  -> allow application preparation

Approval 2
  -> approve the generated email draft
  -> allow Gmail sending
```

No campaign launch, cron job, scheduler, fetcher, matcher, AI judge, selector, enrichment worker, queue worker, or orchestrator may automatically send an email.

---

## 2. Production source of truth

```text
GitHub repository
  -> Sajan-giri/applix

Production branch
  -> main

Supabase project
  -> applix

Supabase project reference
  -> bnshgtrqbfuphhhdgccs

Frontend
  -> Next.js
  -> hosted through Vercel

Backend
  -> Supabase Auth
  -> PostgreSQL
  -> Edge Functions
  -> Storage
  -> pg_cron
  -> pg_net
  -> Vault-managed scheduler credentials
```

The older repository below is not the current production application:

```text
Sajan-giri/calsie-learn-quest
  -> earlier Vite/Lovable prototype
  -> not the production source of truth
```

---

## 3. Complete production architecture tree

```text
APPLIX
|
+-- FRONTEND: NEXT.JS
|   |
|   +-- Landing page
|   |   +-- Google sign-in
|   |   +-- Product explanation
|   |   +-- Campaign entry
|   |
|   +-- Authentication callback
|   |   +-- Exchange Supabase OAuth code
|   |   +-- Confirm authenticated session
|   |   +-- Redirect to dashboard
|   |
|   +-- Dashboard
|   |   +-- Load current user
|   |   +-- Load latest campaign
|   |   +-- Load resume profile
|   |   +-- Load Gmail connection status
|   |   +-- Load campaign template
|   |   +-- Load tracker counts
|   |   +-- Create campaign
|   |   +-- Upload resume
|   |   +-- Connect Gmail
|   |   +-- Start campaign
|   |   +-- Pause campaign
|   |   +-- Find new jobs now
|   |
|   +-- Tracker
|   |   +-- AI Review Queue
|   |   |   +-- Live jobs
|   |   |   +-- Direct-company opportunities
|   |   |   +-- Approve
|   |   |   +-- Skip
|   |   |
|   |   +-- Application preparation status
|   |   +-- Draft status
|   |   +-- Send status
|   |   +-- Legacy history
|   |
|   +-- Next.js API routes
|       +-- /api/applix/connect-gmail
|       +-- /api/applix/schedule-campaign
|       +-- /api/applix/run-campaign
|
+-- SUPABASE AUTH
|   |
|   +-- Google login
|   +-- Supabase user session
|   +-- JWT access token
|   +-- User ownership validation
|
+-- SUPABASE STORAGE
|   |
|   +-- resumes bucket
|   |   +-- private
|   |   +-- user-owned paths
|   |   +-- resumes/{user_id}/master-source.ext
|   |
|   +-- template-images bucket
|       +-- public
|       +-- JPEG
|       +-- PNG
|       +-- WebP
|
+-- CAMPAIGN EXECUTION
|   |
|   +-- launch-applix-campaign
|   |   +-- validate JWT
|   |   +-- validate campaign ownership
|   |   +-- validate active campaign
|   |   +-- update campaign status
|   |   +-- dispatch orchestrator v3
|   |   +-- return HTTP 202
|   |
|   +-- calsie-campaign-orchestrator-v3
|       |
|       +-- compile-campaign-search-plan
|       |   +-- read resume and campaign preferences
|       |   +-- compile provider queries
|       |   +-- rotate search terms
|       |
|       +-- fetch-job-catalogue-v2
|       |   +-- call Adzuna provider
|       |   +-- normalize provider results
|       |   +-- deduplicate jobs
|       |   +-- insert or update shared jobs
|       |   +-- record job fetch runs
|       |
|       +-- match-campaign-jobs
|       |   +-- deterministic role matching
|       |   +-- deterministic location matching
|       |   +-- deterministic work-type matching
|       |   +-- write campaign_job_matches
|       |
|       +-- judge-campaign-jobs
|       |   +-- evaluate eligible live jobs
|       |   +-- return structured AI judgment
|       |   +-- record score
|       |   +-- record verdict
|       |   +-- record reason
|       |
|       +-- select-daily-job-batch
|           +-- select live AI-pass jobs
|           +-- fill remaining positions
|           +-- include direct-company opportunities
|           +-- use template-specific company pools
|           +-- stop at campaign daily target
|
+-- OPPORTUNITY SOURCES
|   |
|   +-- Live job catalogue
|   |   +-- public.jobs
|   |   +-- provider jobs
|   |   +-- shared across campaigns
|   |
|   +-- Disability company pool
|   |   +-- disability_company_contacts_pool
|   |   +-- service-role access
|   |
|   +-- Aged-care company pool
|       +-- aged_care_company_contacts_pool
|       +-- service-role access
|
+-- REVIEW SYSTEM
|   |
|   +-- get_review_opportunities RPC
|   |   +-- return selected live jobs
|   |   +-- return direct-company opportunities
|   |   +-- combine both opportunity types
|   |
|   +-- Tracker polling
|   |   +-- refresh approximately every 8 seconds
|   |
|   +-- decide_campaign_opportunity RPC
|       |
|       +-- Live job
|       |   +-- approved
|       |   |   +-- prepare application
|       |   |
|       |   +-- skipped
|       |
|       +-- Direct company
|           +-- approved
|           |   +-- save approval state
|           |   +-- do not automatically prepare or send
|           |
|           +-- skipped
|
+-- APPLICATION PREPARATION
|   |
|   +-- prepare-approved-applications
|       +-- authenticate user
|       +-- verify campaign ownership
|       +-- load approved live jobs
|       +-- reuse existing contact email
|       +-- enqueue missing contacts
|       +-- start draft generation for email-ready jobs
|
+-- COMPANY EMAIL ENRICHMENT
|   |
|   +-- company_enrichment_queue
|   |   +-- pending
|   |   +-- processing
|   |   +-- completed
|   |   +-- failed
|   |
|   +-- drain-company-enrichment-queue
|   |   +-- claim queue items
|   |
|   +-- process-company-enrichment-queue
|   |   +-- search existing contacts
|   |   +-- reuse company contact
|   |   +-- request enrichment
|   |
|   +-- enrich-job-emails
|   |
|   +-- resolve-job-contact-ai
|       +-- inspect supplied contact candidates
|       +-- select a candidate email
|       +-- selected address must exist in supplied candidates
|
+-- DRAFT GENERATION
|   |
|   +-- generate-job-outreach-drafts
|       +-- read approved job
|       +-- read resume and campaign context
|       +-- create outreach draft
|       +-- store draft in outreach_queue
|       +-- do not send during normal preparation
|
+-- DRAFT REVIEW
|   |
|   +-- outreach_queue
|   |   +-- draft
|   |   +-- ready_for_review
|   |   +-- approved
|   |   +-- queued
|   |   +-- sending
|   |   +-- sent
|   |   +-- failed
|   |
|   +-- approve-outreach-draft
|       +-- user confirms draft
|       +-- mark draft approved
|       +-- permit controlled send path
|
+-- GMAIL
|   |
|   +-- connect-gmail
|   |   +-- authenticated user starts Google OAuth
|   |
|   +-- gmail-oauth-callback
|   |   +-- exchange authorization code
|   |   +-- store Gmail authorization
|   |
|   +-- user_email_authorizations
|   |   +-- Gmail connection status
|   |   +-- access token record
|   |   +-- refresh token record
|   |
|   +-- send-queued-outreach
|   |   +-- load approved outreach item
|   |   +-- validate campaign and user
|   |   +-- claim message for sending
|   |   +-- call Gmail sender
|   |
|   +-- gmail-send
|       +-- create Gmail MIME message
|       +-- send through Gmail API
|       +-- return Gmail message result
|
+-- DATABASE
|   |
|   +-- profiles
|   +-- resume_profiles
|   +-- campaigns
|   +-- jobs
|   +-- job_fetch_runs
|   +-- campaign_job_matches
|   +-- campaign_company_candidates
|   +-- campaign_leads
|   +-- orchestrator_runs
|   +-- company_enrichment_queue
|   +-- company_enrichment_queue_jobs
|   +-- outreach_queue
|   +-- applications
|   +-- user_email_authorizations
|   +-- gmail_connections
|   +-- user_notifications
|   +-- campaign_lead_personalizations
|   +-- disability_company_contacts_pool
|   +-- aged_care_company_contacts_pool
|
+-- DATABASE TRIGGERS
|   |
|   +-- auth.users
|   |   +-- create public profile
|   |
|   +-- campaigns
|   |   +-- initialise campaign folders
|   |   +-- update lifecycle state
|   |
|   +-- campaign_job_matches
|   |   +-- synchronise campaign lead
|   |
|   +-- campaign_company_candidates
|   |   +-- synchronise direct-company opportunity
|   |
|   +-- orchestrator_runs
|   |   +-- respond to stage changes
|   |
|   +-- company_enrichment_queue
|   |   +-- dispatch queue processing
|   |
|   +-- jobs
|       +-- normalize location
|       +-- update timestamps
|       +-- prepare campaign context
|       +-- archive deleted jobs
|
+-- SCHEDULED WORK
    |
    +-- Global daily job fetcher
    |   +-- cron: 17 * * * *
    |   +-- runs hourly at minute 17
    |   +-- dispatches active campaign processing
    |
    +-- Global campaign matcher
    |   +-- cron: */5 * * * *
    |   +-- runs every 5 minutes
    |   +-- processes active campaign matching
    |
    +-- Company enrichment recovery
        +-- cron: */5 * * * *
        +-- runs every 5 minutes
        +-- recovers pending or interrupted enrichment work
```

---

## 4. Main user flow

### 4.1 Authentication

```text
User opens Applix
  -> selects Google sign-in
  -> Supabase starts Google OAuth
  -> Google redirects to /auth/callback
  -> callback exchanges code for session
  -> authenticated user is redirected to dashboard
```

### 4.2 Initial dashboard loading

The dashboard loads:

```text
current authenticated user
latest campaign
resume profile
Gmail connection status
campaign template
tracker totals
campaign state
```

### 4.3 Resume upload

```text
User uploads PDF or DOCX
  -> frontend uploads file to private resumes bucket
  -> path uses authenticated user ID
  -> resume_profiles record is inserted or updated
  -> resume becomes available to campaign processing
```

Storage path:

```text
resumes/{user_id}/master-source.{extension}
```

### 4.4 Campaign creation

A campaign is created from the selected campaign template.

Campaign configuration includes:

```text
target job titles
location
remote/hybrid/onsite preference
employment types
date-posted preference
daily target
resume profile
outreach configuration
campaign status
```

New campaigns initially use:

```text
status = draft
```

### 4.5 Gmail connection

```text
User selects Connect Gmail
  -> frontend sends Supabase access token to Next.js API route
  -> API route calls connect-gmail
  -> Google OAuth consent opens
  -> callback stores Gmail authorization
  -> dashboard displays Gmail as connected
```

### 4.6 Campaign launch

The dashboard requires:

```text
resume uploaded
Gmail connected
campaign owned by current user
campaign allowed to become active
```

Launch flow:

```text
Dashboard
  -> /api/applix/schedule-campaign
  -> validate Supabase user
  -> validate campaign ownership
  -> patch campaign settings
  -> launch-applix-campaign
  -> HTTP 202 returned
  -> calsie-campaign-orchestrator-v3 runs
```

The launch response means processing was accepted. It does not mean matching, AI judgment, or selection has finished.

### 4.7 Find new jobs now

```text
User selects Find New Jobs Now
  -> /api/applix/run-campaign
  -> validate user
  -> validate campaign ownership
  -> require active campaign
  -> create unique manual run
  -> invoke launch-applix-campaign
  -> use orchestrator v3
  -> no email is sent
```

---

## 5. Current campaign execution flow

```text
launch-applix-campaign
  |
  +-- validate bearer token
  +-- identify authenticated user
  +-- load campaign
  +-- confirm campaign ownership
  +-- confirm campaign is active
  +-- set campaign to finding_jobs
  +-- dispatch orchestrator with EdgeRuntime.waitUntil
  +-- return HTTP 202
```

Background execution:

```text
calsie-campaign-orchestrator-v3
  |
  +-- create or resume orchestrator_runs record
  +-- compile campaign search plan
  +-- fetch catalogue jobs
  +-- match campaign jobs
  +-- AI-judge eligible jobs
  +-- select daily review batch
  +-- add direct-company fallback opportunities
  +-- update counters and stage results
  +-- finish as ready_for_review, partially_completed, or needs_attention
```

---

## 6. Three-stage daily fetch strategy

The daily target means the final number of selected opportunities shown to the user.

It does not mean the raw number requested from the provider.

Default production target:

```text
24 selected opportunities
```

Maximum raw provider request budget:

```text
Attempt 1: 100 raw jobs
Attempt 2: 300 additional raw jobs
Attempt 3: 700 additional raw jobs

Maximum total: 1,100 raw jobs requested
```

### Full retry flow

```text
+--------------------------------------------------+
| ATTEMPT 1                                        |
|                                                  |
| Request up to 100 raw jobs                       |
| Normalize provider results                       |
| Deduplicate                                      |
| Store new or updated jobs                        |
| Run deterministic matching                       |
| Run AI judgment                                  |
| Select up to daily target                        |
+-------------------------+------------------------+
                          |
                          v
                 Selected >= target?
                    /             \
                  YES              NO
                   |                |
                   v                v
                 STOP      +-----------------------+
                           | ATTEMPT 2             |
                           |                       |
                           | Request up to 300 more|
                           | Normalize + dedupe    |
                           | Match + AI judge      |
                           | Fill remaining target |
                           +-----------+-----------+
                                       |
                                       v
                              Selected >= target?
                                 /             \
                               YES              NO
                                |                |
                                v                v
                              STOP      +-----------------------+
                                        | ATTEMPT 3             |
                                        |                       |
                                        | Request up to 700 more|
                                        | Normalize + dedupe    |
                                        | Match + AI judge      |
                                        | Fill remaining target |
                                        +-----------+-----------+
                                                    |
                                                    v
                                                  STOP
```

### Provider-call breakdown

`fetch-job-catalogue-v2` supports a maximum request size of 200 jobs per provider call.

The retry budget is divided as follows:

```text
Attempt 1
  -> 1 provider call x 100

Attempt 2
  -> 2 provider calls x 150
  -> total additional request: 300

Attempt 3
  -> 4 provider calls x 175
  -> total additional request: 700
```

Every provider call uses a different compiled campaign query where available.

---

## 7. Query rotation

Compiled campaign search queries rotate across calls.

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

Provider results may overlap.

Global deduplication prevents duplicate storage using identifiers such as:

```text
provider job ID
source job ID
canonical job URL
normalized company
normalized title
normalized location
company-title-location combination
```

---

## 8. Stop conditions

A campaign run stops when any of the following occurs:

```text
1. selected_count >= daily_target

2. attempt_number = 3 and the target has not been reached

3. campaign becomes:
   - paused
   - archived
   - inactive
   - stopped
   - cancelled
   - completed

4. provider returns zero results for the current attempt

5. the attempt produces no usable unique catalogue jobs

6. the provider request budget reaches 1,100

7. an unrecoverable function or provider error occurs
```

Partial results are valid.

Example:

```text
Daily target:              24
Selected live jobs:        14
Selected direct companies: 3
Total review opportunities:17
Shortage:                  7
```

Result:

```text
status: ready_for_review
shortage_after_attempts: 7
target_reached: false
```

Zero selected opportunities:

```text
status: needs_attention
current_stage: failed
selected: 0
```

---

## 9. Orchestrator run records

Every campaign execution uses an `orchestrator_runs` record.

The run stores:

```text
campaign ID
user ID
run type
run date
current stage
overall status
attempt number
stage results
counters
errors
created timestamp
updated timestamp
completion timestamp
```

Example counters:

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
  "live_jobs_selected": 21,
  "direct_companies_selected": 3,
  "selected": 24,
  "held_for_later": 3,
  "shortage_after_attempts": 0,
  "target_reached": true
}
```

Each attempt is stored under:

```text
stage_results.attempts[]
```

Each attempt contains:

```text
attempt number
raw request limit
provider calls
compiled query used by each call
raw fetched count
normalized count
new jobs stored
existing jobs updated
duplicates skipped
deterministic matching results
AI judgment results
selection results
remaining quota
stop reason
```

---

## 10. Opportunity model

Applix currently supports two opportunity types.

```text
ReviewOpportunity
  |
  +-- live_job
  |
  +-- direct_company
```

### 10.1 Live job

Source:

```text
public.jobs
  -> campaign_job_matches
```

A live job contains:

```text
job title
company
location
description
source
source URL
posted date
deterministic result
AI verdict
AI score
selection state
user decision
review timestamp
```

### 10.2 Direct-company opportunity

Source:

```text
campaign template
  -> template_company_pool_links
  -> disability_company_contacts_pool
     or
  -> aged_care_company_contacts_pool
  -> campaign_company_candidates
```

A direct-company opportunity contains:

```text
company name
company website or domain
company contact details
industry pool
campaign relationship
selection state
user decision
review timestamp
```

Current user action:

```text
Approve direct company
  -> approval is saved
  -> opportunity remains visible in campaign history
  -> no automatic application preparation
  -> no automatic draft generation
  -> no automatic email send
```

---

## 11. Tracker ownership model

Shared job information belongs to:

```text
public.jobs
```

Campaign-specific information belongs to:

```text
campaign_job_matches
```

Direct-company campaign information belongs to:

```text
campaign_company_candidates
```

Do not place campaign-specific review state on the shared global job record.

### Live-job ownership

```text
public.jobs
  -> shared catalogue record

campaign_job_matches
  -> campaign ID
  -> deterministic eligibility
  -> deterministic reason
  -> AI status
  -> AI verdict
  -> AI score
  -> AI reason
  -> selected_for_campaign
  -> selection batch
  -> user decision
  -> reviewed_at
```

### Direct-company ownership

```text
company contact pool
  -> shared provider/company record

campaign_company_candidates
  -> campaign-specific selection
  -> opportunity status
  -> user decision
  -> reviewed_at
```

---

## 12. Tracker flow

The tracker uses:

```text
get_review_opportunities
```

This RPC returns a mixed queue of:

```text
live jobs
direct-company opportunities
```

Tracker refresh:

```text
Initial page load
  -> load current user
  -> load latest campaign
  -> call get_review_opportunities
  -> display review cards
  -> poll approximately every 8 seconds
```

Decision flow:

```text
User selects Approve or Skip
  -> decide_campaign_opportunity
```

### Approving a live job

```text
Live job approved
  -> user_decision = approved
  -> reviewed_at recorded
  -> prepare-approved-applications called
  -> application preparation begins
```

### Skipping a live job

```text
Live job skipped
  -> user_decision = skipped
  -> reviewed_at recorded
  -> no enrichment
  -> no draft
  -> no send
```

### Approving a direct company

```text
Direct company approved
  -> user_decision = approved
  -> reviewed_at recorded
  -> approval saved
  -> no automatic draft or send
```

### Skipping a direct company

```text
Direct company skipped
  -> user_decision = skipped
  -> reviewed_at recorded
```

---

## 13. Application preparation

Function:

```text
prepare-approved-applications
```

Required conditions:

```text
authenticated user exists
campaign belongs to authenticated user
campaign is permitted to process
opportunity is a live job
job is selected for campaign
AI verdict is pass
user decision is approved
```

Flow:

```text
Approved live job
  |
  v
prepare-approved-applications
  |
  +-- load job and campaign context
  +-- check for existing company email
  |
  +-- email exists
  |     |
  |     v
  |   generate-job-outreach-drafts
  |
  +-- email missing
        |
        v
      company_enrichment_queue
        |
        v
      process-company-enrichment-queue
        |
        v
      email found
        |
        v
      generate-job-outreach-drafts
```

---

## 14. Company email enrichment

Enrichment runs only after an approved live job needs an email address.

Queue lifecycle:

```text
pending
  -> processing
  -> completed

pending
  -> processing
  -> failed
```

Functions:

```text
prepare-approved-applications
  -> company_enrichment_queue

drain-company-enrichment-queue
  -> claim queue items

process-company-enrichment-queue
  -> reuse contact
  -> enrich contact
  -> update queue

enrich-job-emails
  -> provider-based email discovery

resolve-job-contact-ai
  -> select from supplied candidate contacts
```

The contact resolver operates on supplied candidate emails.

```text
candidate emails supplied
  -> resolver evaluates candidates
  -> selected email must be one of those candidates
```

When enrichment completes:

```text
company email recorded
  -> approved live job becomes email-ready
  -> draft generation begins
```

No Gmail send occurs during enrichment.

---

## 15. Draft generation

Function:

```text
generate-job-outreach-drafts
```

Draft generation requires an approved live-job application.

Normal flow:

```text
Approved live job
  -> email available
  -> generate-job-outreach-drafts
  -> outreach_queue
  -> ready_for_review
```

Draft data may include:

```text
campaign ID
user ID
job ID
application ID
company name
recipient email
email subject
email body
resume reference
draft status
approval status
send status
```

Creating a draft is not the same as sending an email.

```text
draft created
  -> stored for user review
  -> Gmail send remains blocked
```

---

## 16. Draft approval and Gmail sending

Draft review flow:

```text
outreach_queue
  -> user opens draft
  -> user checks recipient
  -> user checks subject
  -> user checks body
  -> user approves draft
  -> approve-outreach-draft
  -> approved send item
```

Send flow:

```text
Approved draft
  -> explicit user send confirmation
  -> send-queued-outreach
  -> validate user and campaign
  -> claim send item
  -> gmail-send
  -> Gmail API
  -> update outreach and application records
```

Possible outreach statuses:

```text
draft
ready_for_review
approved
queued
sending
sent
failed
cancelled
```

Email must not be sent from:

```text
launch-applix-campaign
calsie-campaign-orchestrator-v3
fetch-job-catalogue-v2
match-campaign-jobs
judge-campaign-jobs
select-daily-job-batch
global campaign matcher
global daily fetcher
company enrichment recovery
process-company-enrichment-queue
generate-job-outreach-drafts during normal preparation
```

---

## 17. Current function map

### Frontend API routes

```text
/api/applix/connect-gmail
  -> connect-gmail

/api/applix/schedule-campaign
  -> launch-applix-campaign

/api/applix/run-campaign
  -> launch-applix-campaign
```

### Campaign launch

```text
launch-applix-campaign
  -> calsie-campaign-orchestrator-v3
```

### Campaign orchestrator

```text
calsie-campaign-orchestrator-v3
  -> compile-campaign-search-plan
  -> fetch-job-catalogue-v2
  -> match-campaign-jobs
  -> judge-campaign-jobs
  -> select-daily-job-batch
```

### Scheduled campaign processing

```text
applix-global-daily-job-fetcher
  -> active campaigns
  -> orchestrator processing

applix-global-campaign-matcher
  -> active campaigns
  -> deterministic campaign matching
  -> campaign job match updates
```

### Tracker

```text
get_review_opportunities RPC
  -> campaign_job_matches
  -> campaign_company_candidates

decide_campaign_opportunity RPC
  -> approved
  -> skipped
```

### Preparation

```text
prepare-approved-applications
  -> approved live jobs
  -> company contact reuse
  -> company enrichment queue
  -> draft generation
```

### Enrichment

```text
drain-company-enrichment-queue
  -> process-company-enrichment-queue
  -> enrich-job-emails
  -> resolve-job-contact-ai
```

### Drafting

```text
generate-job-outreach-drafts
  -> outreach_queue
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

---

## 18. Current scheduled jobs

### Global daily job fetcher

```text
Name:
  applix-global-daily-job-fetcher-hourly

Schedule:
  17 * * * *

Frequency:
  hourly at minute 17
```

Flow:

```text
pg_cron
  -> dispatch_applix_daily_job_fetch()
  -> global daily job fetcher
  -> active campaign processing
```

### Global campaign matcher

```text
Name:
  applix-global-campaign-matcher

Schedule:
  */5 * * * *

Frequency:
  every 5 minutes
```

Flow:

```text
pg_cron
  -> dispatch_applix_global_campaign_matcher()
  -> applix-global-campaign-matcher
  -> process eligible active campaigns
```

### Company enrichment recovery

```text
Name:
  applix-company-enrichment-recovery

Schedule:
  */5 * * * *

Frequency:
  every 5 minutes
```

Flow:

```text
pg_cron
  -> recover_company_enrichment_queue()
  -> drain-company-enrichment-queue
  -> process-company-enrichment-queue
```

Scheduler calls use:

```text
Authorization: Bearer <internal token>
x-applix-cron-secret: <cron secret>
```

Secret values must not appear in frontend code, logs, documentation, screenshots, or committed files.

---

## 19. Pause, resume, manual refresh, and archive

### Campaign statuses

```text
draft
active
finding_jobs
launched
paused
archived
stopped
cancelled
completed
inactive
```

### Running campaign controls

```text
[Find New Jobs Now]
[Edit Campaign]
[Pause Campaign]
[Archive Campaign]
```

### Paused campaign controls

```text
[Resume Campaign]
[Edit Campaign]
[Archive Campaign]
```

### Pause campaign

```text
User selects Pause Campaign
  -> campaign.status = paused
  -> scheduled dispatcher skips campaign
  -> campaign matcher skips campaign
  -> orchestrator rejects new execution
  -> application preparation does not begin
  -> draft generation does not begin
  -> sending remains blocked
```

Existing history is preserved.

### Resume campaign

```text
User selects Resume Campaign
  -> campaign.status = active
  -> future scheduled processing resumes
  -> future manual processing is permitted
  -> stored catalogue jobs remain available
  -> stored match records remain available
  -> previous AI judgments remain available
```

### Find new jobs now

```text
Active campaign
  -> user selects Find New Jobs Now
  -> unique manual run is created
  -> same v3 orchestrator is used
  -> same 100/300/700 strategy is used
  -> same daily target rules apply
  -> no email is sent
```

### Archive campaign

```text
User selects Archive Campaign
  -> campaign.status = archived
  -> no scheduled processing
  -> no manual job run
  -> no matching
  -> no AI judgment
  -> no new selection
  -> no application preparation
  -> no enrichment
  -> no drafting
  -> no sending
  -> campaign history remains stored
```

---

## 20. Database ownership boundaries

### User-owned tables

```text
profiles
resume_profiles
campaigns
user_email_authorizations
user_notifications
```

Access is based on the authenticated user.

### Shared catalogue

```text
jobs
job_fetch_runs
```

The job catalogue can be reused across campaigns.

### Campaign-owned processing records

```text
campaign_job_matches
campaign_company_candidates
campaign_leads
orchestrator_runs
applications
outreach_queue
campaign_lead_personalizations
```

### Internal worker tables

```text
company_enrichment_queue
company_enrichment_queue_jobs
gmail_connections
disability_company_contacts_pool
aged_care_company_contacts_pool
```

These support service-side processing.

---

## 21. Trigger map

```text
auth.users INSERT
  -> handle_new_user
  -> profiles INSERT

campaigns INSERT
  -> create campaign-related records

campaigns status UPDATE
  -> update campaign lifecycle

campaign_job_matches INSERT or UPDATE
  -> synchronise campaign lead

campaign_company_candidates INSERT or UPDATE
  -> synchronise direct-company opportunity

orchestrator_runs stage UPDATE
  -> update run processing state

company_enrichment_queue INSERT or UPDATE
  -> dispatch queue worker

company_enrichment_queue_jobs status UPDATE
  -> update parent enrichment record

jobs INSERT or UPDATE
  -> normalize job location
  -> update timestamps
  -> prepare campaign context

jobs application state UPDATE
  -> user notification where applicable

jobs DELETE
  -> archive job information

multiple tables UPDATE
  -> touch updated_at
```

---

## 22. Realtime and polling

Supabase Realtime publication currently includes:

```text
campaign_lead_personalizations
```

The main tracker currently uses polling:

```text
tracker opens
  -> fetch review opportunities
  -> wait approximately 8 seconds
  -> fetch review opportunities again
  -> repeat while tracker is active
```

---

## 23. Production statuses

### Orchestrator run statuses

```text
running
waiting_for_enrichment
ready_for_review
partially_completed
needs_attention
completed
failed
```

### Orchestrator stages

```text
initializing
compiling_search_plan
fetching_jobs
matching_jobs
judging_jobs
selecting_batch
ready_for_review
failed
```

### Match statuses

```text
pending
eligible
ineligible
selected
held_for_later
approved
skipped
```

### AI statuses

```text
pending
processing
completed
failed
```

### User decisions

```text
pending
approved
skipped
```

### Enrichment statuses

```text
pending
processing
completed
failed
```

### Outreach statuses

```text
draft
ready_for_review
approved
queued
sending
sent
failed
cancelled
```

---

## 24. Safety rules

- Never expose the Supabase service-role key.
- Never expose cron secrets.
- Never expose Gmail OAuth secrets.
- Never expose Google access or refresh tokens.
- Never expose OpenAI keys.
- Never expose job-provider keys.
- Never expose private API keys in `NEXT_PUBLIC_` variables.
- Never store secrets in frontend code.
- Never place secrets in logs.
- Never place secret values in this document.
- Never send email during campaign launch.
- Never send email during provider fetching.
- Never send email during deterministic filtering.
- Never send email during AI judgment.
- Never send email during daily selection.
- Never send email during direct-company selection.
- Never send email during company enrichment.
- Never send email merely because a job was approved.
- User job approval is required before application preparation.
- User draft approval and explicit send confirmation are required before Gmail sending.
- Paused campaigns must not process.
- Archived campaigns must not process.
- Draft campaigns must not process scheduled work.
- Stopped campaigns must not process.
- Cancelled campaigns must not process.
- Completed campaigns must not start new processing.
- Inactive campaigns must not process.
- Raw provider requests must not exceed 1,100 per campaign run.
- Selected review opportunities must not exceed the campaign daily target.
- The default production daily target remains 24.
- Campaign-specific review data must remain outside the shared `jobs` record.
- Existing v2 and legacy workers remain separate from the active v3 production path.

---

## 25. Current rollout state

Active production path:

```text
main
  -> launch-applix-campaign
  -> calsie-campaign-orchestrator-v3
  -> compile-campaign-search-plan
  -> fetch-job-catalogue-v2
  -> match-campaign-jobs
  -> judge-campaign-jobs
  -> select-daily-job-batch
```

Current tracker path:

```text
get_review_opportunities
  -> mixed live-job and direct-company queue

decide_campaign_opportunity
  -> approve or skip
```

Current application path:

```text
approved live job
  -> prepare-approved-applications
  -> enrichment when needed
  -> generate-job-outreach-drafts
  -> outreach_queue
  -> user draft approval
  -> explicit send
```

Legacy and fallback functions remain deployed separately, including:

```text
calsie-campaign-orchestrator-v2
applix-daily-job-fetcher
older launch and test functions
provider probes
legacy outreach workers
```

---

## 26. Required controlled smoke test

Use one controlled active campaign.

Test configuration:

```text
daily_target = 2
```

### Campaign execution

```text
1. Start a unique manual campaign run.

2. Confirm launch-applix-campaign accepts the run.

3. Confirm calsie-campaign-orchestrator-v3 is used.

4. Confirm an orchestrator_runs record is created.

5. Confirm attempt 1 requests up to 100 raw jobs.

6. If fewer than 2 opportunities are selected, confirm attempt 2
   requests up to 300 additional raw jobs.

7. If fewer than 2 opportunities are still selected, confirm attempt 3
   requests up to 700 additional raw jobs.

8. Confirm processing stops when selected reaches 2.

9. Confirm selected never exceeds 2.

10. Confirm provider-zero stop is recorded.

11. Confirm no-unique-jobs stop is recorded.

12. Confirm paused campaign execution is rejected.
```

### Tracker

```text
13. Open the AI Review Queue.

14. Confirm get_review_opportunities returns selected opportunities only.

15. Confirm live jobs and direct-company opportunities have distinct types.

16. Confirm live jobs contain deterministic and AI judgment data.

17. Approve one live job.

18. Skip one opportunity.

19. Confirm both user decisions are stored.

20. Confirm skipped opportunity does not start preparation.
```

### Preparation and enrichment

```text
21. Confirm prepare-approved-applications runs only for the approved live job.

22. If an email already exists, confirm the enrichment queue is not required.

23. If an email is missing, confirm company_enrichment_queue receives the job.

24. Confirm enrichment runs only for the approved job.

25. Confirm a resolved email is attached to the approved application.

26. Confirm no draft existed before the job approval.
```

### Drafting and Gmail

```text
27. Confirm generate-job-outreach-drafts creates an outreach_queue record.

28. Confirm the draft is ready for user review.

29. Confirm creating the draft does not send an email.

30. Confirm Gmail sending remains blocked before draft approval.

31. Approve the draft.

32. Confirm no email is sent until the explicit send action.

33. Trigger the explicit send action.

34. Confirm send-queued-outreach claims the approved message.

35. Confirm gmail-send returns a Gmail send result.

36. Confirm outreach and application statuses update to sent.
```

---

## 27. Smoke-test pass criteria

```text
orchestrator v3 is used

orchestrator run record exists

attempt counters are correct

raw request budget does not exceed 1,100

daily target does not exceed 2 during the controlled test

production default remains 24

query rotation is recorded

duplicate jobs are not stored as new jobs

deterministic matching is recorded

AI judgment is recorded for live jobs

selected opportunities are relevant

tracker reads campaign-specific records

tracker supports live_job and direct_company types

shared jobs remain separate from user review state

legacy history remains separate

skipped opportunities do not prepare

approved live jobs can prepare

direct-company approval does not automatically send

enrichment begins only after approved live-job preparation

no draft exists before live-job approval

draft creation does not send

draft approval alone does not bypass explicit send confirmation

no email is sent without the final explicit user action

paused campaigns do not process

archived campaigns do not process

campaign history remains preserved
```

---

## 28. Final end-to-end system flow

```text
USER
 |
 +-- Sign in with Google
 |     |
 |     v
 |   Supabase Auth
 |     |
 |     v
 |   Dashboard
 |
 +-- Upload resume
 |     |
 |     v
 |   Private Supabase Storage
 |
 +-- Create campaign
 |     |
 |     v
 |   campaigns
 |
 +-- Connect Gmail
 |     |
 |     v
 |   Google OAuth
 |     |
 |     v
 |   user_email_authorizations
 |
 +-- Start Campaign / Find New Jobs Now
       |
       v
launch-applix-campaign
       |
       +-- authenticate user
       +-- confirm campaign ownership
       +-- confirm active status
       |
       v
calsie-campaign-orchestrator-v3
       |
       +-- compile-campaign-search-plan
       |
       +-- ATTEMPT 1
       |     +-- request 100
       |     +-- normalize
       |     +-- deduplicate
       |     +-- deterministic match
       |     +-- AI judgment
       |     +-- select
       |
       +-- target not reached?
       |     |
       |     +-- ATTEMPT 2
       |           +-- request 300 more
       |           +-- normalize
       |           +-- deduplicate
       |           +-- deterministic match
       |           +-- AI judgment
       |           +-- select
       |
       +-- target still not reached?
       |     |
       |     +-- ATTEMPT 3
       |           +-- request 700 more
       |           +-- normalize
       |           +-- deduplicate
       |           +-- deterministic match
       |           +-- AI judgment
       |           +-- select
       |
       +-- fill available review quota
             |
             +-- live AI-pass jobs
             |
             +-- direct-company opportunities
             |
             v
get_review_opportunities
             |
             v
AI REVIEW QUEUE
       /                    \
      /                      \
 APPROVE                     SKIP
    |                          |
    |                          v
    |                   decision stored
    |                   no preparation
    |
    +-- LIVE JOB
    |      |
    |      v
    |  prepare-approved-applications
    |      |
    |      +-- company email exists?
    |      |         /            \
    |      |       YES             NO
    |      |        |               |
    |      |        |               v
    |      |        |       company_enrichment_queue
    |      |        |               |
    |      |        |               v
    |      |        |       process enrichment
    |      |        |               |
    |      |        +---------------+
    |      |                |
    |      v                v
    |  generate-job-outreach-drafts
    |      |
    |      v
    |  outreach_queue
    |      |
    |      v
    |  USER REVIEWS DRAFT
    |      |
    |      v
    |  approve-outreach-draft
    |      |
    |      v
    |  EXPLICIT SEND CONFIRMATION
    |      |
    |      v
    |  send-queued-outreach
    |      |
    |      v
    |  gmail-send
    |      |
    |      v
    |  Gmail API
    |      |
    |      v
    |  SENT
    |
    +-- DIRECT COMPANY
           |
           v
       approval stored
           |
           v
       campaign history
           |
           v
       no automatic preparation
       no automatic draft
       no automatic send
```
