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
set