alter table public.campaign_templates
  add column if not exists campaign_name text not null default '',
  add column if not exists image_url text,
  add column if not exists image_path text;

update public.campaign_templates
set campaign_name = title
where campaign_name = '';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'template-images',
  'template-images',
  true,
  5242880,
  array['image/jpeg','image/png','image/webp']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;