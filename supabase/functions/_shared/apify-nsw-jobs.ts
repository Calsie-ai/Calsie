import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type Row = Record<string, unknown>;
type SupabaseClient = ReturnType<typeof createClient>;

export interface JobPipelineConfig {
  functionName: string;
  version: string;
  source: string;
  table: string;
  templateSlug: string;
  category: string;
  poolKey: string;
  searchTerms: string[];
  includeTerms: string[];
  excludeTerms: string[];
}

const APIFY_API_BASE = "https://api.apify.com/v2";
const DEFAULT_ACTOR_ID = "lcNutuGOgxL2SmXXe";
const MAX_ITEMS = 1000;
const PAGE_SIZE = 200;
const ACTIVE_STATUSES = ["started", "running", "collecting"];
const TERMINAL_FAILURES = ["FAILED", "ABORTED", "TIMED-OUT"];

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const APIFY_TOKEN =
  Deno.env.get("APIFY_API_TOKEN") || Deno.env.get("APIFY_TOKEN") || "";
const APIFY_ACTOR_ID = Deno.env.get("APIFY_INDEED_ACTOR_ID") || DEFAULT_ACTOR_ID;
const CRON_SECRET =
  Deno.env.get("APPLIX_CRON_SECRET") || Deno.env.get("CRON_SECRET") || "";

function namedKey(value: string | undefined, name = "default"): string {
  if (!value) return "";
  try {
    const parsed = JSON.parse(value) as Row;
    return typeof parsed[name] === "string" ? String(parsed[name]) : "";
  } catch {
    return "";
  }
}

const SERVICE_KEY =
  namedKey(Deno.env.get("SUPABASE_SECRET_KEYS")) ||
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  Deno.env.get("APPLIX_SERVICE_ROLE_KEY") ||
  "";

const headers = { "content-type": "application/json" };

function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), { status, headers });
}

function isRow(value: unknown): value is Row {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown, max = 30_000): string | null {
  if (value === null || value === undefined) return null;
  const result = String(value).trim();
  return result ? result.slice(0, max) : null;
}

function normalize(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function numberValue(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function integer(value: unknown, fallback: number, minimum: number, maximum: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.floor(parsed)));
}

