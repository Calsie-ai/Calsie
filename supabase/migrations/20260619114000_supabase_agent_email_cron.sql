-- Supabase-side scheduler for the Applix 10-day agent orchestrator.
-- This keeps backend automation inside Supabase, not Vercel.
--
-- Runs every hour and calls:
--   /functions/v1/applix-agent-orchestrator
--
-- Required before this cron can work:
-- 1. Deploy Edge Functions:
--      gmail-send-test
--      applix-agent-email-scheduler
--      applix-agent-orchestrator
-- 2. Store your service role key in Supabase Vault with name:
--      applix_service_role_key
--
-- SQL to create/update the vault secret manually in Supabase SQL editor:
--   select vault.create_secret('YOUR_SUPABASE_SERVICE_ROLE_KEY', 'applix_service_role_key');

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Remove older duplicate jobs if they exist.
select cron.unschedule(jobid)
from cron.job
where jobname in (
  'applix-agent-orchestrator-hourly',
  'applix-agent-email-scheduler-hourly',
  'applix-email-send-hourly',
  'applix-vercel-email-send-hourly'
);

-- Schedule the full Applix agent orchestrator hourly.
select cron.schedule(
  'applix-agent-orchestrator-hourly',
  '0 * * * *',
  $$
  select
    net.http_post(
      url := 'https://bnshgtrqbfuphhhdgccs.supabase.co/functions/v1/applix-agent-orchestrator',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'applix_service_role_key'
          limit 1
        ),
        'apikey', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'applix_service_role_key'
          limit 1
        )
      ),
      body := jsonb_build_object(
        'test_mode', true,
        'test_recipient_email', 'hostsajan@gmail.com',
        'agent_days', 10,
        'daily_job_limit', 100,
        'daily_email_limit', 100,
        'hourly_email_limit', 4,
        'max_campaigns', 10
      )
    );
  $$
);
