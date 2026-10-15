# Gmail authorization for the independent Calsie workspace

This change prepares the Gmail connection screen for the NEW Supabase project `ibgmpamvkvjzdxirzxzr`. The browser already signs in to that project. Its Gmail buttons were placeholders; the old connection routes referenced the old project or accepted an unbound Google callback. This change replaces the served frontend routes with an authenticated, browser-bound authorization flow and disables the unsafe direct GET authorization entry point. Duplicate root Google routes delegate to the same implementation.

This authorizes `gmail.send` so the future application sender can email employer contacts. It does **not** enable automatic sending, migrate contacts, change Apify, or alter the old sender. A later sender must read the NEW encrypted connection server-side, verify connected status and current application approval, and enforce the existing one-email-per-hour pacing. Existing plaintext legacy connection tables and send functions must not be attached to this flow.

## Production configuration (server-only)

Set these on the Vercel project whose root directory is `frontend`. Never prefix secrets with `NEXT_PUBLIC_`.

| Variable | Value / source |
| --- | --- |
| `GMAIL_SUPABASE_URL` | Exactly `https://ibgmpamvkvjzdxirzxzr.supabase.co` |
| `GMAIL_SUPABASE_SERVICE_ROLE_KEY` | Service-role/secret key belonging to the NEW project only. No fallback to legacy keys. |
| `GMAIL_TOKEN_ENCRYPTION_KEY` | Dedicated 32 random bytes encoded as standard base64 (44 characters including `=`). Generate in a secure terminal using `openssl rand -base64 32`. |
| `GOOGLE_CLIENT_ID` | Google Web application OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Secret for that same Google OAuth client |
| `GOOGLE_REDIRECT_URI` | Exactly `https://calsie.com.au/api/google/callback` for production |

Enable Gmail API in the Google Cloud project. Configure the OAuth consent screen with `openid`, `email`, and `https://www.googleapis.com/auth/gmail.send` only. Add the exact callback above to that Web application's authorized redirect URIs. Follow Google's verification/testing requirements for the app's actual publishing state; testing-mode users and refresh-token lifetime restrictions must be checked before production use.

**Two different callbacks:** Calsie **login** uses Supabase Auth's Google provider callback (`https://ibgmpamvkvjzdxirzxzr.supabase.co/auth/v1/callback`). Gmail **send authorization** uses the Vercel callback above. Keep both distinct if a shared Google OAuth client is used. Supabase Google sign-in settings and allowed site redirects must already point at the NEW project/site. No Gmail tokens are stored in the browser's Supabase session.

The server validates the configured origin against both POST request URL and `Origin`. Use the canonical `https://calsie.com.au` host. Redirect `www` to this host before showing the dashboard. Preview deployments need their own exact Google callback and matching environment values; production OAuth must not start from a preview host. For local development only, a configured `http://localhost:<port>/api/google/callback` is accepted, with a non-secure local cookie name.

## Apply and verify order

1. Review and apply `supabase/jobs/migrations/20261015085538_gmail_session_connection.sql` to the **NEW project only**, using its normal migration process. No migration has been applied by this PR. The migration was created with `npx --yes supabase@2.54.11 migration new gmail_session_connection --workdir supabase/jobs`, then moved out of that CLI's nested `supabase/` directory to this repository's existing jobs migration directory.
2. Configure the Google client and NEW-only Vercel secrets above. Deploy the reviewed branch as a preview with a matching callback before production deployment.
3. Sign in as user A. On Gmail connection, confirm both existing consent checkboxes, connect a dedicated Google account, and verify the connected status after returning. The Gmail address may differ from A's Calsie login email.
4. Sign in separately as user B. Confirm B cannot see or change A's connection. Test Google denial, a replayed callback, altered/missing state cookie, an expired attempt, and logout before returning. Missing/revoked login sessions must fail closed.
5. Disconnect A; confirm local encrypted credentials are cleared, pending/processing authorizations are cancelled, and provider revocation outcome is recorded. Repeat disconnect while the first request runs; it must not release the reconnect guard. Try an old callback afterward; it cannot restore the connection.
6. Confirm no applications were sent and old Supabase/Apify schedules and data are unaffected.

No live Google consent or deployed callback has been tested in this workspace; those checks require the configured environment and a real test user. New project secrets and production Vercel environment access were unavailable during implementation.

## Session, token, consent and race handling

