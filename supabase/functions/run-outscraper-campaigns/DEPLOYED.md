# run-outscraper-campaigns

Production project: `bnshgtrqbfuphhhdgccs`

Current deployed version observed in this session:

```text
version: 19
status: ACTIVE
verify_jwt: false
runtime role: scraper / lead normalizer
```

## Current production behavior

- Reads a campaign by `campaign_id`.
- Builds an Indeed search URL from campaign search/location fields.
- Calls the external scraping provider.
- Normalizes job results into `campaign_leads` rows.
- Uses test-only email aliases for lead storage.
- Marks generated leads as pending.
- Upserts into `campaign_leads` with conflict target `campaign_id,found_email`.

## Migration dependency

This function depends on the migration committed at:

```text
supabase/migrations/20260616024700_add_plain_upsert_unique_indexes_for_applix.sql
```

Without the plain unique index on `(campaign_id, found_email)`, PostgREST upsert can fail even if partial/expression indexes exist.

## Known next fix

Lead filtering needs tightening. During the 2026-06-16 test, an IT campaign accepted some unrelated Personal Trainer jobs. The next code change should require accepted leads to match IT/Admin/Developer/Support intent before the AI draft generator runs.
