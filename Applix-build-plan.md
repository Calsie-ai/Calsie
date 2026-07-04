# Applix Build Plan

## 30-Day Campaign Run Rules

For each campaign, Applix should follow a controlled 30-day outreach run.

### Daily and Hourly Limits

- Run for 30 days.
- Target 24 jobs per day.
- Target 1 job/email per hour.
- Do not process 24 jobs every hour.
- Maximum campaign total: 720 jobs/emails across 30 days.

### Fresh Job Requirement

- Fetch jobs posted within the last 24 hours where the job provider supports this filter.
- If the provider does not support a strict 24-hour filter, fetch jobs first and then filter by `posted_at` where it can be parsed.
- Do not prioritise old jobs when fresh jobs are available.

### Duplicate Protection

The system must prevent duplicates before creating drafts or sending emails.

Required duplicate checks:

- No same job twice.
- No same company/job duplicate.
- No duplicate job URL for the same campaign/user.
- No duplicate company + title + location for the same campaign/user.
- No duplicate `outreach_queue` draft for the same `job_id`.
- No duplicate recipient email for the same campaign.

### Email Extraction Cost Control

Before calling any paid email finder or extraction API:

1. Check `jobs.extracted_email`.
2. Check `lead_contact_emails` for a reusable email for the same company name or company website/domain.
3. Check `jobs.email_extraction_status`.
4. Check `jobs.email_extraction_attempt_count`.
5. Do not call a paid extraction API more than once per job unless manually forced.

If no reusable email exists and no paid provider is configured, the job should be marked safely as URL apply, not repeatedly retried.

### Draft-First Workflow

- Create outreach rows as drafts first.
- Use `status = 'draft'`.
- Use `review_status = 'ready_for_review'`.
- Use `send_window = 'manual_review'`.
- Never send automatically before user approval.
- Sending should happen only after the user approves the draft.

### Safe Campaign Flow

The intended production flow is:

```txt
fetch fresh jobs
→ remove duplicates
→ enrich/reuse email
→ create draft in outreach_queue
→ user reviews
→ user approves
→ send through connected Gmail
```

### Current Priority

Before a real 30-day Gmail run, confirm the system has:

- Strong database-level job duplicate protection.
- Strong `outreach_queue.job_id` duplicate protection.
- Same-recipient duplicate protection per campaign.
- 1 draft/email per hour guard.
- 24 drafts/emails per day guard.
- 720 total drafts/emails per 30-day campaign guard.
