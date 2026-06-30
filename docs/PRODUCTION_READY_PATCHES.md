# Applix Production Readiness Patches

These are the required production hardening patches discovered from the Supabase Edge Function and database audit.

## 1. Supabase Edge Function JWT settings

Turn JWT verification on for these functions after internal callers pass Authorization headers:

```bash
supabase functions deploy run-outscraper-campaigns --project-ref bnshgtrqbfuphhhdgccs --verify-jwt
supabase functions deploy generate-outreach-drafts --project-ref bnshgtrqbfuphhhdgccs --verify-jwt
```

Keep this function public because Google OAuth must call it:

```txt
gmail-oauth-callback
```

## 2. Patch internal Edge Function calls

Any Edge Function that calls another protected Edge Function must send the service role token.

Replace this pattern:

```ts
async function callFunction(name: string, body: Row) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
```

With:

```ts
async function callFunction(name: string, body: Row) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "apikey": SUPABASE_SERVICE_ROLE_KEY,
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));

  return {
    ok: response.ok && payload?.ok !== false,
    status: response.status,
    payload,
  };
}
```

Affected functions:

```txt
launch-applix-test
launch-applix-campaign
applix-agent-orchestrator
applix-campaign-runner
```

## 3. Outreach queue schema compatibility

Current `applix-agent-email-scheduler` expects:

```txt
attempt_count
sent_at
```

Current `outreach_queue` table has:

```txt
send_attempts
updated_at
```

Preferred code fix:

Replace:

```ts
.lt("attempt_count", maxAttempts)
```

With:

```ts
.lt("send_attempts", maxAttempts)
```

Replace:

```ts
attempt_count: attemptCount
```

With:

```ts
send_attempts: attemptCount
```

Replace:

```ts
.gte("sent_at", startOfUtcDay(now).toISOString())
```

With:

```ts
.gte("updated_at", startOfUtcDay(now).toISOString())
```

This keeps the code aligned with the current production database schema.

Alternative database compatibility migration:

```sql
alter table public.outreach_queue
  add column if not exists attempt_count integer not null default 0,
  add column if not exists sent_at timestamptz;

update public.outreach_queue
set attempt_count = greatest(coalesce(attempt_count, 0), coalesce(send_attempts, 0));

update public.outreach_queue
set sent_at = coalesce(sent_at, updated_at)
where status in ('sent', 'sent_test') and sent_at is null;
```

## 4. Cron auth must fail closed

Replace this unsafe pattern:

```ts
function isAuthorized(req: Request) {
  if (!CRON_SECRET) return true;
  const authHeader = req.headers.get("authorization") || "";
  const cronHeader = req.headers.get("x-applix-cron-secret") || "";
  return authHeader === `Bearer ${CRON_SECRET}` || cronHeader === CRON_SECRET;
}
```

With:

```ts
function isAuthorized(req: Request) {
  if (!CRON_SECRET) {
    throw new Error("CRON_SECRET is not configured. Refusing to run.");
  }

  const authHeader = req.headers.get("authorization") || "";
  const cronHeader = req.headers.get("x-applix-cron-secret") || "";

  return authHeader === `Bearer ${CRON_SECRET}` || cronHeader === CRON_SECRET;
}
```

Affected functions:

```txt
applix-campaign-runner
applix-agent-orchestrator
```

## 5. Gmail sender identity

Campaigns should store the Gmail connected identifier in `outreach`.

Example:

```sql
update public.campaigns
set outreach = jsonb_set(
  jsonb_set(
    coalesce(outreach, '{}'::jsonb),
    '{sender_user_identifier}',
    '"sajan3310giri@gmail.com"'::jsonb,
    true
  ),
  '{gmail_user_identifier}',
  '"sajan3310giri@gmail.com"'::jsonb,
  true
)
where id = 'e3c5ceda-9a90-4335-a281-5aa2a1132d5b';
```

Otherwise the scheduler may use a campaign UUID instead of the Gmail-connected email and return:

```txt
No connected Gmail authorization found.
```

## 6. Approval status transition

When a user approves a draft, update the queue row to:

```sql
update public.outreach_queue
set
  status = 'queued',
  review_status = 'approved',
  updated_at = now()
where id = '<QUEUE_ID>';
```

The scheduler should not send `pending_user_approval` rows.

## 7. Block fake/test recipients before production

```sql
update public.outreach_queue
set
  status = 'blocked_fake_email',
  review_status = 'blocked_fake_email',
  last_error = 'Blocked fake/test recipient before production send.',
  updated_at = now()
where recipient_email ilike 'hostsajan+applix-%'
   or recipient_email = 'hostsajan@gmail.com';
```

## 8. Vercel environment variable rule

Allowed public variables:

```txt
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

Never expose these with `NEXT_PUBLIC_`:

```txt
SUPABASE_SERVICE_ROLE_KEY
OPENAI_API_KEY
OUTSCRAPER_API_KEY
GOOGLE_CLIENT_SECRET
CRON_SECRET
APPLIX_CRON_SECRET
```

## 9. Production send flow

Expected safe flow:

```txt
scrape jobs
-> create campaign_leads
-> generate outreach_queue drafts
-> user reviews
-> user approves
-> status becomes queued / approved
-> scheduler sends
-> status becomes sent / sent
```

Do not send directly from draft or pending_user_approval.
