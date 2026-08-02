import { serveJobPipeline } from "../_shared/apify-nsw-jobs.ts";

serveJobPipeline({
  functionName: "apify-aged-care-jobs-nsw",
  version: "1.0.0",
  source: "apify_indeed_aged_care",
  table: "aged_care_jobs_nsw",
  templateSlug: "agecare",
  category: "aged_care",
  poolKey: "aged_care",
  searchTerms: [
    "aged care worker",
    "personal care assistant aged care",
    "home care worker aged care",
    "assistant in nursing aged care",
    "community care worker aged care",
  ],
  includeTerms: [
    "aged care worker",
    "aged care support worker",
    "personal care assistant",
    "personal care worker",
    "home care worker",
    "assistant in nursing",
    "community care worker",
  ],
  excludeTerms: [
    "disability support worker",
    "childcare worker",
    "early childhood educator",
    "support coordinator",
    "manager",
  ],
});
