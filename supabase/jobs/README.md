# Calsie Jobs project

Project ref: `ibgmpamvkvjzdxirzxzr`.

This directory contains the fresh Calsie application migration and Edge Function
for the Jobs Supabase project. The root `supabase/migrations` directory belongs
to the original project. Apply migrations only to their named project.

The app uses this project's Auth, `calsie_profiles`, `calsie_agents`,
`calsie_job_swipe_decisions`, and the three category-specific Apify job tables.
Payment and the previous application's routes are disabled during the cutover.