Every status/start/disconnect request validates its bearer access token using NEW Supabase `getUser`, then confirms its verified `session_id` still exists under that same user in `auth.sessions`. This detects a revoked initiating session as well as expired JWTs. Session payload claims are not trusted before `getUser` succeeds.

An authorization attempt lasts ten minutes. A random state nonce is hashed in the database; an AES-256-GCM encrypted, HttpOnly, SameSite=Lax host cookie binds the nonce, initiating user and access token to the browser. The cookie is scoped to `/`, Secure on HTTPS, deleted after callback, and rejected if its encrypted value exceeds 3,700 bytes. Callback revalidates the initiating login/session and atomically claims an unexpired pending attempt before exchanging the code. A changed account in a separate local browser login does not rewrite that initiating session: the connection always belongs to the initiating authenticated user.

Google must confirm an email-verified account, `gmail.send`, bearer token type and an offline refresh token before connection succeeds. Tokens are encrypted with a user-specific authenticated context, kept only in an unexposed schema, and never returned by the status route. The consent record stores both accepted statements, policy version and attempt timestamp. No browser role has schema/table/function access. The service-only SQL state machine serializes user transitions and appends durable events with attempt/connection/trace identifiers, timestamps and stable error codes.

Disconnect cancels authorizations and clears local tokens **before** the provider request. Repeat disconnect preserves a pending/unknown revocation and cannot confirm an empty token as a successful Google revoke. New connect attempts are blocked while Google revocation is pending. If a request crashes, the next start recovers that pending state to `unknown` after two minutes and records a timeout event. A timed-out provider request cannot prove remote revocation; users must remove Calsie access in Google Account settings before reconnecting when outcome is unknown. Pending/processing OAuth attempts expire and emit timeout events on the next user operation.

Abandoned/failed callback tokens are discarded locally. They are deliberately not remotely revoked by callback cleanup: Google can revoke the entire client/account grant, potentially breaking a newer successful connection. User cancellation can leave an external Google grant, removable from Google Account settings. An operator can inspect `calsie_private.gmail_oauth_attempts`, `gmail_connections` and append-only `gmail_events` through authorized server/admin access; no token, code or provider error payload is logged. There is no autonomous retry/cleanup job in this PR.

## Rollback and key handling

Rollback the application and disable its Gmail entry point together. Preserve the schema/event history for audit. Do not reconnect legacy plaintext send functions to the encrypted records. Removing this schema is destructive and should happen only after disconnecting users, revoking Google grants and deciding retention requirements. Existing old-project accounts/tokens are not copied: users must explicitly reconnect under NEW auth identities.

Keep the encryption key stable across deployments. Changing it makes existing tokens and in-progress cookies unreadable; use a planned decrypt/re-encrypt migration for rotation, or disconnect affected users and require reconnection. Back up the key using the hosting provider's secret process. Do not copy credentials into issues, pull requests or logs.

## Verification commands

From `frontend`: `npm run typecheck`, `node --experimental-strip-types --test tests/gmailConnection.test.mts`, and `npm run build`. There is no lint script/config in this repository. See the PR for existing-suite results and known baseline failures. Embedded PostgreSQL state-machine tests live in `supabase/jobs/tests/gmail-connection.mjs` and can run with `PGLITE_MODULE=/absolute/path/to/@electric-sql/pglite/dist/index.js node supabase/jobs/tests/gmail-connection.mjs` after installing PGlite outside the repository. These are isolated test fixtures, never production data.

## Explicit migration exclusion: approved/sent email status polling

The user has explicitly excluded the old approved/sent-email status checker and its failed/repeated invocations from migration. Do not copy or activate the legacy email status checker, recurring status scans, scheduler migrations, retry loops, or sender workflows as part of Gmail authorization. Do not bulk-apply the root supabase/migrations history to the NEW project.

The Gmail status endpoint in this PR reads connection metadata only. It is requested when the authenticated dashboard initializes or the login token changes, after the Google return, or by an explicit user status retry. It does not inspect approved/sent applications, schedule a job, invoke a Gmail Edge Function, or retry on a timer. The SQL migration creates no cron job, HTTP dispatcher, or recurring trigger.

Any future sending integration must be designed separately around an actual approved application becoming due, with a persisted provider result and bounded failure handling. This document does not authorize migrating or activating any old background checker. Existing Apify recovery/pipeline schedules are separate and were not altered by this PR.
