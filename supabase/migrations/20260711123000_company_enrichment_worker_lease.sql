create table if not exists public.company_enrichment_worker_lease (
  lease_name text primary key,
  holder_id text not null,
  acquired_at timestamptz not null default now(),
  expires_at timestamptz not null
);

revoke all on public.company_enrichment_worker_lease from anon, authenticated;
grant all on public.company_enrichment_worker_lease to service_role;

create or replace function public.acquire_company_enrichment_worker_lease(
  p_holder_id text,
  p_ttl_seconds integer default 180
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  acquired boolean := false;
begin
  insert into public.company_enrichment_worker_lease (
    lease_name,
    holder_id,
    acquired_at,
    expires_at
  )
  values (
    'global',
    p_holder_id,
    now(),
    now() + make_interval(secs => greatest(30, least(p_ttl_seconds, 600)))
  )
  on conflict (lease_name) do update
  set holder_id = excluded.holder_id,
      acquired_at = excluded.acquired_at,
      expires_at = excluded.expires_at
  where public.company_enrichment_worker_lease.expires_at <= now();

  get diagnostics acquired = row_count;
  return acquired;
end;
$$;

create or replace function public.release_company_enrichment_worker_lease(p_holder_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  released boolean := false;
begin
  delete from public.company_enrichment_worker_lease
  where lease_name = 'global'
    and holder_id = p_holder_id;
  get diagnostics released = row_count;
  return released;
end;
$$;

revoke all on function public.acquire_company_enrichment_worker_lease(text, integer) from public, anon, authenticated;
revoke all on function public.release_company_enrichment_worker_lease(text) from public, anon, authenticated;
grant execute on function public.acquire_company_enrichment_worker_lease(text, integer) to service_role;
grant execute on function public.release_company_enrichment_worker_lease(text) to service_role;
