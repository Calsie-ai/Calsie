import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type Row = Record<string, any>;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("APPLIX_SERVICE_ROLE_KEY") || "";
const OUTSCRAPER_API_KEY = Deno.env.get("OUTSCRAPER_API_KEY") || "";
const OUTSCRAPER_JOBS_API_URL = Deno.env.get("OUTSCRAPER_JOBS_API_URL") || "https://api.outscraper.cloud/indeed-search";
const INDEED_BASE_URL = Deno.env.get("OUTSCRAPER_INDEED_BASE_URL") || "https://www.indeed.com/jobs";

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function text(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const valueText = String(value).trim();
  return valueText || null;
}

function clean(value: unknown): string | null {
  return text(value)?.replace(/\s+/g, " ") || null;
}

function lower(value: unknown): string {
  return clean(value)?.toLowerCase() || "";
}

function integer(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function arrayOfStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(text).filter(Boolean) as string[])];
}

function parseDate(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  const numeric = Number(raw);
  const date = Number.isFinite(numeric) && numeric > 1_000_000_000
    ? new Date(numeric)
    : new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function canonicalizeUrl(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    url.hash = "";
    const removable = [
      "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
      "from", "source", "ref", "tracking", "trk",
    ];
    for (const key of removable) url.searchParams.delete(key);
    url.hostname = url.hostname.toLowerCase();
    url.pathname = url.pathname.replace(/\/$/, "") || "/";
    const sorted = [...url.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
    url.search = "";
    for (const [key, val] of sorted) url.searchParams.append(key, val);
    return url.toString();
  } catch {
    return raw.toLowerCase();
  }
}

function flatten(value: unknown): Row[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => Array.isArray(item) ? flatten(item) : [item as Row]);
}

function extractRows(payload: unknown): Row[] {
  if (Array.isArray(payload)) return flatten(payload);
  const body = payload as Row;
  if (Array.isArray(body?.data)) return flatten(body.data);
  if (Array.isArray(body?.results)) return flatten(body.results);
  if (Array.isArray(body?.jobs)) return flatten(body.jobs);
  return [];
}

function sourceJobId(raw: Row): string | null {
  return text(
    raw.source_job_id || raw.job_id || raw.id || raw.indeed_job_id ||
    raw.jobKey || raw.jobkey || raw.job_key,
  );
}

function normalizeJob(raw: Row, searchPlan: Row, nowIso: string): Row | null {
  const title = clean(raw.title || raw.displayTitle || raw.normTitle || raw.job_title || raw.position || raw.role);
  const company = clean(raw.company || raw.company_name || raw.employer || raw.organization || raw.organization_name);
  const location = clean(
    raw.formattedLocation || raw.location || raw.formatted_location ||
    [raw.jobLocationCity || raw.city, raw.jobLocationState || raw.state || raw.region].filter(Boolean).join(" "),
  );
  const applyUrl = text(raw.viewJobLink || raw.apply_url || raw.apply_link || raw.job_url || raw.url || raw.link || raw.job_link);
  if (!title && !company && !applyUrl) return null;

  const canonicalApplyUrl = canonicalizeUrl(applyUrl);
  const providerId = sourceJobId(raw);
  const normalizedTitle = lower(title);
  const normalizedCompany = lower(company);
  const normalizedLocation = lower(location);
  const globalDedupeKey = [normalizedCompany, normalizedTitle, normalizedLocation].join("|");
  const postedAt = parseDate(
    raw.pubDate || raw.createDate || raw.posted_at || raw.posted_date ||
    raw.date_posted || raw.published_at || raw.date,
  );
  const catalogueDays = integer(searchPlan.catalogue_age_days, 30, 1, 30);
  const expiresAt = new Date(Date.now() + catalogueDays * 86_400_000).toISOString();

  return {
    user_id: null,
    campaign_id: null,
    source: "outscraper_indeed",
    source_job_id: providerId,
    title,
    normalized_title: normalizedTitle || null,
    company,
    normalized_company: normalizedCompany || null,
    location,
    state: text(raw.state || raw.jobLocationState),
    country: "au",
    salary: text(raw.salarySnippet?.text || raw.salary),
    job_type: text(raw.job_type || raw.type || raw.employment_type),
    description: text(raw.snippet || raw.description || raw.summary || raw.job_description),
    apply_url: applyUrl,
    canonical_apply_url: canonicalApplyUrl,
    posted_at: postedAt,
    fetched_at: nowIso,
    last_seen_at: nowIso,
    expires_at: expiresAt,
    status: "new",
    catalogue_status: "active",
    search_query: arrayOfStrings(searchPlan.queries).join(" | ") || null,
    category: text(searchPlan.intent),
    raw_payload: raw,
    global_dedupe_key: globalDedupeKey || null,
    job_dedupe_key: [canonicalApplyUrl || "", normalizedCompany, normalizedTitle, normalizedLocation].join("|"),
  };
}

