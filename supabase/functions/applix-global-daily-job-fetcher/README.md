# Global daily job fetcher

This function performs one shared Outscraper fetch of up to 100 jobs per Sydney calendar day.

- The function checks `Australia/Sydney` and only runs during the 6 a.m. hour unless `force: true` is supplied.
- `job_fetch_runs.batch_key` prevents a second completed fetch for the same Sydney date.
- Jobs are stored in the global catalogue with `user_id` and `campaign_id` set to null.
- Existing provider IDs, canonical URLs and global dedupe keys are reused.
- It does not generate drafts or send emails.

After the fetch completes, invoke `applix-global-campaign-matcher` repeatedly in small batches until it returns `claimed: 0`.