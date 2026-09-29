# Calsie application deployment and ingestion boundaries

## Branch comparison (28 September 2026)

- GitHub default branch: `codex/notifications-mvp` at `88957c5`.
- `main` at `4389c59` contains that history and seven newer commits, including
  Google login return handling, payment UI updates and the testimonial changes.
- The deployed website uses `codex/calsie-landing-testimonials` at `975b655`.
  Its testimonial components, styling and images are also present in `main`.
  Its branch has different commit history; comparing files confirms those assets
  are retained, while `main` adds the newer login and payment work.
- PR #1 (`codex/auth-project-preview`) targets `main` and only removes the tracked
  old-project environment file and replaces the example URL. It remains a
  separate prerequisite for the Auth migration.

Recommendation: use `main` as the shared release branch after preview validation.
Changing the GitHub default branch, Vercel production branch, or Supabase dashboard
integration is a separate approved settings change. This PR does not change them.

## Application delivery

1. Make a scoped change on `codex/<task>` and open a draft PR targeting `main`.
2. Vercel's existing Git integration builds the frontend preview. No second
   Vercel deployment workflow is needed. The auth preview reports `source: git`.
3. Review the actual diff, required checks and preview with the user.
4. After user approval, merge. Once Vercel's production branch is set to `main`,
   successful builds from that branch update the production website.
5. Application Edge Functions use only `.github/workflows/deploy-supabase.yml`.
   PRs validate the function allowlist and deployment boundary tests without
   deployment secrets. Pushes to `main` and manual runs on `main` may deploy only
   when the repository variable `CALSIE_APP_DEPLOY_ENABLED` is exactly `true`.

This PR removes the second, overlapping function deployment workflow. It never
runs a bare `supabase functions deploy`, applies SQL migrations, resets a
database, or invokes any deployed function.

## Initial state and activation

`supabase/application-functions.txt` is intentionally empty. The old repository
contains functions whose tables, secrets, JWT configuration and access policies
have not yet been reviewed against the new backend. Merging this PR alone must
not import them. Validation accepts an empty list; deployment refuses it.

Before activating application deployments:

1. Finish the new-project Auth preview and merge the approved environment cleanup
   from PR #1. Validate both Preview and Production settings separately.
2. Review each application function, its full dependency chain, required schema,
   secrets, JWT settings and user access checks. Add only approved function slugs
   to the allowlist through a reviewed PR. Review shared code changes too.
3. Prepare needed database changes as separate reviewed migrations; the existing
   legacy migration directory is not automatically applied by this workflow.
4. Verify GitHub's `Production` environment and its protection rules. Configure
   the existing secret names `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF`
   there. The project ref must be `ibgmpamvkvjzdxirzxzr`; an old or missing ref is
   rejected before deployment. API publishable/anon and service-role keys do not
   replace the CLI's Supabase access token. Keep tokens out of logs and the browser.
5. Inspect the Supabase dashboard GitHub integration separately. The last supplied
   screenshot had automatic production deployment enabled for
   `codex/notifications-mvp`. Disable that duplicate automatic deployment route
   with approval before making GitHub Actions the application deployment owner.
   This workflow cannot restrict an independently enabled dashboard integration.
6. After explicit user approval, enable the repository variable
   `CALSIE_APP_DEPLOY_ENABLED=true`. The job uses the `Production` environment;
   configure required reviewers there if desired. The activation variable must
   be repository-scoped because the job condition runs before environment access.
7. Validate a named-function deployment and a real application request. A successful
   CLI deployment does not prove that authentication or user data access works.

After activation, matching pushes to `main` deploy every approved function by
name, so shared dependencies are included. Runs are serialized per branch and
stop on the first CLI failure. Earlier successful functions are not rolled back
automatically; inspect the Actions run, repair the cause and redeploy the reviewed
version. The workflow's run ID, commit SHA and per-function CLI output provide
the deployment trace. Disable the activation variable to pause future deployment
jobs; cancel any already running job separately.

## Separate Apify ingestion unit

Scraping, completion webhooks, collection, AI filtering, deduplication and job
storage are independently operated. The application consumes stored jobs through
reviewed database access; a website release must not launch scraping or redeploy
ingestion functions.

The application deploy script rejects any slug containing `apify` and deploys only
the positive allowlist. Reviewers must also exclude generically named functions
that invoke scraping or change ingestion state; a name check alone cannot detect
indirect calls. No Apify function, scheduler, webhook, secret, table or data is
changed in this PR. The current `apify-jobs-v2`, its orchestrator and AI worker
exist in Supabase but are absent from `main`; do not substitute old repository
implementations for them. Backing up and versioning that unit is a separate task.

The existing `send-queued-outreach.yml` schedule also remains a separate workflow.
Recent runs failed; its target and behavior require review before the Gmail
feature is activated. Do not run it merely to test deployments.

## Verification commands

```sh
python3 -m unittest discover -s scripts/tests -v
python3 scripts/deploy_application_functions.py --check
git diff --check
```

The tests mock the CLI and verify that empty/invalid lists, Apify entries, missing
source, duplicates and the wrong project cannot deploy; only approved names are
passed to the CLI, and a failure stops subsequent deployments. Run the existing
frontend typecheck, tests and build as required by `AGENTS.md` and report failures.
No Supabase deployment is required to validate this cleanup PR.
