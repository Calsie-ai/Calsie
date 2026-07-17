import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type Row = Record<string, any>;
const VERSION = "global_daily_100_v1";
const URL = Deno.env.get("SUPABASE_URL") || "";
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("APPLIX_SERVICE_ROLE_KEY") || "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
const OUTSCRAPER_KEY = Deno.env.get("OUTSCRAPER_API_KEY") || "";
const OUTSCRAPER_URL = Deno.env.get("OUTSCRAPER_JOBS_API_URL") || "https://api.outscraper.cloud/indeed-search";
const INDEED_URL = Deno.env.get("OUTSCRAPER_INDEED_BASE_URL") || "https://au.indeed.com/jobs";

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json" } });
const text = (v: unknown) => v == null ? "" : String(v).trim();
const norm = (v: unknown) => text(v).toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
const uniq = (values: unknown[]) => [...new Set(values.map(text).filter(Boolean))];
const authorised = (req: Request) => {
  const bearer = text(req.headers.get("authorization")).replace(/^Bearer\s+/i, "");
  const header = text(req.headers.get("x-applix-cron-secret"));
  return Boolean(CRON_SECRET && (header === CRON_SECRET || bearer === CRON_SECRET)) || Boolean(KEY && bearer === KEY);
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
const isoDate = (v: unknown) => { const d = new Date(text(v)); return Number.isNaN(d.getTime()) ? null : d.toISOString(); };

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return reply({ ok: false, error: "Use POST" }, 405);
    if (!URL || !KEY || !CRON_SECRET || !OUTSCRAPER_KEY) return reply({ ok: false, error: "Missing configuration" }, 500);
    if (!authorised(req)) return reply({ ok: false, error: "Unauthorized" }, 401);
    const input = await req.json().catch(() => ({})) as Row;
    const force = input.force === true;
    const clock = sydneyParts();
    if (!force && clock.hour !== 6) return reply({ ok: true, skipped: true, reason: "outside_6am_sydney_window", sydney_hour: clock.hour, run_date: clock.date });

    const db = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const batchKey = `global_daily_100:${clock.date}`;
    const existing = await db.from("job_fetch_runs").select("id,status,jobs_found,jobs_inserted,jobs_updated,started_at,finished_at").eq("batch_key", batchKey).maybeSingle();
    if (existing.error) throw new Error(existing.error.message);
    if (!force && existing.data?.status === "completed") return reply({ ok: true, skipped: true, reason: "already_completed", run: existing.data });

    let runId = existing.data?.id as string | undefined;
    if (!runId) {
      const created = await db.from("job_fetch_runs").insert({ source: "outscraper_indeed", provider: "outscraper", query: "global active template rotation", location: "Australia", country: "au", status: "started", batch_key: batchKey, metadata: { mode: "global_daily_100", timezone: "Australia/Sydney" } }).select("id").single();
      if (created.error) throw new Error(created.error.message);
      runId = created.data.id;
    } else {
      await db.from("job_fetch_runs").update({ status: "started", error_message: null, finished_at: null }).eq("id", runId);
    }

    const templates = await db.from("campaign_templates").select("id,query_terms,location,is_active").eq("is_active", true).order("updated_at", { ascending: false }).limit(50);
    if (templates.error) throw new Error(templates.error.message);
    const queryTerms = uniq((templates.data || []).flatMap((t: Row) => Array.isArray(t.query_terms) ? t.query_terms : [])).slice(0, 12);
    const queries = queryTerms.length ? queryTerms : ["jobs"];
    const provider = new URL(OUTSCRAPER_URL);
    for (const term of queries) {
      const indeed = new URL(INDEED_URL);
      indeed.searchParams.set("q", term);
      indeed.searchParams.set("l", "Australia");
      provider.searchParams.append("query", indeed.toString());
    }
    provider.searchParams.set("limit", "100");
    provider.searchParams.set("async", "false");

    const response = await fetch(provider, { headers: { "X-API-KEY": OUTSCRAPER_KEY } });
    const raw = await response.text();
    let payload: unknown = {}; try { payload = raw ? JSON.parse(raw) : {}; } catch { payload = { raw }; }
    if (!response.ok) throw new Error(`Outscraper failed ${response.status}: ${JSON.stringify(payload).slice(0, 1000)}`);

    const now = new Date().toISOString();
    const sourceRows = rowsFrom(payload).slice(0, 100);
    let inserted = 0, updated = 0, duplicates = 0;
    const seen = new Set<string>();
    for (const r of sourceRows) {
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
        const q = await db.from("jobs").select("id").eq("source", "outscraper_indeed").eq("source_job_id", sourceJobId).maybeSingle(); if (q.error) throw new Error(q.error.message); found = q.data;
      }
      if (!found && canonicalUrl) {
        const q = await db.from("jobs").select("id").is("user_id", null).is("campaign_id", null).eq("canonical_apply_url", canonicalUrl).maybeSingle(); if (q.error) throw new Error(q.error.message); found = q.data;
      }
      if (!found && globalKey) {
        const q = await db.from("jobs").select("id").is("user_id", null).is("campaign_id", null).eq("global_dedupe_key", globalKey).maybeSingle(); if (q.error) throw new Error(q.error.message); found = q.data;
      }
      const job = {
        user_id: null, campaign_id: null, source: "outscraper_indeed", source_job_id: sourceJobId,
        title: title || null, normalized_title: norm(title) || null, company: company || null, normalized_company: norm(company) || null,
        location: location || null, country: "au", description: text(r.snippet || r.description || r.summary || r.job_description) || null,
        apply_url: applyUrl || null, canonical_apply_url: canonicalUrl, posted_at: isoDate(r.pubDate || r.createDate || r.posted_at || r.posted_date || r.date_posted || r.date),
        fetched_at: now, last_seen_at: now, expires_at: new Date(Date.now() + 30 * 86400000).toISOString(), status: "new", catalogue_status: "active",
        search_query: queries.join(" | "), raw_payload: r, global_dedupe_key: globalKey || null,
        job_dedupe_key: [canonicalUrl || "", norm(company), norm(title), norm(location)].join("|"), fetch_run_id: runId,
      };
      if (found?.id) {
        const q = await db.from("jobs").update(job).eq("id", found.id); if (q.error) throw new Error(q.error.message); updated++;
      } else {
        const q = await db.from("jobs").insert(job); if (q.error) { if (q.error.code === "23505") duplicates++; else throw new Error(q.error.message); } else inserted++;
      }
    }

    const done = await db.from("job_fetch_runs").update({ status: "completed", jobs_found: sourceRows.length, jobs_inserted: inserted, jobs_updated: updated, finished_at: now, metadata: { mode: "global_daily_100", timezone: "Australia/Sydney", query_terms: queries, duplicates_skipped: duplicates, provider_status: response.status } }).eq("id", runId).select("*").single();
    if (done.error) throw new Error(done.error.message);
    return reply({ ok: true, function: "applix-global-daily-job-fetcher", version: VERSION, run: done.data, sends_emails_now: false });
  } catch (error) {
    return reply({ ok: false, function: "applix-global-daily-job-fetcher", version: VERSION, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
