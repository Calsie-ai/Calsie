import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type Row = Record<string, any>;
const VERSION = "global_daily_100_v3_resumable";
const URL = Deno.env.get("SUPABASE_URL") || "";
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("APPLIX_SERVICE_ROLE_KEY") || "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
const OUTSCRAPER_KEY = Deno.env.get("OUTSCRAPER_API_KEY") || "";
const OUTSCRAPER_URL = Deno.env.get("OUTSCRAPER_JOBS_API_URL") || "https://api.outscraper.cloud/indeed-search";
const OUTSCRAPER_REQUESTS_URL = Deno.env.get("OUTSCRAPER_REQUESTS_API_URL") || "https://api.outscraper.cloud/requests";
const INDEED_URL = Deno.env.get("OUTSCRAPER_INDEED_BASE_URL") || "https://au.indeed.com/jobs";
const DAILY_CAP = 100;
const NORMALIZE_BATCH = 25;

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json" } });
const text = (v: unknown) => v == null ? "" : String(v).trim();
const norm = (v: unknown) => text(v).toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
const uniq = (values: unknown[]) => [...new Set(values.map(text).filter(Boolean))];
const authorised = (req: Request) => {
  const bearer = text(req.headers.get("authorization")).replace(/^Bearer\s+/i, "");
  const header = text(req.headers.get("x-applix-cron-secret"));
  return Boolean(KEY && bearer === KEY) || Boolean(CRON_SECRET && (header === CRON_SECRET || bearer === CRON_SECRET));
};
const sydneyParts = () => {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value || "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
};
const canonical = (value: unknown) => {
  const raw = text(value); if (!raw) return null;
  try { const u = new URL(raw); u.hash = ""; ["utm_source","utm_medium","utm_campaign","from","source","ref","tracking","trk"].forEach((k) => u.searchParams.delete(k)); u.hostname = u.hostname.toLowerCase(); return u.toString(); } catch { return raw.toLowerCase(); }
};
const flatten = (value: unknown): Row[] => Array.isArray(value) ? value.flatMap((x) => Array.isArray(x) ? flatten(x) : [x as Row]) : [];
const rowsFrom = (payload: unknown): Row[] => {
  if (Array.isArray(payload)) return flatten(payload);
  const p = payload as Row;
  for (const key of ["data", "results", "jobs"]) if (Array.isArray(p?.[key])) return flatten(p[key]);
  return [];
};
const isoDate = (v: unknown) => { const raw = text(v); if (!raw) return null; const d = new Date(raw); return Number.isNaN(d.getTime()) ? null : d.toISOString(); };
const metadataOf = (run: Row) => run?.metadata && typeof run.metadata === "object" && !Array.isArray(run.metadata) ? run.metadata as Row : {};

async function buildQuery(db: any) {
  const templates = await db.from("campaign_templates").select("query_terms").eq("is_active", true).order("updated_at", { ascending: false }).limit(50);
  if (templates.error) throw new Error(templates.error.message);
  const terms = uniq((templates.data || []).flatMap((t: Row) => Array.isArray(t.query_terms) ? t.query_terms : [])).slice(0, 10);
  return terms.length ? terms.map((term) => `(${term})`).join(" OR ") : "jobs";
}

async function submitProvider(db: any, run: Row, query: string) {
  const indeed = new URL(INDEED_URL);
  indeed.searchParams.set("q", query);
  indeed.searchParams.set("l", "Australia");
  const provider = new URL(OUTSCRAPER_URL);
  provider.searchParams.set("query", indeed.toString());
  provider.searchParams.set("limit", String(DAILY_CAP));
  provider.searchParams.set("async", "true");

  const response = await fetch(provider, { headers: { "X-API-KEY": OUTSCRAPER_KEY } });
  const raw = await response.text();
  let payload: Row = {}; try { payload = raw ? JSON.parse(raw) : {}; } catch { payload = { raw }; }
  if (!response.ok && response.status !== 202) throw new Error(`Outscraper submit failed ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`);

  const requestId = text(payload.id);
  const status = text(payload.status).toLowerCase();
  if (!requestId && status !== "success") throw new Error("Outscraper did not return a request ID");

  if (status === "success") {
    const sourceRows = rowsFrom(payload).slice(0, DAILY_CAP);
    const update = await db.from("job_fetch_runs").update({
      status: "normalizing",
      query,
      raw_response: payload,
      metadata: { ...metadataOf(run), mode: "global_daily_100", provider_request_id: requestId || null, provider_status: "success", normalization_cursor: 0, source_count: sourceRows.length, last_progress_at: new Date().toISOString() },
      error_message: null,
    }).eq("id", run.id).select("*").single();
    if (update.error) throw new Error(update.error.message);
    return { action: "provider_completed", run: update.data };
  }

  const update = await db.from("job_fetch_runs").update({
    status: "provider_processing",
    query,
    metadata: { ...metadataOf(run), mode: "global_daily_100", provider_request_id: requestId, provider_status: status || "pending", submitted_at: new Date().toISOString(), last_progress_at: new Date().toISOString() },
    error_message: null,
  }).eq("id", run.id).select("*").single();
  if (update.error) throw new Error(update.error.message);
  return { action: "provider_submitted", run: update.data };
}

