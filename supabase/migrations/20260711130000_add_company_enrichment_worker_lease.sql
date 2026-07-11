create table if not exists public.queue_worker_leases (
  worker_name text primary key,
  locked_by text,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

insert into public.queue_worker_leases (worker_name)
values ('company_enrichment')
on conflict (worker_name) do nothing;

create or replace function public.claim_company_enrichment_queue(
  p_worker_id text,
  p_lease_seconds integer default 180
)
returns setof public.company_enrichment_queue
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.company_enrichment_queue%rowtype;
begin
  update public.queue_worker_leases
  set locked_by = p_worker_id,
      locked_until = now() + make_interval(secs => greatest(30, least(p_lease_seconds, 300))),
      updated_at = now()
  where worker_name = 'company_enrichment'
    and (locked_until is null or locked_until < now() or locked_by = p_worker_id);

  if not found then
    return;
  end if;

  select * into v_row
  from public.company_enrichment_queue
  where status = 'pending'
    and available_at <= now()
    and attempts < max_attempts
  order by priority asc, created_at asc
  for update skip locked
  limit 1;

  if not found then
    update public.queue_worker_leases
    set locked_by = null, locked_until = null, updated_at = now()
    where worker_name = 'company_enrichment' and locked_by = p_worker_id;
    return;
  end if;

  update public.company_enrichment_queue
  set status = 'processing',
      locked_at = now(),
      locked_by = p_worker_id,
      updated_at = now()
  where id = v_row.id
  returning * into v_row;

  return next v_row;
end;
$$;

create or replace function public.release_company_enrichment_lease(p_worker_id text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.queue_worker_leases
  set locked_by = null, locked_until = null, updated_at = now()
  where worker_name = 'company_enrichment' and locked_by = p_worker_id;
$$;

revoke all on function public.claim_company_enrichment_queue(text, integer) from public;
revoke all on function public.release_company_enrichment_lease(text) from public;
grant execute on function public.claim_company_enrichment_queue(text, integer) to service_role;
grant execute on function public.release_company_enrichment_lease(text) to service_role;