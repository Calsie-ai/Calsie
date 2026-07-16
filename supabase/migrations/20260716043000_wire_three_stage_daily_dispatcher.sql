create or replace function public.dispatch_applix_daily_job_fetch()
returns bigint
language plpgsql
security definer
set search_path to public, vault, extensions
as $function$
declare
  request_id bigint;
  service_key text;
  cron_secret text;
begin
  select decrypted_secret into service_key
  from vault.decrypted_secrets
  where name = 'applix_service_role_key'
  limit 1;

  select decrypted_secret into cron_secret
  from vault.decrypted_secrets
  where name = 'applix_cron_secret'
  limit 1;

  if coalesce(service_key, '') = '' then
    raise exception 'Missing Vault secret applix_service_role_key';
  end if;

  if coalesce(cron_secret, '') = '' then
    raise exception 'Missing Vault secret applix_cron_secret';
  end if;

  select net.http_post(
    url := 'https://bnshgtrqbfuphhhdgccs.supabase.co/functions/v1/applix-daily-job-fetcher-v2',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key,
      'apikey', service_key,
      'x-applix-cron-secret', cron_secret
    ),
    body := jsonb_build_object(
      'scheduled_run', true,
      'source', 'pg_cron_three_stage_daily_job_fetch'
    )
  ) into request_id;

  return request_id;
end;
$function$;
