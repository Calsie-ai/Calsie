Applix Build Plan
This roadmap defines the next product flow for Applix after the editable resume test.

Product vision
Applix should become a job-hunting assistant that can:

Show swipe-style job cards.
Let the user skip, save, or apply to jobs.
Generate a tailored resume and cover email.
Let the user edit the resume before applying.
Open a Gmail draft or email app during the early test stage.
Track prepared and sent applications.
Keep searching for new jobs when the user reaches the end of matches.
Later integrate Google OAuth/Gmail API for draft creation and one-button send.
Current milestone
Milestone 0 — Editable resume self-test
Status: in progress.

Current flow:

Create resume
-> Edit resume directly inside preview
-> Save edits
-> Download PDF
-> Open email/Gmail manually
Success criteria:

User can create an AI resume draft.
User can edit visible resume fields.
Edited resume appears correctly in PDF/download flow.
User can prepare an email manually.
Milestone 1 — Swipe card job flow
Goal: Make the matching page feel like a simple job-card swiping experience.

User actions:

Swipe left / Skip
Swipe right / Save
Apply / Create Resume
Next job
Previous job
Job card should show:

Job title
Company
Location
Match percentage
Application method badge
Hiring email badge if available
Key hints
Apply URL if available
Recommended UI buttons:

[Skip]
[Save]
[Apply]
Database table:

create table if not exists job_interactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  job_id uuid,
  action text,
  created_at timestamptz default now()
);
Action values:

viewed
skipped
saved
resume_created
application_prepared
sent
failed
Success criteria:

User can move through jobs with card actions.
Actions can be saved to Supabase.
Saved/skipped jobs are remembered.
Milestone 2 — End-of-jobs search state
Goal: When the user reaches the last job, Applix should not feel empty. It should become an active hunter.

End screen copy:

Applix is hunting for more jobs.

We are checking public job gateways, company career pages, hiring emails, and application links.

You can come back in a few minutes, refresh now, or ask Applix to email you when jobs are ready.
Buttons:

[Refresh jobs now]
[Find jobs with emails]
[Notify me by email]
Database table:

create table if not exists job_search_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  email text,
  role text,
  location text,
  status text default 'pending',
  results_count int default 0,
  notify_email boolean default false,
  created_at timestamptz default now(),
  completed_at timestamptz
);
Status values:

pending
scraping
completed
failed
Success criteria:

Last-card state appears cleanly.
User can request a refresh.
User can request email notification later.
Search requests are saved.
Milestone 3 — Render Python scraper
Goal: Create a lightweight Render-hosted scraper/gateway service.

Important Render free-tier behaviour:

Free web services may sleep after inactivity.
First request after sleep can be slow.
Scraper should run on request, not constantly.
Store results in Supabase, not Render local storage.
Render service structure:

applix-scraper/
  main.py
  requirements.txt
  render.yaml
Scraper endpoint:

GET /scrape?role=support%20worker&location=Sydney&limit=10&preferEmail=true
Response shape:

{
  "ok": true,
  "role": "support worker",
  "location": "Sydney",
  "jobs": [
    {
      "title": "Disability Support Worker",
      "company": "Example Care",
      "location": "Sydney NSW",
      "sourceWebsite": "Company careers page",
      "applyUrl": "https://example.com/careers",
      "hiringEmail": "careers@example.com",
      "contactConfidence": "high",
      "applicationMethod": "email",
      "hints": ["NDIS Worker Check", "First Aid"],
      "detectedKeywords": ["NDIS", "support worker"],
      "rawSnippet": "Short source summary",
      "scrapedAt": "2026-05-23T00:00:00Z"
    }
  ]
}
Success criteria:

Render scraper returns job gateway data.
Errors do not break Applix.
Scraper favours public company career pages and direct hiring emails.
Milestone 4 — Supabase job gateway storage
Goal: Store scraped/refreshed jobs in Supabase so the user can come back later.

Database table:

create table if not exists jobs_gateway (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  title text,
  company text,
  location text,
  source_website text,
  apply_url text,
  hiring_email text,
  contact_confidence text default 'unknown',
  application_method text default 'unknown',
  hints jsonb default '[]',
  detected_keywords jsonb default '[]',
  raw_snippet text,
  requested_role text,
  requested_location text,
  scraped_at timestamptz default now(),
  refreshed_at timestamptz default now(),
  created_at timestamptz default now()
);
Application methods:

email
apply_link
career_page
job_board
unknown
Ranking order:

1. Email found
2. Direct company apply link
3. Career page
4. Job board only
5. Unknown source
Success criteria:

Refreshed jobs save to Supabase.
Jobs with hiring emails appear first.
Applix can reload stored results.
Milestone 5 — Application kit
Goal: Turn a job into a prepared application.

Application kit includes:

Tailored resume
Cover email
Subject line
Employer email
Apply link
Job hints used
Manual send/checklist buttons
Early test buttons:

[Download Resume PDF]
[Open Gmail Draft]
[Copy Email]
[Mark as Applied]
Success criteria:

User can create a complete application package.
User can manually apply without Gmail API.
User can mark job as applied.
Milestone 6 — Application tracker
Goal: Remember every prepared/sent application.

Database table:

create table if not exists applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  job_id uuid,
  employer_email text,
  subject text,
  email_body text,
  resume_url text,
  status text default 'prepared',
  sent_at timestamptz,
  created_at timestamptz default now()
);
Statuses:

prepared
draft_created
sent
failed
follow_up_needed
rejected
interview
hired
Success criteria:

User can see prepared and sent applications.
Manual applications can be marked as applied.
Later Gmail sends can update this table automatically.
Milestone 7 — Google OAuth and Gmail draft integration
Goal: Integrate with Google after the manual self-test works.

Recommended order:

1. Gmail web/mailto manual flow
2. Google OAuth connection
3. Create Gmail draft
4. Send saved Gmail draft
5. One-button send after confirmation
Important rule:

Do not send blindly. Always preview or confirm before sending.

One-button apply confirmation screen:

Ready to apply?

Job: Disability Support Worker
Company: ABC Care Services
Sending to: careers@example.com
Attached: Tailored resume PDF

[Edit]
[Save Draft]
[Send Application]
Success criteria:

User can connect Google.
Applix can create a Gmail draft.
Later, Applix can send after explicit confirmation.
Immediate build order
Implement in this order:

1. Test editable resume.
2. Add swipe-style buttons and interaction tracking.
3. Add end-of-jobs screen.
4. Add Refresh jobs and Find jobs with emails buttons.
5. Add Render scraper skeleton.
6. Add Supabase SQL migration notes.
7. Add Next.js API route to call Render scraper.
8. Save refreshed jobs to Supabase.
9. Rank email jobs first.
10. Add application kit screen.
11. Add manual Gmail/mailto flow.
12. Add application tracker.
13. Start Google OAuth/Gmail draft work.
14. Add one-button send after Google approval.
Next coding step
Start with Milestone 1:

Add card action states:
- skipped
- saved
- apply/resume_created

Then add an end-of-list state that launches the refresh flow.

---

Production Action Build Plan — Pool, Queue, Cron, and Safe Sending
Last updated: 2026-07-09

This section documents the current production action plan after the company contact pool, enrichment queue, cron worker, and send-safety work.

Core production rule:

Find jobs -> user approves -> prepare applications -> enrich missing emails -> create drafts -> user reviews -> user confirms send

Applix must not automatically send emails just because a queue, cron, or GitHub Action exists.

Current backend status

Completed:

- company_contacts_pool exists as a reusable employer contact cache.
- company_enrichment_queue exists for company-level enrichment work.
- company_enrichment_queue_jobs maps each queue row back to each user, campaign, and job.
- prepare-approved-applications prepares approved jobs by checking the pool first and queuing missing-email companies.
- process-company-enrichment-queue processes company enrichment safely.
- generate-job-outreach-drafts creates draft outreach rows by default.
- send-queued-outreach sends only when explicitly confirmed.
- Sending safety guard is deployed.
- Autonomous sending from GitHub Actions or cron is blocked unless the request includes send_now=true or confirm_send=true.
- Paused, draft, pending, stopped, cancelled, archived, and inactive campaigns are protected from sending.
- Daily and hourly send limits remain enforced.

Current safety rules

- process-company-enrichment-queue is safe for cron.
- send-queued-outreach must not be scheduled as an autonomous GitHub Action or cron.
- send-queued-outreach requires explicit confirmation:

{
  "send_now": true
}

or:

{
  "confirm_send": true
}

Without one of those fields, the function returns a safe skip response and does not send.

Production flow

1. Job approval

User approves one or more jobs from the website.

Approval should update the job to something equivalent to:

user_decision = approved

or:

status = approved

2. Prepare applications

Frontend should call:

POST /functions/v1/prepare-approved-applications

with body:

{
  "campaign_id": "<campaign-id>",
  "limit": 25
}

This function:

- confirms the logged-in user owns the campaign,
- loads approved jobs,
- checks company_contacts_pool,
- updates jobs immediately when pool contact exists,
- queues missing companies into company_enrichment_queue,
- creates drafts for already-ready jobs.

3. Enrichment cron

Only this function should run automatically:

process-company-enrichment-queue

Cron body:

{
  "limit": 5,
  "max_email_finder_calls": 5
}

The function currently hard-caps itself internally to 1 company per run, even when the request sends limit: 5.

This prevents:

- Supabase idle timeout,
- worker resource limit errors,
- accidental multi-company expensive requests,
- stuck processing rows.

4. Draft creation

When an email is found or reused from pool, the worker updates the jobs and calls draft generation.

Draft rows should appear in:

outreach_queue

The safe draft state is:

status = queued
review_status = draft or approved depending UI review flow

The user must review before sending.

5. Manual send only

Sending should only happen from a user action in the website.

The manual send button should call:

POST /functions/v1/send-queued-outreach

with:

{
  "queue_id": "<outreach-queue-id>",
  "send_now": true
}

or:

{
  "queue_id": "<outreach-queue-id>",
  "confirm_send": true
}

Do not schedule this function.

Cron setup

The cron should call only:

process-company-enrichment-queue

Recommended schedule:

* * * * *

That means every minute.

Recommended SQL shape:

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

Do not paste real secrets into GitHub, frontend code, or public chat.

GitHub Actions rule

Keep this workflow disabled for now:

Send queued outreach

Reason:

- it is for sending,
- sending must be manual for now,
- backend is protected, but the safest product rule is no autonomous email sending.

The GitHub Action can be revisited later after there is a clear user-controlled scheduling setting.

Campaign pause rule

Campaigns with these statuses should not send:

paused
pause
stopped
cancelled
canceled
archived
draft
pending

A paused campaign can still keep historical jobs and drafts, but sending must be blocked.

Recommended user-facing statuses:

draft
active
paused
completed

Frontend work still needed

A. Confirm prepare button wiring

The website must include a button or action such as:

Prepare approved applications

It should call prepare-approved-applications with the signed-in user's JWT.

Success response should show counts:

- approved jobs seen,
- pool hits,
- queued companies,
- jobs updated from pool,
- drafts created.

B. Manual send button

The website send button must send with explicit confirmation:

{
  "queue_id": "<id>",
  "send_now": true
}

or:

{
  "queue_id": "<id>",
  "confirm_send": true
}

Do not call send-queued-outreach without that confirmation field.

C. Pause campaign button

The frontend should support:

Pause campaign
Resume campaign

Pause should set:

campaigns.status = paused

Resume should set:

campaigns.status = active

The backend send function already respects paused status.

Verification checklist

Backend checks

Check cron exists:

select jobid, schedule, active, jobname
from cron.job
where jobname = 'process-company-enrichment-queue-every-minute';

Check enrichment queue:

select company_name, status, attempts, last_error, processed_at, updated_at
from public.company_enrichment_queue
order by updated_at desc
limit 20;

Check drafts:

select recipient_company, recipient_email, status, review_status, scheduled_send_at, created_at
from public.outreach_queue
order by created_at desc
limit 20;

Check autonomous send protection:

curl -X POST "https://bnshgtrqbfuphhhdgccs.supabase.co/functions/v1/send-queued-outreach" \
  -H "x-cron-secret: $APPLIX_CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{}'

Expected response:

{
  "ok": true,
  "function": "send-queued-outreach",
  "send_skipped": true,
  "reason": "explicit_send_required"
}

Website checks

1. Open a campaign.
2. Approve one Needs email job.
3. Trigger Prepare approved applications.
4. Confirm company appears in company_enrichment_queue if no pool hit exists.
5. Wait for cron to process.
6. Confirm draft appears in outreach_queue if email is found.
7. Confirm email does not send until manual send button sends send_now=true.

Merge checklist

Before merging the branch into main:

- Confirm Vercel preview passes.
- Confirm Supabase functions were deployed from the branch.
- Confirm migration files do not insert unsupported lead_contact_emails.status = 'blocked' values.
- Keep Send queued outreach GitHub Action disabled.
- Rotate exposed service role and cron secrets before real public users.
- Confirm frontend prepare button is wired.
- Confirm manual send button includes send_now=true or confirm_send=true.

Current decision

The backend engine is ready for controlled testing.

The next product task is frontend confirmation:

Approve job -> prepare approved applications -> queue/enrich -> draft appears -> manual send only

Do not enable autonomous send workflows until Applix has a user-controlled sending schedule and clear pause/resume controls.