function booleanValue(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  return null;
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return [...new Set(value.map((item) => text(item, 500)).filter(Boolean))] as string[];
  }
  const single = text(value, 500);
  return single ? [single] : [];
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function unique(values: Array<string | null>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function sydneyDate(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function canonicalUrl(value: unknown): string | null {
  const raw = text(value, 4000);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    url.hash = "";
    for (const key of [
      "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
      "gclid", "fbclid", "from", "source", "ref", "tracking", "trk",
    ]) {
      url.searchParams.delete(key);
    }
    url.hostname = url.hostname.toLowerCase();
    return url.toString().slice(0, 4000);
  } catch {
    return null;
  }
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function authorised(req: Request): boolean {
  const bearer = (text(req.headers.get("authorization"), 10_000) || "")
    .replace(/^Bearer\s+/i, "");
  const internal = text(req.headers.get("x-applix-cron-secret"), 10_000) || "";
  return Boolean(SERVICE_KEY && bearer === SERVICE_KEY) ||
    Boolean(CRON_SECRET && (internal === CRON_SECRET || bearer === CRON_SECRET));
}

async function apify(path: string, init: RequestInit = {}): Promise<Row> {
  const response = await fetch(`${APIFY_API_BASE}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      authorization: `Bearer ${APIFY_TOKEN}`,
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Apify ${response.status}: ${JSON.stringify(body).slice(0, 1500)}`);
  }
  return isRow(body) ? body : {};
}

function getRunMetadata(run: Row): Row {
  return isRow(run.metadata) ? run.metadata : {};
}

async function markFailed(
  db: SupabaseClient,
  runId: string,
  message: string,
): Promise<void> {
  await db.from("job_fetch_runs").update({
    status: "failed",
    error_message: message.slice(0, 2000),
    finished_at: new Date().toISOString(),
  }).eq("id", runId);
}

async function startRun(
  db: SupabaseClient,
  config: JobPipelineConfig,
  requestedLimit: number,
): Promise<Response> {
  const runDate = sydneyDate();
  const batchKey = `apify_daily:${config.category}:${runDate}`;
  const existing = await db.from("job_fetch_runs")
    .select("*")
    .eq("batch_key", batchKey)
    .maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data?.status === "completed") {
    return reply({ ok: true, skipped: true, reason: "already_completed", run: existing.data });
  }
  if (existing.data && ACTIVE_STATUSES.includes(String(existing.data.status))) {
    return reply({ ok: true, skipped: true, reason: "already_active", run: existing.data }, 202);
  }

  const active = await db.from("job_fetch_runs")
    .select("id,source,status,batch_key")
    .eq("provider", "apify")
    .in("status", ACTIVE_STATUSES)
    .limit(1)
    .maybeSingle();
  if (active.error) throw new Error(active.error.message);
  if (active.data) {
    return reply({ ok: true, skipped: true, reason: "another_apify_run_active", active: active.data }, 202);
  }

  const previousMetadata = existing.data ? getRunMetadata(existing.data as Row) : {};
  const attempts = Number(previousMetadata.start_attempts || 0) + 1;
  let fetchRunId = text(existing.data?.id, 100);
  const metadata = {
    category: config.category,
    table: config.table,
    function_name: config.functionName,
    requested_limit: requestedLimit,
    posted_within_days: 1,
    import_offset: 0,
    import_page_size: PAGE_SIZE,
    start_attempts: attempts,
    inserted: 0,
    updated: 0,
    invalid: 0,
    excluded_location: 0,
    excluded_relevance: 0,
  };

  if (fetchRunId) {
    const reset = await db.from("job_fetch_runs").update({
      source: config.source,
      provider: "apify",
      query: config.searchTerms.join(" | "),
      location: "New South Wales",
      country: "au",
      status: "started",
      jobs_found: 0,
      jobs_inserted: 0,
      jobs_updated: 0,
      error_message: null,
      finished_at: null,
      metadata,
    }).eq("id", fetchRunId);
    if (reset.error) throw new Error(reset.error.message);
  } else {
    const created = await db.from("job_fetch_runs").insert({
      source: config.source,
      provider: "apify",
      query: config.searchTerms.join(" | "),
      location: "New South Wales",
      country: "au",
      status: "started",
      batch_key: batchKey,
      metadata,
    }).select("id").single();
    if (created.error) {
      if (created.error.code === "23505") {
        return reply({ ok: true, skipped: true, reason: "concurrent_start_blocked" }, 202);
      }
      throw new Error(created.error.message);
    }
    fetchRunId = created.data.id;
  }

  try {
    const input = {
      location: "New South Wales",
      maxItems: requestedLimit,
      postedWithinDays: 1,
      searchTerms: config.searchTerms,
      includeDescription: true,
    };
    const body = await apify(
      `/actors/${encodeURIComponent(APIFY_ACTOR_ID)}/runs?maxItems=${requestedLimit}&timeout=3600`,
      { method: "POST", body: JSON.stringify(input) },
    );
    const actorRun = isRow(body.data) ? body.data : body;
    const apifyRunId = text(actorRun.id, 200);
    const datasetId = text(actorRun.defaultDatasetId, 200);
    if (!apifyRunId) throw new Error("Apify did not return a run ID");

    const updatedMetadata = {
      ...metadata,
      apify_actor_id: APIFY_ACTOR_ID,
      apify_run_id: apifyRunId,
      dataset_id: datasetId,
      actor_input: input,
      actor_status: text(actorRun.status, 100) || "READY",
    };
    const update = await db.from("job_fetch_runs").update({
      status: "running",
      metadata: updatedMetadata,
      raw_response: {
        apify_run_id: apifyRunId,
        dataset_id: datasetId,
        status: actorRun.status,
      },
    }).eq("id", fetchRunId);
    if (update.error) throw new Error(update.error.message);

    return reply({
      ok: true,
      status: "running",
      fetch_run_id: fetchRunId,
      apify_run_id: apifyRunId,
      dataset_id: datasetId,
      category: config.category,
      table: config.table,
      requested_limit: requestedLimit,
      posted_within_days: 1,
    }, 202);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markFailed(db, fetchRunId || "", message);
    throw error;
  }
}

function relevant(config: JobPipelineConfig, title: string, description: string): boolean {
  const haystack = normalize(`${title} ${description}`);
  if (config.excludeTerms.some((term) => haystack.includes(normalize(term)))) return false;
  return config.includeTerms.some((term) => haystack.includes(normalize(term)));
}

function isNsw(location: string, state: string | null): boolean {
  const value = normalize(`${location} ${state || ""}`);
  return value.includes(" nsw") || value.startsWith("nsw") ||
    value.includes("new south wales") || value.endsWith("nsw au");
}

function postedAt(value: unknown): string | null {
  const raw = text(value, 300);
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  // Precise timestamps older than 24 hours are rejected. Date-only values are
  // trusted because the Actor itself was called with postedWithinDays=1.
  if (/T|:\d{2}/.test(raw) && Date.now() - parsed.getTime() > 24 * 60 * 60 * 1000) {
    return null;
  }
  return parsed.toISOString();
}

