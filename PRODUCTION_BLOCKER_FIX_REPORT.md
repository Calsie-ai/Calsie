# Production Blocker Fix Report

Date: July 10, 2026
Repository: `Sajan-giri/applix`
Branch: `codex-production-blocker-fixes`
Base branch: `main`
Base commit: `d7802a3f73d8f2dc77197c281f39f9006996fa6d`
Source findings used: PR #16 / `FULL_SMOKE_TEST_REPORT.md`

## Scope

This branch fixes only the confirmed Critical and High findings requested for the existing Next.js app under `frontend`.

No changes were made to product pricing, campaign limits, outreach rules, Gmail scopes, Supabase database structure, or production Supabase data.

No real emails were sent, scraping was not triggered, Stripe production endpoints were not called, and production Supabase data was not modified.

## Fixes Completed

### 1. Stripe webhook fails closed without webhook secret

File: `frontend/app/api/stripe/webhook/route.ts`

- Removed the unsigned `JSON.parse(body)` fallback.
- Added a hard `500` response when `STRIPE_WEBHOOK_SECRET` is missing.
- Kept the missing signature response as `400`.
- Left pricing and subscription plan values unchanged.

### 2. Resume parser requires authenticated Supabase user access

File: `frontend/app/api/applix/parse-resume/route.ts`

- Added bearer token extraction from the `Authorization` header.
- Validates the token with `supabase.auth.getUser(accessToken)` before reading multipart form data.
- Returns `401` for missing, invalid, or expired sessions.
- Returns `500` when required Supabase environment variables are missing.

Supabase Auth reference checked: `getUser(jwt)` performs a network request to the Supabase Auth server and can be used for authorization decisions.

### 3. Resume parser no longer returns raw resume text

File: `frontend/app/api/applix/parse-resume/route.ts`

- Removed `rawText` from successful responses.
- Removed `textPreview` from successful responses.
- Kept only the structured parsed fields and operational metadata (`filename`, `textLength`, `usedOpenAI`, `openAIError`, `filledCount`, `parsed`).

### 4. TypeScript build errors are no longer ignored

Files:

- `frontend/next.config.js`
- `frontend/package.json`

Changes:

- Removed `typescript.ignoreBuildErrors: true` from Next config.
- Added `npm run typecheck` support via `"typecheck": "tsc --noEmit"`.

### 5. Tracker approval flow reflects backend state more accurately

File: `frontend/app/tracker/page.tsx`

- Expanded approval response typing to allow queued, created, not-created, failed, and enrichment-pending style responses.
- `queue_id` or `draft_status: "queued"` maps to `queued`.
- `draft_status: "created"` keeps the row approved and tells the user a draft was created but still needs the queue step.
- missing/not-found provider email state maps to `needs_email` with enrichment messaging.
- explicit enrichment/draft failures map to `failed`.
- `draft_status: "not_created"` no longer appears as a draft creation failure when the function says another enrichment/draft step is still required.

### 6. Missing resume status `.gif` reference fixed

File: `frontend/app/dashboard/page.tsx`

- Replaced `/resume-status/resume-has-been-updated.gif` with the existing `/resume-status/resume-has-been-updated.svg`.
- Confirmed the SVG asset exists at `frontend/public/resume-status/resume-has-been-updated.svg`.

### 7. Added missing public routes

Files:

- `frontend/app/privacy/page.tsx`
- `frontend/app/terms/page.tsx`
- `frontend/app/contact/page.tsx`
- `frontend/app/support/page.tsx`

These are basic public pages using the requested Applix palette of white, black, and `#FE818D`.

## Frontend Auth Call Updates

The parser route now requires an authenticated bearer token, so the existing upload callers were updated:

- `frontend/app/dashboard/page.tsx` now sends `Authorization: Bearer <session access token>` to `/api/applix/parse-resume`.
- `frontend/app/resume-canvas/page.tsx` now sends `Authorization: Bearer <session access token>` to `/api/applix/parse-resume`.

## Source Validation Performed

Connector-backed GitHub validation confirmed the branch diff includes only these files:

- `PRODUCTION_BLOCKER_FIX_REPORT.md`
- `frontend/app/api/applix/parse-resume/route.ts`
- `frontend/app/api/stripe/webhook/route.ts`
- `frontend/app/contact/page.tsx`
- `frontend/app/dashboard/page.tsx`
- `frontend/app/privacy/page.tsx`
- `frontend/app/resume-canvas/page.tsx`
- `frontend/app/support/page.tsx`
- `frontend/app/terms/page.tsx`
- `frontend/app/tracker/page.tsx`
- `frontend/next.config.js`
- `frontend/package.json`

Manual source checks confirmed:

- Stripe webhook no longer parses unsigned events.
- Resume parser auth check runs before `req.formData()`.
- Resume parser responses do not include `rawText` or `textPreview`.
- Dashboard and Resume Canvas include bearer tokens on parser requests.
- Tracker approval messages distinguish queued, draft-created, enrichment-needed, draft-not-created, and failed states.
- `/privacy`, `/terms`, `/contact`, and `/support` route files exist.
- The dashboard resume-ready image points at the existing `.svg` asset.

React/Next.js source review notes:

- No conditional hooks were added.
- New public pages are server components.
- Existing client components keep their current route behavior and only change parser auth/status messaging.

## Requested Runtime Checks

The requested runtime checks could not be completed from this Codex sandbox because a local checkout of the private repository was blocked.

Commands attempted:

- `git ls-remote https://github.com/Sajan-giri/applix.git HEAD`
  - Result from this environment: failed due missing GitHub credentials / Windows credential availability.
- `git clone --branch codex-production-blocker-fixes --single-branch https://github.com/Sajan-giri/applix.git ...`
  - Result from this environment: failed before checkout because the bundled Git runtime could not use the HTTPS remote helper; earlier direct HTTPS access also failed due missing private-repo credentials.

Because the repository could not be checked out locally, these could not be run here:

- dependency install
- `npm run typecheck`
- production build
- available tests
- runtime/browser route smoke tests

The repo currently has `dev`, `build`, `start`, and the newly added `typecheck` script. It still does not define a `test` script.

## Checks To Run In CI Or A Local Authenticated Checkout

From `frontend`:

```bash
npm install
npm run typecheck
npm run build
npm test
```

If no test script exists in the checkout, `npm test` is expected to fail until a test script is added.

Recommended route smoke list after build/dev server starts:

- `/`
- `/privacy`
- `/terms`
- `/contact`
- `/support`
- `/dashboard` unauthenticated redirect behavior
- `/resume-canvas` unauthenticated redirect behavior
- `/tracker` unauthenticated redirect behavior
- `/api/applix/parse-resume` rejects missing bearer token
- `/api/stripe/webhook` rejects missing `STRIPE_WEBHOOK_SECRET` and missing Stripe signature

## Residual Risk

The main residual risk is verification, not scope: the fixes are source-applied on the branch, but install/build/typecheck/browser checks still need to run in GitHub/Vercel CI or any authenticated local checkout of the private repository.