function buildOutscraperUrl(searchPlan: Row, limit: number) {
  const url = new URL(OUTSCRAPER_JOBS_API_URL);
  const queries = arrayOfStrings(searchPlan.queries);
  const location = text(searchPlan.location) || "";
  if (!queries.length) throw new Error("search_plan.queries must contain at least one query");

  for (const query of queries) {
    const indeed = new URL(INDEED_BASE_URL);
    if (!indeed.pathname || indeed.pathname === "/") indeed.pathname = "/jobs";
    indeed.searchParams.set("q", query);
    if (location && !query.toLowerCase().includes(location.toLowerCase())) {
      indeed.searchParams.set("l", location);
    }
    url.searchParams.append("query", indeed.toString());
  }
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("async", "false");
  return { url, queryCount: queries.length };
}

async function fetchJobs(searchPlan: Row, limit: number, input: Row) {
  if (Array.isArray(input.jobs)) {
    return { rows: input.jobs as Row[], queryCount: 0, providerCalled: false };
  }
  if (!OUTSCRAPER_API_KEY) throw new Error("Missing OUTSCRAPER_API_KEY");
  const request = buildOutscraperUrl(searchPlan, limit);
  const response = await fetch(request.url.toString(), {
    method: "GET",
    headers: { "X-API-KEY": OUTSCRAPER_API_KEY },
  });
  const rawText = await response.text().catch(() => "");
  let payload: unknown = rawText;
  try {
    payload = rawText ? JSON.parse(rawText) : {};
  } catch {
    payload = { raw: rawText };
  }
  if (!response.ok) {
    throw new Error(`Outscraper indeed-search failed ${response.status}: ${JSON.stringify(payload).slice(0, 1000)}`);
  }
  return { rows: extractRows(payload), queryCount: request.queryCount, providerCalled: true };
}

async function findExisting(supabase: ReturnType<typeof createClient>, job: Row): Promise<Row | null> {
  if (job.source_job_id) {
    const byProvider = await supabase
      .from("jobs")
      .select("id")
      .eq("source", job.source)
      .eq("source_job_id", job.source_job_id)
      .maybeSingle();
    if (byProvider.error) throw new Error(byProvider.error.message);
    if (byProvider.data) return byProvider.data as Row;
  }
  if (job.canonical_apply_url) {
    const byUrl = await supabase
      .from("jobs")
      .select("id")
      .is("user_id", null)
      .is("campaign_id", null)
      .eq("canonical_apply_url", job.canonical_apply_url)
      .maybeSingle();
    if (byUrl.error) throw new Error(byUrl.error.message);
    if (byUrl.data) return byUrl.data as Row;
  }
  if (job.global_dedupe_key) {
    const byKey = await supabase
      .from("jobs")
      .select("id")
      .is("user_id", null)
      .is("campaign_id", null)
      .eq("global_dedupe_key", job.global_dedupe_key)
      .maybeSingle();
    if (byKey.error) throw new Error(byKey.error.message);
    if (byKey.data) return byKey.data as Row;
  }
  return null;
}

