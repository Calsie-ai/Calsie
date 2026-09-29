-- The authenticated client reads its own decisions. Validated writes go
-- through the Calsie server route using the main project's service role.
drop policy if exists "Users add own campaign decisions" on public.calsie_agent_job_decisions;
drop policy if exists "Users update own campaign decisions" on public.calsie_agent_job_decisions;
revoke insert, update on public.calsie_agent_job_decisions from authenticated;
