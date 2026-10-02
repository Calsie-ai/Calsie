# Calsie Jobs project

Project ref: `ibgmpamvkvjzdxirzxzr`.

This directory contains the fresh Calsie application migration and Edge Function
for the Jobs Supabase project. The root `supabase/migrations` directory belongs
to the original project. Apply migrations only to their named project.

The app uses this project's Auth, `calsie_profiles`, `calsie_agents`,
`calsie_job_swipe_decisions`, and the three category views of `apify_jobs_inbox`. Legacy category tables are read only for saved history.
Payment and the previous application's routes are disabled during the cutover.

## Agent ownership release

`20260930060127_agent_ownership.sql` is an additive migration for this project
only. Apply this file before releasing the frontend changes; do not run the
root project's historical migrations against the Jobs project. It restores
`calsie_agents` if absent, keeps an existing table's rows, and adds owned-agent
selection, deferred payment status, lifecycle events, and guarded swipe writes.

Each user owns at most one agent per category. Choosing an owned agent returns
its existing campaign without resetting location, status, timestamps, or swipe
history. Campaigns begin as drafts and start/pause/resume category job review.
Payment is recorded as `deferred`; no Stripe subscription or purchase is created.
Gmail and automatic applications remain separate integration work.

Deploy `functions/calsie-agent-feed/index.ts` only to project
`ibgmpamvkvjzdxirzxzr` after the migration, then release the frontend. The feed
keeps paused/draft agents selectable and their reviewed history visible, while
only active campaigns expose new review jobs. The database locks the agent row
during each decision insert so a concurrent pause cannot be bypassed.

Run `tests/agent-ownership.sql` on a disposable database after the migration.
It creates test users inside a rolled-back transaction and covers ownership
isolation, anonymous access, duplicate selection, deferred payment protection,
valid lifecycle transitions, event integrity, and preserved swipe history.

The restored swipe foreign key is `NOT VALID` to retain historical rows without
rewriting them. New writes are checked immediately. Inspect historical orphans
before validating this constraint in a later maintenance step. Existing agents
retain their prior status; lifecycle logging begins with this release.

Rollback: roll back the frontend and feed together; retain owned agents and
events rather than deleting user history. Payments remain deferred. Never point
the app back at the old project as a rollback mechanism.

## Smash / Pass review release

No new tables or migration are needed. Deploy both `index.ts` and `feedRules.ts`
from the `calsie-agent-feed` function folder to the NEW project after merging.
The frontend alone does not release the function code.

Pending jobs come from the selected owner's active agent category, newest first,
excluding that user's prior decisions for that agent. Saved location is applied
both when fetching jobs and when accepting a decision. Postcode-derived labels
match the detected state because scraped listings do not consistently include
postcodes or coordinates; this is not a distance/radius filter. City-only labels
match their normalized city/state words. Australia means the whole category pool.
History is retained even if a job no longer matches the location. No experience
ranking, fabricated compatibility score or Day 8 recommendation routing is added.

Deploy rollback: restore the previous function and frontend together. Existing
agents, decisions, and lifecycle events are retained.

## Current inbox feed release

Apply `migrations/20261002040653_current_inbox_job_feed.sql` ONLY to the new
project, then deploy `functions/calsie-agent-feed/index.ts` with `feedRules.ts`,
then release the frontend. This function is not deployed by the root application
function workflow; merging the frontend alone does not activate the backend.

The migration widens swipe IDs to text, preserving old numeric IDs and allowing
inbox UUIDs. Pending cards come from eligible category views, ordered by
`first_seen_at` descending, with the owner's active campaign location applied.
History retains its original source table and ID. Historical cards load from
their original pool or saved snapshot. Provider IDs/URLs suppress reviewed legacy
listings in the new inbox queue.

`batch_date` is the first-fetch day in Australia/Sydney. Posted dates come from
the provider's listing date, never the collection timestamp. Background refresh
retains the current card position; explicit reload uses newest-fetch order.
No daily quota or personalized recommendation AI is added.

Run `node --experimental-strip-types --test tests/currentInboxFeed.test.mts`
from `frontend` for UUID, history, category, ownership and API regressions.
Rollback the frontend and function together, retaining the text ID column and
all decisions. Casting UUID decisions back to bigint is not a safe rollback.
