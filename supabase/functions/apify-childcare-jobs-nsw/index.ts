import { serveJobPipeline } from "../_shared/apify-nsw-jobs.ts";

serveJobPipeline({
  functionName: "apify-childcare-jobs-nsw",
  version: "1.0.0",
  source: "apify_indeed_childcare",
  table: "childcare_jobs_nsw",
  templateSlug: "childcare",
  category: "childcare",
  poolKey: "childcare",
  searchTerms: [
    "childcare worker",
    "early childhood educator",
    "childcare educator",
    "OSHC educator",
    "childcare room leader",
  ],
  includeTerms: [
    "childcare worker",
    "child care worker",
    "early childhood educator",
    "childcare educator",
    "child care educator",
    "oshc educator",
    "outside school hours care",
    "room leader childcare",
  ],
  excludeTerms: [
    "disability support worker",
    "aged care worker",
    "support coordinator",
    "centre manager",
  ],
});