async function storeJobs(supabase: ReturnType<typeof createClient>, jobs: Row[]) {
  let inserted = 0;
  let updated = 0;
  let duplicateSkipped = 0;
  const jobIds: string[] = [];
  const seen = new Set<string>();

  for (const job of jobs) {
    const incomingKey = job.source_job_id
      ? `provider:${job.source}:${job.source_job_id}`
      : job.canonical_apply_url
      ? `url:${job.canonical_apply_url}`
      : `key:${job.global_dedupe_key}`;
    if (seen.has(incomingKey)) {
      duplicateSkipped += 1;
      continue;
    }
    seen.add(incomingKey);

    const existing = await findExisting(supabase, job);
    if (existing?.id) {
      const patch: Row = {
        last_seen_at: job.last_seen_at,
        fetched_at: job.fetched_at,
        expires_at: job.expires_at,
        catalogue_status: "active",
        closed_at: null,
        raw_payload: job.raw_payload,
      };
      if (job.posted_at) patch.posted_at = job.posted_at;
      if (job.description) patch.description = job.description;
      const result = await supabase.from("jobs").update(patch).eq("id", existing.id).select("id").single();
      if (result.error) throw new Error(result.error.message);
      updated += 1;
      jobIds.push(result.data.id as string);
      continue;
    }

    const result = await supabase.from("jobs").insert(job).select("id").single();
    if (result.error) {
      if (result.error.code === "23505") {
        duplicateSkipped += 1;
        continue;
      }
      throw new Error(result.error.message);
    }
    inserted += 1;
    jobIds.push(result.data.id as string);
  }

  return { inserted, updated, duplicateSkipped, jobIds };
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return reply({ ok: false, error: "Use POST" }, 405);
    if (!SUPABASE_URL || !SERVICE_KEY) return reply({ ok: false, error: "Missing Supabase service configuration" }, 500);
    const authorization = req.headers.get("authorization") || "";
    if (authorization !== `Bearer ${SERVICE_KEY}`) {
      return reply({ ok: false, error: "Service-role authorization required" }, 401);
    }

    const input = await req.json().catch(() => ({})) as Row;
    const campaignId = text(input.campaign_id);
    const runId = text(input.orchestrator_run_id);
    const searchPlan = input.search_plan as Row;
    if (!campaignId) return reply({ ok: false, error: "campaign_id is required" }, 400);
    if (!runId) return reply({ ok: false, error: "orchestrator_run_id is required" }, 400);
    if (!searchPlan || typeof searchPlan !== "object") return reply({ ok: false, error: "search_plan is required" }, 400);

    const fetchPoolLimit = integer(input.fetch_pool_limit, 100, 100, 200);
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const runResult = await supabase
      .from("orchestrator_runs")
      .select("id,campaign_id")
      .eq("id", runId)
      .eq("campaign_id", campaignId)
      .maybeSingle();
    if (runResult.error) throw new Error(runResult.error.message);
    if (!runResult.data) return reply({ ok: false, error: "Orchestrator run does not belong to campaign" }, 403);

    const provider = await fetchJobs(searchPlan, fetchPoolLimit, input);
    const nowIso = new Date().toISOString();
    const normalized = provider.rows
      .map((raw) => normalizeJob(raw, searchPlan, nowIso))
      .filter(Boolean) as Row[];
    const stored = await storeJobs(supabase, normalized);

    return reply({
      ok: true,
      function: "fetch-job-catalogue-v2",
      version: "phase_2_store_all_v1",
      campaign_id: campaignId,
      orchestrator_run_id: runId,
      provider: "outscraper_indeed_search",
      provider_called: provider.providerCalled,
      query_count: provider.queryCount,
      requested_limit: fetchPoolLimit,
      fetched_count: provider.rows.length,
      normalized_count: normalized.length,
      new_jobs_stored: stored.inserted,
      existing_jobs_updated: stored.updated,
      duplicates_skipped: stored.duplicateSkipped,
      catalogue_job_ids: stored.jobIds,
    });
  } catch (error) {
    return reply({
      ok: false,
      function: "fetch-job-catalogue-v2",
      version: "phase_2_store_all_v1",
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});