async function prepare(
  config: JobPipelineConfig,
  raw: Row,
  apifyRunId: string,
  datasetId: string,
): Promise<{ row: Row | null; reason: "valid" | "invalid" | "location" | "relevance" }> {
  const item = isRow(raw.job) ? raw.job : isRow(raw.data) ? raw.data : raw;
  const title = text(item.title ?? item.jobTitle ?? item.job_title, 500);
  const company = text(item.company ?? item.companyName ?? item.company_name, 500);
  const location = text(item.location ?? item.jobLocation ?? item.job_location, 500);
  const state = text(item.state, 100);
  const description = text(item.description ?? item.jobDescription ?? item.job_description, 50_000) || "";
  const applyUrl = canonicalUrl(
    item.applyUrl ?? item.apply_url ?? item.job_url_direct ?? item.jobUrl ?? item.job_url ?? item.url,
  );
  if (!title || !company || !location || !applyUrl) return { row: null, reason: "invalid" };
  if (!isNsw(location, state)) return { row: null, reason: "location" };
  if (!relevant(config, title, description)) return { row: null, reason: "relevance" };

  const normalizedTitle = normalize(title);
  const normalizedCompany = normalize(company);
  const normalizedLocation = normalize(location);
  const rawSourceId = text(item.jobId ?? item.job_id ?? item.id, 2000);
  const sourceJobId = rawSourceId || applyUrl;
  const dedupeKey = await sha256(`${normalizedCompany}|${normalizedTitle}|${normalizedLocation}`);
  const now = new Date().toISOString();
  const parsedPostedAt = postedAt(item.postedAt ?? item.date_posted ?? item.posted_at);

  return {
    reason: "valid",
    row: {
      source_job_id: sourceJobId,
      title,
      company,
      location,
      city: text(item.city, 200),
      state: state || "NSW",
      country: text(item.country, 100) || "Australia",
      description: description || null,
      apply_url: applyUrl,
      source_url: canonicalUrl(item.sourceUrl ?? item.source_url ?? item.job_url),
      posted_at: parsedPostedAt,
      job_type: text(item.jobType ?? item.job_type, 200),
      is_remote: booleanValue(item.isRemote ?? item.is_remote),
      salary: text(item.salary, 500),
      salary_min: numberValue(item.salaryMin ?? item.min_amount),
      salary_max: numberValue(item.salaryMax ?? item.max_amount),
      salary_currency: text(item.salaryCurrency ?? item.currency, 50),
      salary_interval: text(item.salaryInterval ?? item.interval, 100),
      company_url: canonicalUrl(item.companyUrl ?? item.company_url),
      company_logo: canonicalUrl(item.companyLogo ?? item.company_logo),
      emails: stringArray(item.emails),
      normalized_title: normalizedTitle,
      normalized_company: normalizedCompany,
      canonical_apply_url: applyUrl,
      dedupe_key: dedupeKey,
      source: "indeed",
      provider: "apify",
      search_query: text(item.searchQuery ?? item.search_query, 1000) || config.searchTerms[0],
      template_slug: config.templateSlug,
      category: config.category,
      pool_key: config.poolKey,
      apify_actor_id: APIFY_ACTOR_ID,
      apify_run_id: apifyRunId,
      apify_dataset_id: datasetId,
      raw_payload: raw,
      catalogue_status: "active",
      status: "new",
      fetched_at: now,
      last_seen_at: now,
      expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
      is_active: true,
      updated_at: now,
    },
  };
}

