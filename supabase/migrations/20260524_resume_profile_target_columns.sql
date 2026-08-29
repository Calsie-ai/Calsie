-- Adds target fields used by Applix matching and hourly job hunt.
-- Safe to run multiple times.

alter table resume_profiles
  add column if not exists industry text,
  add column if not exists industry_specialisation text,
  add column if not exists target_keywords jsonb default '[]'::jsonb;

update resume_profiles
set target_keywords = '[]'::jsonb
where target_keywords is null;
