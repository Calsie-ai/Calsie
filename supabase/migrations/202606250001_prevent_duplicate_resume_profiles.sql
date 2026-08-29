-- Prevent duplicate resume profile rows for the same profile_id.
-- This migration first archives any existing duplicates, keeps the newest row,
-- then adds a unique index so duplicates cannot be inserted again.

BEGIN;

-- Archive table for any duplicate rows found before enforcing uniqueness.
CREATE TABLE IF NOT EXISTS public.resume_profiles_duplicates_archive AS
SELECT *
FROM public.resume_profiles
WHERE false;

-- Archive older duplicate rows, keeping the newest row per profile_id.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY profile_id
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
    ) AS row_rank
  FROM public.resume_profiles
  WHERE profile_id IS NOT NULL
)
INSERT INTO public.resume_profiles_duplicates_archive
SELECT rp.*
FROM public.resume_profiles rp
JOIN ranked r ON r.id = rp.id
WHERE r.row_rank > 1;

-- Remove older duplicate rows, keeping only the newest row per profile_id.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY profile_id
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
    ) AS row_rank
  FROM public.resume_profiles
  WHERE profile_id IS NOT NULL
)
DELETE FROM public.resume_profiles rp
USING ranked r
WHERE rp.id = r.id
  AND r.row_rank > 1;

-- Enforce one resume profile per profile_id going forward.
CREATE UNIQUE INDEX IF NOT EXISTS resume_profiles_profile_id_unique
ON public.resume_profiles (profile_id)
WHERE profile_id IS NOT NULL;

COMMIT;
