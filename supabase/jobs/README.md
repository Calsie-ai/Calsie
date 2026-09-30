# Calsie Jobs project

Project ref: `ibgmpamvkvjzdxirzxzr`.

This directory contains the fresh Calsie application migration and Edge Function
for the Jobs Supabase project. The root `supabase/migrations` directory belongs
to the original project. Apply migrations only to their named project.

The app uses this project's Auth, `calsie_profiles`, `calsie_agents`,
`calsie_job_swipe_decisions`, and the three category-specific Apify job tables.
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