async function pollProvider(db: any, run: Row) {
  const metadata = metadataOf(run);
  const requestId = text(metadata.provider_request_id);
  if (!requestId) return submitProvider(db, run, text(run.query) || await buildQuery(db));

  const response = await fetch(`${OUTSCRAPER_REQUESTS_URL}/${encodeURIComponent(requestId)}?flat=true`, { headers: { "X-API-KEY": OUTSCRAPER_KEY } });
  const raw = await response.text();
  let payload: Row = {}; try { payload = raw ? JSON.parse(raw) : {}; } catch { payload = { raw }; }
  if (!response.ok) throw new Error(`Outscraper poll failed ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`);

  const providerStatus = text(payload.status).toLowerCase();
  if (providerStatus === "pending" || providerStatus === "processing" || providerStatus === "running") {
    const update = await db.from("job_fetch_runs").update({
      status: "provider_processing",
      metadata: { ...metadata, provider_status: providerStatus, last_polled_at: new Date().toISOString() },
    }).eq("id", run.id).select("*").single();
    if (update.error) throw new Error(update.error.message);
    return { action: "provider_pending", run: update.data };
  }

  if (providerStatus === "failure" || providerStatus === "failed") throw new Error("Outscraper request failed");
  if (providerStatus !== "success") throw new Error(`Unexpected Outscraper request status: ${providerStatus || "missing"}`);

  const sourceRows = rowsFrom(payload).slice(0, DAILY_CAP);
  const update = await db.from("job_fetch_runs").update({
    status: "normalizing",
    raw_response: payload,
    metadata: { ...metadata, provider_status: "success", normalization_cursor: 0, source_count: sourceRows.length, last_progress_at: new Date().toISOString() },
    error_message: null,
  }).eq("id", run.id).select("*").single();
  if (update.error) throw new Error(update.error.message);
  return { action: "provider_completed", run: update.data };
}

async function normalizeBatch(db: any, run: Row) {
  const metadata = metadataOf(run);
  const sourceRows = rowsFrom(run.raw_response).slice(0, DAILY_CAP);
  const cursor = Math.max(0, Number(metadata.normalization_cursor || 0));
  const batch = sourceRows.slice(cursor, cursor + NORMALIZE_BATCH);
  let inserted = 0, updated = 0, duplicates = 0;
  const seen = new Set<string>();
  const now = new Date().toISOString();
  const query = text(run.query) || "jobs";

  for (const r of batch) {
    const title = text(r.title || r.displayTitle || r.job_title || r.position || r.role);
    const company = text(r.company || r.company_name || r.employer || r.organization);
    const location = text(r.formattedLocation || r.location || [r.city, r.state].filter(Boolean).join(" "));
    const applyUrl = text(r.viewJobLink || r.apply_url || r.job_url || r.url || r.link);
    if (!title && !company && !applyUrl) continue;

    const sourceJobId = text(r.source_job_id || r.job_id || r.id || r.indeed_job_id || r.jobKey || r.jobkey || r.job_key) || null;
    const canonicalUrl = canonical(applyUrl);
    const globalKey = [norm(company), norm(title), norm(location)].join("|");
    const localKey = sourceJobId ? `id:${sourceJobId}` : canonicalUrl ? `url:${canonicalUrl}` : `global:${globalKey}`;
    if (seen.has(localKey)) { duplicates++; continue; }
    seen.add(localKey);

    let found: Row | null = null;
    if (sourceJobId) {
      const q = await db.from("jobs").select("id").eq("source", "outscraper_indeed").eq("source_job_id", sourceJobId).maybeSingle();
      if (q.error) throw new Error(q.error.message); found = q.data;
    }
    if (!found && canonicalUrl) {
      const q = await db.from("jobs").select("id").is("user_id", null).is("campaign_id", null).eq("canonical_apply_url", canonicalUrl).maybeSingle();
      if (q.error) throw new Error(q.error.message); found = q.data;
    }
    if (!found && globalKey) {
      const q = await db.from("jobs").select("id").is("user_id", null).is("campaign_id", null).eq("global_dedupe_key", globalKey).maybeSingle();
      if (q.error) throw new Error(q.error.message); found = q.data;
    }

    const job = {
      user_id: null, campaign_id: null, source: "outscraper_indeed", source_job_id: sourceJobId,
      title: title || null, normalized_title: norm(title) || null, company: company || null, normalized_company: norm(company) || null,
      location: location || null, country: "au", description: text(r.snippet || r.description || r.summary || r.job_description) || null,
      apply_url: applyUrl || null, canonical_apply_url: canonicalUrl, posted_at: isoDate(r.pubDate || r.createDate || r.posted_at || r.posted_date || r.date_posted || r.date),
      fetched_at: now, last_seen_at: now, expires_at: new Date(Date.now() + 30 * 86400000).toISOString(), status: "new", catalogue_status: "active",
      search_query: query, raw_payload: r, global_dedupe_key: globalKey || null,
      job_dedupe_key: [canonicalUrl || "", norm(company), norm(title), norm(location)].join("|"), fetch_run_id: run.id,
    };

    if (found?.id) {
      const q = await db.from("jobs").update(job).eq("id", found.id); if (q.error) throw new Error(q.error.message); updated++;
    } else {
      const q = await db.from("jobs").insert(job); if (q.error) { if (q.error.code === "23505") duplicates++; else throw new Error(q.error.message); } else inserted++;
    }
  }

  const nextCursor = cursor + batch.length;
  const finished = nextCursor >= sourceRows.length;
  const nextMetadata = { ...metadata, normalization_cursor: nextCursor, source_count: sourceRows.length, duplicates_skipped: Number(metadata.duplicates_skipped || 0) + duplicates, last_progress_at: now };
  const update = await db.from("job_fetch_runs").update({
    status: finished ? "completed" : "normalizing",
    jobs_found: sourceRows.length,
    jobs_inserted: Number(run.jobs_inserted || 0) + inserted,
    jobs_updated: Number(run.jobs_updated || 0) + updated,
    finished_at: finished ? now : null,
    metadata: nextMetadata,
    error_message: null,
  }).eq("id", run.id).select("*").single();
  if (update.error) throw new Error(update.error.message);
  return { action: finished ? "completed" : "normalizing", processed: batch.length, run: update.data };
}

