do $$
declare
  missing_columns text[];
begin
  select array_agg(required_column order by required_column)
  into missing_columns
  from (
    values
      ('apply_url'),
      ('campaign_id'),
      ('company'),
      ('created_at'),
      ('location'),
      ('title'),
      ('user_id')
  ) as required(required_column)
  where not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'jobs'
      and column_name = required.required_column
  );

  if missing_columns is not null then
    raise exception
      'jobs table is missing required columns for job_dedupe_key guardrail migration: %',
      array_to_string(missing_columns, ', ');
  end if;
end
$$;

alter table public.jobs
  add column if not exists job_dedupe_key text;

update public.jobs
set job_dedupe_key = lower(
  coalesce(nullif(btrim(apply_url), ''), '') || '|' ||
  coalesce(nullif(btrim(company), ''), '') || '|' ||
  coalesce(nullif(btrim(title), ''), '') || '|' ||
  coalesce(nullif(btrim(location), ''), '')
)
where job_dedupe_key is null;

comment on column public.jobs.job_dedupe_key is
  'Stable dedupe key for campaign-scoped job ingestion based on apply_url, company, title, and location.';

create index if not exists jobs_campaign_user_created_at_idx
  on public.jobs (campaign_id, user_id, created_at desc);

drop index if exists public.jobs_campaign_user_job_dedupe_key_idx;
create index jobs_campaign_user_job_dedupe_key_idx
  on public.jobs (
    coalesce(campaign_id, '00000000-0000-0000-0000-000000000000'::uuid),
    user_id,
    job_dedupe_key
  )
  where job_dedupe_key is not null;

do $$
declare
  duplicate_summary text;
begin
  select string_agg(
    format(
      'campaign=%s user=%s key=%s job_ids=[%s]',
      campaign_scope,
      user_scope,
      dedupe_key_scope,
      duplicate_job_ids
    ),
    E'\n'
    order by first_created_at, campaign_scope, user_scope, dedupe_key_scope
  )
  into duplicate_summary
  from (
    select
      coalesce(campaign_id, '00000000-0000-0000-0000-000000000000'::uuid)::text as campaign_scope,
      coalesce(user_id::text, '<null-user>') as user_scope,
      job_dedupe_key as dedupe_key_scope,
      string_agg(id::text, ', ' order by created_at asc, id asc) as duplicate_job_ids,
      min(created_at) as first_created_at
    from public.jobs
    where job_dedupe_key is not null
    group by
      coalesce(campaign_id, '00000000-0000-0000-0000-000000000000'::uuid),
      user_id,
      job_dedupe_key
    having count(*) > 1
  ) duplicates;

  if duplicate_summary is not null then
    raise exception using
      message = 'Cannot create jobs job_dedupe_key guardrail because duplicate jobs already exist.',
      detail = duplicate_summary,
      hint = 'Delete or merge the listed duplicate jobs, then rerun this migration.';
  end if;
end
$$;

drop index if exists public.jobs_campaign_user_job_dedupe_key_unique;
create unique index jobs_campaign_user_job_dedupe_key_unique
  on public.jobs (
    coalesce(campaign_id, '00000000-0000-0000-0000-000000000000'::uuid),
    user_id,
    job_dedupe_key
  )
  where job_dedupe_key is not null;
