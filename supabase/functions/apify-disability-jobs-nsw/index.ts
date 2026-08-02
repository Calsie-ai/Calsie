import { serveJobPipeline } from "../_shared/apify-nsw-jobs.ts";

serveJobPipeline({
  functionName: "apify-disability-jobs-nsw",
  version: "1.0.0",
  source: "apify_indeed_disability",
  table: "disability_jobs_nsw",
  templateSlug: "support-worker",
  category: "disability",
  poolKey: "disability",
  searchTerms: [
    "disability support worker",
    "NDIS support worker",
    "community support worker disability",
    "SIL support worker",
    "psychosocial support worker",
  ],
  includeTerms: [
    "disability support worker",
    "ndis support worker",
    "community support worker",
    "sil support worker",
    "psychosocial support worker",
    "disability care worker",
    "residential support worker",
  ],
  excludeTerms: [
    "aged care worker",
    "childcare worker",
    "early childhood educator",
    "social worker",
    "support coordinator",
    "manager",
  ],
});