Deno.serve(async (req) => {
  let db: any = null;
  let run: Row | null = null;
  try {
    if (req.method !== "POST") return reply({ ok: false, error: "Use POST" }, 405);
    if (!URL || !KEY || !CRON_SECRET || !OUTSCRAPER_KEY) return reply({ ok: false, error: "Missing configuration" }, 500);
    if (!authorised(req)) return reply({ ok: false, error: "Unauthorized" }, 401);

    const input = await req.json().catch(() => ({})) as Row;
    const force = input.force === true;
    const clock = sydneyParts();
    db = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const batchKey = `global_daily_100:${clock.date}`;
    const existing = await db.from("job_fetch_runs").select("*").eq("batch_key", batchKey).maybeSingle();
    if (existing.error) throw new Error(existing.error.message);
    run = existing.data as Row | null;

    if (!run && !force && clock.hour !== 6) return reply({ ok: true, skipped: true, reason: "outside_submission_window", sydney_hour: clock.hour, run_date: clock.date });
    if (run?.status === "completed") return reply({ ok: true, skipped: true, reason: "already_completed", run });

    if (!run) {
      const query = await buildQuery(db);
      const created = await db.from("job_fetch_runs").insert({
        source: "outscraper_indeed", provider: "outscraper", query, location: "Australia", country: "au", status: "started", batch_key: batchKey,
        metadata: { mode: "global_daily_100", timezone: "Australia/Sydney", workflow_version: VERSION, normalization_cursor: 0, last_progress_at: new Date().toISOString() },
      }).select("*").single();
      if (created.error) throw new Error(created.error.message);
      run = created.data;
    }

    let result: Row;
    if (["started", "needs_attention", "failed"].includes(text(run.status))) result = await submitProvider(db, run, text(run.query) || await buildQuery(db));
    else if (text(run.status) === "provider_processing") result = await pollProvider(db, run);
    else if (text(run.status) === "normalizing") result = await normalizeBatch(db, run);
    else result = { action: "unknown_state", run };

    return reply({ ok: true, function: "applix-global-daily-job-fetcher", version: VERSION, daily_cap: DAILY_CAP, normalize_batch: NORMALIZE_BATCH, ...result, sends_emails_now: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (db && run?.id) {
      await db.from("job_fetch_runs").update({
        status: "needs_attention",
        error_message: message.slice(0, 1000),
        metadata: { ...metadataOf(run), last_failure_at: new Date().toISOString(), workflow_version: VERSION },
      }).eq("id", run.id);
    }
    return reply({ ok: false, function: "applix-global-daily-job-fetcher", version: VERSION, error: message }, 500);
  }
});
