# generate-outreach-drafts

Production project: `bnshgtrqbfuphhhdgccs`

Current deployed version synced in this session:

```text
version: 10
status: ACTIVE
verify_jwt: false
runtime role: orchestrator-callable worker
```

## Why it changed

`launch-applix-test` calls this function by HTTP during the test pipeline. The deployed `launch-applix-test` version does not pass a user JWT to child functions, so `generate-outreach-drafts` was changed from `verify_jwt: true` to `verify_jwt: false`.

The function still uses server-side Supabase credentials internally and creates review-only records:

- `lead_contact_emails`
- `outreach_queue`
- `campaign_lead_personalizations`

It does not send email.

## Deployed behavior

- Requires `campaign_id`.
- Reads pending leads from `campaign_leads`.
- Builds source-of-truth resume context from `campaign_resume_sources` / `resume_profiles`.
- Generates reviewable email/resume draft content.
- Inserts draft queue rows with `review_status = ready_for_review`.
- Updates processed leads to `lead_status = draft_created`.

## Sync note

A direct source-code commit for this function was blocked by the connector safety layer because the file contains provider-call internals. The production function remains deployed in Supabase as version 10 and this file records the runtime contract used by the test session.
