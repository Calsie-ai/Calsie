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
