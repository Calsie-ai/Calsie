const STATES: Record<string, string> = {
  "new south wales": "nsw", victoria: "vic", queensland: "qld", "south australia": "sa",
  "western australia": "wa", tasmania: "tas", "northern territory": "nt", "australian capital territory": "act",
};
function normalise(value: string) {
  let text = value.toLowerCase();
  for (const [name, abbreviation] of Object.entries(STATES)) text = text.replaceAll(name, abbreviation);
  return text.replace(/[^a-z0-9]+/g, " ").trim();
}

// Scraped jobs commonly have a suburb/state but no postcode or coordinates.
// Postcode-derived preferences therefore match the detected STATE, not a fictional radius.
export function matchesLocation(jobLocation: unknown, preference: unknown): boolean {
  const wanted = typeof preference === "string" ? normalise(preference) : "";
  if (!wanted && typeof preference === "string" && preference.trim()) return false;
  if (!wanted || ["australia", "au", "all australia", "anywhere"].includes(wanted)) return true;
  const actual = typeof jobLocation === "string" ? normalise(jobLocation) : "";
  if (!actual) return false;
  const words = wanted.split(" ");
  const state = words.find((word) => Object.values(STATES).includes(word));
  if (/\b\d{4}\b/.test(wanted) && state) return actual.split(" ").includes(state);
  return words.filter((word) => !["au", "australia"].includes(word)).every((word) => actual.split(" ").includes(word));
}

export function plainDescription(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<\/(?:p|div|li)>|<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
  return text || null;
}

export const CATEGORY_POOLS = {
  disability: { current: "disability_jobs_view", legacy: "disability_jobs_apify" },
  aged_care: { current: "agecare_jobs_view", legacy: "agecare_jobs_apify" },
  childcare: { current: "childcare_jobs_view", legacy: "childcare_jobs_apify" },
} as const;

export function validJobId(value: unknown): string | null {
  const id = typeof value === "string" ? value : typeof value === "number" && Number.isSafeInteger(value) ? String(value) : "";
  if (/^[1-9]\d*$/.test(id) && BigInt(id) <= BigInt("9223372036854775807")) return id;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id.toLowerCase() : null;
}

export function fetchedDay(value: unknown): string | null {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

// Cross-check legacy history by the provider's identity, never by a numeric
// catalogue ID that can collide with another pool or the new inbox UUID.
export function jobIdentity(row: Record<string, any>): string | null {
  if (row.job_source && row.source_job_id) return `${row.job_source}:${row.source_job_id}`;
  return typeof row.canonical_apply_url === "string" && row.canonical_apply_url.trim() ? row.canonical_apply_url.trim() : null;
}

export function alreadyReviewed(row: Record<string, any>, table: string, decisions: Record<string, any>[]): boolean {
  return decisions.some((decision) => {
    if (decision.source_table === table && String(decision.source_job_id) === String(row.id)) return true;
    const snapshot = decision.job_snapshot || {};
    const identity = jobIdentity(row);
    return !!identity && identity === jobIdentity(snapshot)
      || !!row.canonical_apply_url && row.canonical_apply_url === snapshot.canonical_apply_url;
  });
}

export function mapFeedJob(row: Record<string, any>, agentId: string, table: string, decision?: Record<string, any>) {
  const payload = row.raw_payload || row.payload || {};
  const string = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;
  const postedValue = row.listing_date || payload.listing_date || payload.postedAt;
  const posted = typeof postedValue === "string" && Number.isFinite(Date.parse(postedValue)) ? postedValue : null;
  const fetched = row.first_seen_at || row.fetched_at || row.created_at || null;
  return {
    opportunity_type: "live_job", review_id: `${table}:${row.id}`, id: String(row.id),
    source_job_id: String(row.id), campaign_id: agentId,
    title: row.title || null, company: row.company || null, location: row.location || null,
    source: row.job_source || null, apply_url: row.canonical_apply_url || null,
    extracted_email: null,
    description: plainDescription(row.description) || plainDescription(payload.description) || plainDescription(payload.jobDescription) || plainDescription(payload.summary),
    status: decision?.decision || "pending_review", created_at: fetched,
    selected_at: fetched, reviewed_at: decision?.reviewed_at || null,
    batch_date: fetchedDay(fetched), campaign_day: null,
    salary: row.salary_label || string(payload.salary), job_type: row.work_type || string(payload.jobType),
    posted_at: posted, company_logo: string(payload.companyLogo) || string(payload.company_logo),
  };
}
