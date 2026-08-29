-- Add career targeting fields for Applix profile matching.
-- Run this in Supabase SQL Editor before relying on these fields in production.

alter table if exists resume_profiles
add column if not exists industry text,
add column if not exists industry_specialisation text,
add column if not exists target_keywords jsonb default '[]'::jsonb;

alter table if exists profiles
add column if not exists industry text,
add column if not exists industry_specialisation text;

create table if not exists job_interactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  job_id text,
  job_title text,
  company text,
  action text,
  created_at timestamptz default now()
);