async function existingMap(
  db: SupabaseClient,
  table: string,
  rows: Row[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const queries: Array<["source_job_id" | "canonical_apply_url" | "dedupe_key", string[]]> = [
    ["source_job_id", unique(rows.map((row) => text(row.source_job_id, 2000)))],
    ["canonical_apply_url", unique(rows.map((row) => text(row.canonical_apply_url, 4000)))],
    ["dedupe_key", unique(rows.map((row) => text(row.dedupe_key, 200)))],
  ];
  for (const [column, values] of queries) {
    for (const batch of chunks(values, 100)) {
      if (!batch.length) continue;
      const found = await db.from(table)
        .select("id,source_job_id,canonical_apply_url,dedupe_key")
        .in(column, batch);
      if (found.error) throw new Error(found.error.message);
      for (const item of found.data || []) {
        if (item.source_job_id) result.set(`source:${item.source_job_id}`, item.id);
        if (item.canonical_apply_url) result.set(`url:${item.canonical_apply_url}`, item.id);
        if (item.dedupe_key) result.set(`key:${item.dedupe_key}`, item.id);
      }
    }
  }
  return result;
}

function matchedId(map: Map<string, string>, row: Row): string | null {
  return map.get(`source:${row.source_job_id}`) ||
    map.get(`url:${row.canonical_apply_url}`) ||
    map.get(`key:${row.dedupe_key}`) || null;
}

async function storeRows(
  db: SupabaseClient,
  config: JobPipelineConfig,
  rows: Row[],
): Promise<{ inserted: number; updated: number }> {
  const map = await existingMap(db, config.table, rows);
  const inserts: Row[] = [];
  const updates: Row[] = [];
  for (const row of rows) {
    const id = matchedId(map, row);
    if (id) updates.push({ ...row, id });
    else inserts.push(row);
  }

  let inserted = 0;
  let updated = 0;
  for (const batch of chunks(updates, 100)) {
    const result = await db.from(config.table).upsert(batch, { onConflict: "id" }).select("id");
    if (result.error) throw new Error(result.error.message);
    updated += result.data?.length || 0;
  }
  for (const batch of chunks(inserts, 100)) {
    const result = await db.from(config.table).insert(batch).select("id");
    if (!result.error) {
      inserted += result.data?.length || 0;
      continue;
    }
    if (result.error.code !== "23505") throw new Error(result.error.message);
    for (const row of batch) {
      const one = await db.from(config.table).insert(row).select("id").maybeSingle();
      if (!one.error && one.data) inserted += 1;
      else if (one.error?.code === "23505") updated += 1;
      else if (one.error) throw new Error(one.error.message);
    }
  }
  return { inserted, updated };
}

async function resolveRun(
  db: SupabaseClient,
  config: JobPipelineConfig,
  fetchRunId: string | null,
): Promise<Row | null> {
  let query = db.from("job_fetch_runs").select("*").eq("source", config.source);
  if (fetchRunId) query = query.eq("id", fetchRunId);
  else query = query.in("status", ACTIVE_STATUSES).order("started_at", { ascending: false }).limit(1);
  const result = await query.maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return result.data as Row | null;
}

async function collectRun(
  db: SupabaseClient,
  config: JobPipelineConfig,
  fetchRunId: string | null,
): Promise<Response> {
  const run = await resolveRun(db, config, fetchRunId);
  if (!run) return reply({ ok: true, status: "idle", category: config.category });
  const runId = text(run.id, 100) || "";
  const metadata = getRunMetadata(run);
  const apifyRunId = text(metadata.apify_run_id, 200);
  if (!apifyRunId) throw new Error("APIFY_RUN_ID_MISSING");

  const body = await apify(`/actor-runs/${encodeURIComponent(apifyRunId)}`);
  const actorRun = isRow(body.data) ? body.data : body;
  const actorStatus = text(actorRun.status, 100) || "UNKNOWN";
  const datasetId = text(actorRun.defaultDatasetId, 200) || text(metadata.dataset_id, 200);

  if (TERMINAL_FAILURES.includes(actorStatus)) {
    await markFailed(db, runId, `Apify run ended with ${actorStatus}`);
    return reply({ ok: false, status: "failed", actor_status: actorStatus, fetch_run_id: runId }, 502);
  }
  if (actorStatus !== "SUCCEEDED") {
    await db.from("job_fetch_runs").update({
      status: "running",
      metadata: { ...metadata, actor_status: actorStatus, dataset_id: datasetId },
    }).eq("id", runId);
    return reply({ ok: true, status: "running", actor_status: actorStatus, fetch_run_id: runId }, 202);
  }
  if (!datasetId) throw new Error("APIFY_DATASET_ID_MISSING");

  const requestedLimit = integer(metadata.requested_limit, MAX_ITEMS, 1, MAX_ITEMS);
  const offset = Math.max(0, Number(metadata.import_offset || 0));
  const remaining = Math.max(0, requestedLimit - offset);
  const limit = Math.min(PAGE_SIZE, remaining || PAGE_SIZE);
  const datasetResponse = await fetch(
    `${APIFY_API_BASE}/datasets/${encodeURIComponent(datasetId)}/items?clean=true&format=json&offset=${offset}&limit=${limit}`,
    { headers: { accept: "application/json", authorization: `Bearer ${APIFY_TOKEN}` } },
  );
  const datasetBody = await datasetResponse.json().catch(() => []);
  if (!datasetResponse.ok) {
    throw new Error(`Apify dataset ${datasetResponse.status}: ${JSON.stringify(datasetBody).slice(0, 1500)}`);
  }
  const items = Array.isArray(datasetBody)
    ? datasetBody.filter((item): item is Row => isRow(item))
    : [];

  const pageKeys = new Set<string>();
  const prepared: Row[] = [];
  let invalid = 0;
  let excludedLocation = 0;
  let excludedRelevance = 0;
  for (const item of items) {
    const result = await prepare(config, item, apifyRunId, datasetId);
    if (!result.row) {
      if (result.reason === "location") excludedLocation += 1;
      else if (result.reason === "relevance") excludedRelevance += 1;
      else invalid += 1;
      continue;
    }
    const key = String(result.row.dedupe_key);
    if (pageKeys.has(key)) continue;
    pageKeys.add(key);
    prepared.push(result.row);
  }

  const stored = await storeRows(db, config, prepared);
  const nextOffset = offset + items.length;
  const complete = items.length < limit || nextOffset >= requestedLimit;
  const finalMetadata = {
    ...metadata,
    actor_status: actorStatus,
    dataset_id: datasetId,
    import_offset: nextOffset,
    inserted: Number(metadata.inserted || 0) + stored.inserted,
    updated: Number(metadata.updated || 0) + stored.updated,
    invalid: Number(metadata.invalid || 0) + invalid,
    excluded_location: Number(metadata.excluded_location || 0) + excludedLocation,
    excluded_relevance: Number(metadata.excluded_relevance || 0) + excludedRelevance,
    last_page_items: items.length,
    last_collected_at: new Date().toISOString(),
  };
  const status = complete ? "completed" : "collecting";
  const update = await db.from("job_fetch_runs").update({
    status,
    jobs_found: nextOffset,
    jobs_inserted: finalMetadata.inserted,
    jobs_updated: finalMetadata.updated,
    error_message: null,
    finished_at: complete ? new Date().toISOString() : null,
    metadata: finalMetadata,
    raw_response: {
      apify_run_id: apifyRunId,
      dataset_id: datasetId,
      actor_status: actorStatus,
      imported_offset: nextOffset,
    },
  }).eq("id", runId);
  if (update.error) throw new Error(update.error.message);

  return reply({
    ok: true,
    status,
    category: config.category,
    table: config.table,
    fetch_run_id: runId,
    apify_run_id: apifyRunId,
    dataset_id: datasetId,
    page: { offset, received: items.length, accepted: prepared.length, next_offset: nextOffset },
    totals: {
      inserted: finalMetadata.inserted,
      updated: finalMetadata.updated,
      invalid: finalMetadata.invalid,
      excluded_location: finalMetadata.excluded_location,
      excluded_relevance: finalMetadata.excluded_relevance,
    },
  }, complete ? 200 : 202);
}

export function serveJobPipeline(config: JobPipelineConfig): void {
  Deno.serve(async (req: Request) => {
    try {
      if (req.method !== "POST") return reply({ ok: false, error: "Use POST" }, 405);
      if (!SUPABASE_URL || !SERVICE_KEY) return reply({ ok: false, error: "Missing Supabase configuration" }, 500);
      if (!authorised(req)) return reply({ ok: false, error: "Unauthorized" }, 401);

      const input = await req.json().catch(() => ({})) as Row;
      const action = text(input.action, 50) || "tick";
      if (action === "health") {
        return reply({
          ok: Boolean(APIFY_TOKEN),
          function: config.functionName,
          version: config.version,
          category: config.category,
          table: config.table,
          apify_actor_id: APIFY_ACTOR_ID,
          apify_token_configured: Boolean(APIFY_TOKEN),
          max_items: MAX_ITEMS,
          page_size: PAGE_SIZE,
        }, APIFY_TOKEN ? 200 : 500);
      }
      if (!APIFY_TOKEN) return reply({ ok: false, error: "Missing APIFY_API_TOKEN" }, 500);

      const db = createClient(SUPABASE_URL, SERVICE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      if (action === "start") {
        const requestedLimit = integer(input.limit, MAX_ITEMS, 1, MAX_ITEMS);
        return await startRun(db, config, requestedLimit);
      }
      if (action === "collect" || action === "tick") {
        const fetchRunId = text(input.fetch_run_id, 100);
        return await collectRun(db, config, fetchRunId);
      }
      return reply({ ok: false, error: "Use health, start, collect, or tick" }, 400);
    } catch (error) {
      return reply({
        ok: false,
        function: config.functionName,
        version: config.version,
        error: error instanceof Error ? error.message : String(error),
      }, 500);
    }
  });
}
