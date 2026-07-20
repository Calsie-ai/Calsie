# Applix Development Rules

## Stack
- Next.js
- TypeScript
- Supabase
- Vercel
- Gmail OAuth
- n8n integrations

## Working rules
1. Inspect the relevant files before editing.
2. Do not rewrite unrelated files.
3. Do not replace working architecture without explicit permission.
4. Do not modify production data.
5. Do not create duplicate tables, components, routes or environment variables.
6. Search the repository before creating anything new.
7. Keep changes limited to the requested feature.
8. Preserve existing UI and business logic unless specifically asked to change it.
9. Use existing utilities, components and Supabase clients.
10. Never expose service-role keys in frontend code.

## Required verification
After every change:
- run type checking
- run linting
- run the relevant tests
- run the production build
- report every modified file
- explain what was verified
- disclose anything that could not be verified

## Database rules
- Inspect existing schema and migrations first.
- Use migrations for permanent schema changes.
- Enable RLS on exposed tables.
- Never use service-role credentials in browser code.
- Do not loosen policies merely to fix an error.
- Test database changes before declaring success.

## Response format
1. Cause
2. Files inspected
3. Changes made
4. Tests executed
5. Remaining risks
