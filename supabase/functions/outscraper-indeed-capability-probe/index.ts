type Row = Record<string, any>;

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

function jobKey(row: Row): string {
  return String(
    row.jobKey || row.jobkey || row.job_key || row.source_job_id || row.job_id || row.id ||
    row.indeed_job_id || row.viewJobLink || row.apply_url || row.job_url || row.url || "",
  ).trim();
}

function makeIndeedUrl(query: string, location: string, mode: string, value: number) {
  const url = new URL(INDEED_BASE_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("l", location);
  if (mode !== "none") url.searchParams.set(mode, String(value));
  return url.toString();
}

async function providerCall(input: {
  queries: string[];
  limit: number;
  providerParams?: Record<string, string>;
}) {
  const url = new URL(OUTSCRAPER_API_URL);
  for (const query of input.queries) url.searchParams.append("query", query);
  url.searchParams.set("limit", String(input.limit));
  url.searchParams.set("async", "false");
  for (const [key, value] of Object.entries(input.providerParams || {})) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url.toString(), {
    headers: { "X-API-KEY": OUTSCRAPER_API_KEY },
  });
  const rawText = await response.text().catch(() => "");
  let payload: unknown = {};
  try { payload = rawText ? JSON.parse(rawText) : {}; } catch { payload = { raw: rawText }; }
  const rows = extractRows(payload);
  const keys = rows.map(jobKey).filter(Boolean);
  return {
    ok: response.ok,
    status: response.status,
    returned: rows.length,
    unique_keys: new Set(keys).size,
    keys,
    sample: rows.slice(0, 3).map((row) => ({
      key: jobKey(row),
      title: row.title || row.displayTitle || row.normTitle,
      company: row.company,
      location: row.formattedLocation || row.location,
      url: row.viewJobLink || row.apply_url || row.job_url || row.url,
      cursor: row.cursor ?? null,
    })),
    raw_preview: rawText.slice(0, 500),
  };
}

function overlap(a: string[], b: string[]) {
  const left = new Set(a);
  return b.filter((value) => left.has(value)).length;
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return reply({ ok: false, error: "Use POST" }, 405);
    if (!SERVICE_KEY || !OUTSCRAPER_API_KEY) return reply({ ok: false, error: "Missing service configuration" }, 500);
    if ((req.headers.get("authorization") || "") !== `Bearer ${SERVICE_KEY}`) {
      return reply({ ok: false, error: "Service-role authorization required" }, 401);
    }

    const input = await req.json().catch(() => ({})) as Row;
    const query = String(input.query || "Caseworker").trim();
    const location = String(input.location || "Sydney NSW").trim();
    const limit = Math.max(1, Math.min(10, Number(input.limit || 5)));
    const offsetValue = Math.max(1, Math.min(100, Number(input.offset_value || limit)));

    const baselineUrl = makeIndeedUrl(query, location, "none", 0);
    const baseline = await providerCall({ queries: [baselineUrl], limit });

    const paginationTests: Row[] = [];
    for (const mode of ["start", "offset", "page"]) {
      const candidateUrl = makeIndeedUrl(query, location, mode, offsetValue);
      const candidate = await providerCall({ queries: [candidateUrl], limit });
      paginationTests.push({
        mode,
        value: offsetValue,
        requested_url: candidateUrl,
        ...candidate,
        overlap_with_baseline: overlap(baseline.keys, candidate.keys),
        different_from_baseline: candidate.keys.length > 0 && overlap(baseline.keys, candidate.keys) < candidate.keys.length,
      });
    }

    const bundledUrls = [
      makeIndeedUrl("Caseworker", location, "none", 0),
      makeIndeedUrl("Family Caseworker", location, "none", 0),
      makeIndeedUrl("Housing Caseworker", location, "none", 0),
    ];
    const dedupeOff = await providerCall({ queries: bundledUrls, limit });
    const dedupeTests: Row[] = [];
    for (const [key, value] of [
      ["dropDuplicates", "true"],
      ["drop_duplicates", "true"],
      ["deduplicate", "true"],
    ]) {
      const result = await providerCall({ queries: bundledUrls, limit, providerParams: { [key]: value } });
      dedupeTests.push({
        parameter: key,
        value,
        ...result,
        reduction_vs_off: dedupeOff.returned - result.returned,
      });
    }

    return reply({
      ok: true,
      read_only: true,
      writes_jobs: false,
      runs_ai: false,
      sends_email: false,
      query,
      location,
      limit,
      baseline: { requested_url: baselineUrl, ...baseline },
      pagination_tests: paginationTests,
      dedupe_off: dedupeOff,
      dedupe_tests: dedupeTests,
      note: "A parameter is confirmed only when the returned IDs differ for pagination or the provider usage/returned count drops for dedupe.",
    });
  } catch (error) {
    return reply({
      ok: false,
      read_only: true,
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});
