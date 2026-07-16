import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type Row = Record<string, any>;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("APPLIX_SERVICE_ROLE_KEY") || "";
const OUTSCRAPER_API_KEY = Deno.env.get("OUTSCRAPER_API_KEY") || "";
const OUTSCRAPER_API_URL = Deno.env.get("OUTSCRAPER_JOBS_API_URL") || "https://api.outscraper.cloud/indeed-search";
const INDEED_BASE_URL = Deno.env.get("OUTSCRAPER_INDEED_BASE_URL") || "https://au.indeed.com/jobs";

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function text(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const result = String(value).trim();
  return result || null;
}

function normalized(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function integer(value: unknown, fallback: number, min: number, max: number) {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.max(min, Math.min(max, Math.floor(number)))
    : fallback;
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.map(text).filter(Boolean) as string[])]
    : [];
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

function canonicalUrl(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    url.hash = "";
    for (const key of ["utm_source", "utm_medium", "utm_campaign", "from", "source", "ref", "tracking", "trk"]) {
      url.searchParams.delete(key);
    }
    url.hostname = url.hostname.toLowerCase();
    return url.toString();
  } catch {
    return raw.toLowerCase();
  }
}

function parseDate(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function queryWithoutLocation(query: string, location: string) {
  if (!location) return query.trim();
  const escaped = location.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const cleaned = query.replace(new RegExp(`\\s*${escaped}\\s*$`, "i"), "").trim();
  return cleaned || query.trim();
}

function buildRequest(searchPlan: Row, limit: number) {
  const queries = strings(searchPlan.queries);
  const location = text(searchPlan.location) || "";
  if (!queries.length) throw new Error("search_plan.queries must contain at least one query");

  const providerUrl = new URL(OUTSCRAPER_API_URL);
  const requestedUrls: string[] = [];

  for (const rawQuery of queries) {
    const indeedUrl = new URL(INDEED_BASE_URL);
    indeedUrl.searchParams.set("q", queryWithoutLocation(rawQuery, location));
    if (location) indeedUrl.searchParams.set("l", location);
    const requestedUrl = indeedUrl.toString();
    requestedUrls.push(requestedUrl);
    providerUrl.searchParams.append("query", requestedUrl);
  }

  providerUrl.searchParams.set("limit", String(limit));
  providerUrl.searchParams.set("async", "false");
  return { providerUrl, requestedUrls, queryCount: queries.length };
}

function sourceJobId(raw: Row) {
  return text(raw.source_job_id || raw.job_id || raw.id || raw.indeed_job_id || raw.jobKey || raw.jobkey || raw.job_key);
}

function normalizeJob(raw: Row, searchPlan: Row, now: string): Row | null {
  const title = text(raw.title || raw.displayTitle || raw.normTitle || raw.job_title || raw.position || raw.role);
  const company = text(raw.company || raw.company_name || raw.employer || raw.organization || raw.organization_name);
  const location = text(
    raw.formattedLocation || raw.location || raw.formatted_location ||
    [raw.jobLocationCity || raw.city, raw.jobLocationState || raw.state || raw.region].filter(Boolean).join(" "),
  );
  const applyUrl = text(raw.viewJobLink || raw.apply_url || raw.apply_link || raw.job_url || raw.url || raw.link || raw.job_link);
  if (!title && !company && !applyUrl) return null;

  const normalizedTitle = normalized(title);
  const normalizedCompany = normalized(company);
  const normalizedLocation = normalized(location);
  const canonicalApplyUrl = canonicalUrl(applyUrl);
  const catalogueDays = integer(searchPlan.catalogue_age_days, 30, 1, 30);

  return {
    user_id: null,
    campaign_id: null,
    source: "outscraper_indeed",
    source_job_id: sourceJobId(raw),
    title,
    normalized_title: normalizedTitle || null,
    company,
    normalized_company: normalizedCompany || null,
    location,
    state: text(raw.state || raw.jobLocationState),
    country: "au",
    salary: text(raw.salarySnippet?.text || raw.salary),
    job_type: text(raw.job_type || raw.type || raw.employment_type || raw.detected_extensions?.schedule_type),
    description: text(raw.snippet || raw.description || raw.summary || raw.job_description),
    apply_url: applyUrl,
    canonical_apply_url: canonicalApplyUrl,
    posted_at: parseDate(raw.pubDate || raw.createDate || raw.posted_at || raw.posted_date || raw.date_posted || raw.published_at || raw.date),
    fetched_at: now,
    last_seen_at: now,
    expires_at: new Date(Date.now() + catalogueDays * 86400000).toISOString(),
    status: "new",
    catalogue_status: "active",
    search_query: strings(searchPlan.queries).join(" | ") || null,
    category: text(searchPlan.intent),
    raw_payload: raw,
    global_dedupe_key: [normalizedCompany, normalizedTitle, normalizedLocation].join("|") || null,
    job_dedupe_key: [canonicalApplyUrl || "", normalizedCompany, normalizedTitle, normalizedLocation].join("|"),
  };
}

async function findExisting(supabase: ReturnType<typeof createClient>, job: Row) {
  if (job.source_job_id) {
    const result = await supabase.from("jobs").select("id").eq("source", job.source).eq("source_job_id", job.source_job_id).maybeSingle();
    if (result.error) throw new Error(result.error.message);
    if (result.data) return result.data;
  }
  if (job.canonical_apply_url) {
    const result = await supabase.from("jobs").select("id").is("user_id", null).is("campaign_id", null).eq("canonical_apply_url", job.canonical_apply_url).maybeSingle();
    if (result.error) throw new Error(result.error.message);
    if (result.data) return result.data;
  }
  if (job.global_dedupe_key) {
    const result = await supabase.from("jobs").select("id").is("user_id", null).is("campaign_id", null).eq("global_dedupe_key", job.global_dedupe_key).maybeSingle();
    if (result.error) throw new Error(result.error.message);
    if (result.data) return result.data;
  }
  return null;
}

async function storeJobs(supabase: ReturnType<typeof createClient>, jobs: Row[]) {
  let inserted = 0;
  let updated = 0;
  let duplicatesSkipped = 0;
  const jobIds: string[] = [];
  const seen = new Set<string>();

  for (const job of jobs) {
    const key = job.source_job_id
      ? `provider:${job.source}:${job.source_job_id}`
      : job.canonical_apply_url
      ? `url:${job.canonical_apply_url}`
      : `global:${job.global_dedupe_key}`;

    if (seen.has(key)) {
      duplicatesSkipped += 1;
      continue;
    }
    seen.add(key);

    const existing = await findExisting(supabase, job);
    if (existing?.id) {
      const result = await supabase.from("jobs").update({
        fetched_at: job.fetched_at,
        last_seen_at: job.last_seen_at,
        expires_at: job.expires_at,
        catalogue_status: "active",
        closed_at: null,
        posted_at: job.posted_at,
        description: job.description,
        raw_payload: job.raw_payload,
      }).eq("id", existing.id).select("id").single();
      if (result.error) throw new Error(result.error.message);
      updated += 1;
      jobIds.push(result.data.id);
      continue;
    }

    const result = await supabase.from("jobs").insert(job).select("id").single();
    if (result.error) {
      if (result.error.code === "23505") {
        duplicatesSkipped += 1;
        continue;
      }
      throw new Error(result.error.message);
    }
    inserted += 1;
    jobIds.push(result.data.id);
  }

  return { inserted, updated, duplicatesSkipped, jobIds };
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return reply({ ok: false, error: "Use POST" }, 405);
    if (!SUPABASE_URL || !SERVICE_KEY || !OUTSCRAPER_API_KEY) {
      return reply({ ok: false, error: "Missing Supabase or Outscraper configuration" }, 500);
    }
    if ((req.headers.get("authorization") || "") !== `Bearer ${SERVICE_KEY}`) {
      return reply({ ok: false, error: "Service-role authorization required" }, 401);
    }

    const input = await req.json().catch(() => ({})) as Row;
    const campaignId = text(input.campaign_id);
    const runId = text(input.orchestrator_run_id);
    const searchPlan = input.search_plan as Row;
    if (!campaignId || !runId || !searchPlan) {
      return reply({ ok: false, error: "campaign_id, orchestrator_run_id and search_plan are required" }, 400);
    }

    const fetchPoolLimit = integer(input.fetch_pool_limit, 100, 1, 200);
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const run = await supabase.from("orchestrator_runs").select("id").eq("id", runId).eq("campaign_id", campaignId).maybeSingle();
    if (run.error) throw new Error(run.error.message);
    if (!run.data) return reply({ ok: false, error: "Orchestrator run does not belong to campaign" }, 403);

    const request = buildRequest(searchPlan, fetchPoolLimit);
    const response = await fetch(request.providerUrl.toString(), {
      headers: { "X-API-KEY": OUTSCRAPER_API_KEY },
    });
    const rawText = await response.text().catch(() => "");
    let payload: unknown = {};
    try { payload = rawText ? JSON.parse(rawText) : {}; } catch { payload = { raw: rawText }; }
    if (!response.ok) {
      throw new Error(`Outscraper indeed-search failed ${response.status}: ${JSON.stringify(payload).slice(0, 1000)}`);
    }

    const rows = extractRows(payload);
    const now = new Date().toISOString();
    const jobs = rows.map((row) => normalizeJob(row, searchPlan, now)).filter(Boolean) as Row[];
    const stored = await storeJobs(supabase, jobs);
    const payloadObject = payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Row : {};

    return reply({
      ok: true,
      function: "fetch-job-catalogue-v2",
      version: "au_indeed_query_v2",
      campaign_id: campaignId,
      orchestrator_run_id: runId,
      provider: "outscraper_indeed_search",
      provider_called: true,
      provider_status: response.status,
      provider_response_type: Array.isArray(payload) ? "array" : typeof payload,
      provider_top_level_keys: Object.keys(payloadObject).slice(0, 20),
      provider_raw_length: rawText.length,
      provider_sample: JSON.stringify(payload).slice(0, 600),
      requested_urls: request.requestedUrls,
      query_count: request.queryCount,
      requested_limit: fetchPoolLimit,
      fetched_count: rows.length,
      normalized_count: jobs.length,
      new_jobs_stored: stored.inserted,
      existing_jobs_updated: stored.updated,
      duplicates_skipped: stored.duplicatesSkipped,
      catalogue_job_ids: stored.jobIds,
    });
  } catch (error) {
    return reply({
      ok: false,
      function: "fetch-job-catalogue-v2",
      version: "au_indeed_query_v2",
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});
