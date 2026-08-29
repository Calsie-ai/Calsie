# Applix Development Rules

## Stack
- Next.js
- TypeScript
- Supabase
- Vercel
- Gmail OAuth
- n8n integrations

## Two-agent workflow

### Agent 1: Codex — implementer
Codex is responsible for inspecting, editing, testing, and preparing code changes.

For every task, Codex must:
1. Read this file before making changes.
2. Inspect the relevant code, schema, migrations, logs, and existing utilities first.
3. Work on a dedicated branch named `codex/<short-task-name>`.
4. Make the smallest change that satisfies the stated outcome.
5. Run the required checks and record the exact commands and results.
6. Open a draft pull request with a complete implementation summary.
7. Stop after opening or updating the pull request.
8. Never merge the pull request or push feature work directly to `main`.

### Agent 2: ChatGPT — independent auditor
ChatGPT is responsible for diagnosis before implementation and independent review after Codex finishes.

The audit must inspect:
- whether the implementation matches the requested outcome
- the complete pull request diff
- unrelated or duplicated changes
- authentication, RLS, database, and data-isolation risks
- frontend exposure of secrets
- migration and backward-compatibility risks
- test, typecheck, lint, and build evidence
- Vercel, Supabase, Gmail OAuth, and n8n impact where relevant

The audit result must be one of:
- `PASS` — safe to merge
- `PASS WITH NOTES` — acceptable, with non-blocking follow-up items
- `CHANGES REQUIRED` — Codex must correct the listed blocking issues

ChatGPT does not approve based only on Codex's written summary. The actual diff and available evidence must be inspected.

## Required task loop
1. User describes the desired outcome or problem.
2. ChatGPT diagnoses the likely cause and writes a bounded implementation brief.
3. Codex implements the brief on a dedicated branch and opens a draft pull request.
4. ChatGPT audits the pull request and returns an audit status.
5. If changes are required, Codex fixes only the audit findings on the same branch.
6. ChatGPT re-audits the updated pull request.
7. The user merges only after a `PASS` or accepted `PASS WITH NOTES` result.

## Working rules
1. Inspect the relevant files before editing.
2. Do not rewrite unrelated files.
3. Do not replace working architecture without explicit permission.
4. Do not modify production data.
5. Do not create duplicate tables, components, routes, utilities, or environment variables.
6. Search the repository before creating anything new.
7. Keep changes limited to the requested feature.
8. Preserve existing UI and business logic unless specifically asked to change it.
9. Use existing utilities, components, and Supabase clients.
10. Never expose service-role or secret keys in frontend code.
11. Do not hide failing checks, unresolved errors, or unverified assumptions.
12. Do not mix multiple unrelated features in one pull request.

## IMPORTANT: Status-driven, traceable workflow architecture

This is a mandatory development standard for every new asynchronous, scheduled,
multi-step, integration, queue, Cron, and background-processing workflow.
Build each workflow so that failures can be located and understood step by step.

### Required design rules

- Keep separate status fields for each major component. Do not use one overloaded
  status field for an entire workflow.
- Maintain an append-only event log for every meaningful state transition.
- Store stable machine-readable error codes alongside human-readable messages.
- Record timestamps for creation, scheduling, claiming, processing, deferral,
  retry, completion, cancellation, failure, timeout, and recovery.
- Carry linked trace IDs through every stage, including applicable identifiers
  such as `email_id`, `schedule_id`, `scheduler_run_id`, `dispatcher_run_id`,
  `attempt_id`, `gmail_connection_id`, and external provider IDs.
- Preserve schedule and attempt history. Never overwrite the old record when an
  item is deferred, retried, or rescheduled; create a new linked record.
- Record success only after the external provider confirms success.
- Protect claims, reservations, and state transitions against duplicate
  execution and race conditions using atomic database operations or locks.
- Distinguish retryable errors, permanent errors, and unknown external outcomes.
- Add stuck-record detection and recovery for items left in `claimed`,
  `processing`, or equivalent states beyond an expected timeout.
- Make every transition explicit and validate that the previous status permits
  the requested next status.

### Required debugging model

- **Current status:** where the process is now.
- **Event log:** exactly how the process reached that state.
- **Error code:** why it stopped, deferred, retried, or failed.
- **Trace IDs:** which records, runs, attempts, and provider operations belong
  to the same workflow.

### Completion requirement

Before declaring a workflow complete, verify that an internal operator can trace
one item from creation through scheduling, Cron dispatch, claiming, provider
calls, retries, recovery, and final outcome without relying only on temporary
function logs.

## Required verification
After every code change, run the checks that exist in the repository, including where available:
- type checking
- linting
- relevant automated tests
- production build

The pull request must report:
- every modified file
- commands executed
- pass or fail result for each command
- manual checks performed
- anything that could not be verified and why

Do not claim success when a required check failed or was not run.

## Database rules
- Inspect the existing schema, migrations, functions, triggers, and RLS policies first.
- Use migrations for permanent schema changes.
- Enable RLS on exposed tables.
- Never use service-role credentials in browser code.
- Do not loosen policies merely to fix an error.
- Do not alter or delete production data as part of feature implementation.
- Test database changes using safe test records or a non-production environment.
- Document rollback considerations for schema changes.

## Codex completion format
1. Cause
2. Files inspected
3. Changes made
4. Database or environment changes
5. Tests executed and exact results
6. Pull request link
7. Remaining risks

## ChatGPT audit format
1. Audit status
2. What was requested
3. What the diff actually changes
4. Blocking findings
5. Non-blocking findings
6. Verification reviewed
7. Database, security, and deployment risks
8. Merge recommendation
