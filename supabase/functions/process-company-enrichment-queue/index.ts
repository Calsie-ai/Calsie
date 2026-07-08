import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type Row = Record<string, any>;

const FUNCTION_NAME = "process-company-enrichment-queue";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("APPLIX_SERVICE_ROLE_KEY") || "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") || Deno.env.get("APPLIX_CRON_SECRET") || "";
const MAX_WORKER_LIMIT = 1;
const ENRICH_TIMEOUT_MS = 55_000;
const DRAFT_TIMEOUT_MS = 45_000;

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type, x-applix-cron-secret, x-cron-secret, cron-secret",
};

const BLOCKED_EMAIL_PARTS = [
  "sentry.io",
  "ingest",
  ".ingest.",
  "zendesk",
  "noreply",
  "no-reply",
  "do-not-reply",
  "donotreply",
  "privacy@",
  "accounts@",
  "billing@",
  "example@",
  "test@",
  "support@indeed",
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

function txt(value: unknown, fallback = "") {
  if (value === undefined || value === null) return fallback;
  const clean = String(value).trim();
  return clean || fallback;
}

function bearerToken(req: Request) {
  const authHeader = req.headers.get("authorization") || "";
  return authHeader.replace(/^Bearer\s+/i, "").trim();
}

function isInternalAuthorized(req: Request) {
  const token = bearerToken(req);
  const xApplixCronSecret = req.headers.get("x-applix-cron-secret") || "";
  const xCronSecret = req.headers.get("x-cron-secret") || "";
  const plainCronSecret = req.headers.get("cron-secret") || "";

  if (SUPABASE_SERVICE_ROLE_KEY && token === SUPABASE_SERVICE_ROLE_KEY) return true;

  return Boolean(
    CRON_SECRET &&
      (token === CRON_SECRET ||
        xApplixCronSecret === CRON_SECRET ||
        xCronSecret === CRON_SECRET ||
        plainCronSecret === CRON_SECRET)
  );
}

function cleanEmail(value: unknown): string | null {
  let email = txt(value).toLowerCase();
  if (!email) return null;
  email = email.replace(/^mailto:/i, "").split("?")[0].trim();
  email = email.replace(/[),.;:'"\]>]+$/g, "").replace(/^[([<'"]+/g, "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  if (BLOCKED_EMAIL_PARTS.some((part) => email.includes(part))) return null;
  return email;
}

function normaliseDomain(value: unknown): string | null {
  const raw = txt(value);
  if (!raw) return null;
  try {
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    return new URL(withProtocol).hostname.toLowerCase().replace(/^www\./, "") || null;
  } catch {
    return raw.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] || null;
  }
}

function emailDomainMatchesWebsite(email: string | null, website: string | null) {
  const domain = email?.split("@")[1]?.toLowerCase() || null;
  const websiteDomain = normaliseDomain(website);
  if (!domain || !websiteDomain) return false;
  return domain === websiteDomain || domain.endsWith(`.${websiteDomain}`) || websiteDomain.endsWith(`.${domain}`);
}

function isReusablePoolRow(row: Row) {
  const email = cleanEmail(row.email);
  if (!email) return false;
  if (txt(row.status).toLowerCase() !== "active") return false;
  if (Number(row.confidence || 0) < 70) return false;
  if (row.company_website_url && !emailDomainMatchesWebsite(email, row.company_website_url) && Number(row.confidence || 0) < 90) return false;
  return true;
}

async function invokeFunction(name: string, payload: Row, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/${name}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: SUPABASE_SERVICE_ROLE_KEY,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok || body?.ok === false) {
      throw new Error(`${name} failed: ${txt(body?.error || response.statusText, "Unknown function error")}`);
    }
    return body as Row;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`${name} timed out after ${Math.round(timeoutMs / 1000)} seconds`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function findPoolContact(supabase: ReturnType<typeof createClient>, normalizedCompany: string) {
  const { data, error } = await supabase
    .from("company_contacts_pool")
    .select("*")
    .eq("status", "active")
    .eq("normalized_company", normalizedCompany)
    .gte("confidence", 70)
    .order("confidence", { ascending: false })
    .limit(10);

  if (error) throw new Error(error.message);

  return (data || [])
    .map((row: Row) => ({ ...row, email: cleanEmail(row.email) }))
    .filter(isReusablePoolRow)
    .sort((a: Row, b: Row) => Number(b.confidence || 0) - Number(a.confidence || 0))[0] || null;
}

async function unlockStaleProcessingRows(supabase: ReturnType<typeof createClient>) {
  const staleBefore = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { error, count } = await supabase
    .from("company_enrichment_queue")
    .update({ status: "pending", locked_at: null, locked_by: null, updated_at: new Date().toISOString() }, { count: "exact" })
    .eq("status", "processing")
    .lt("locked_at", staleBefore);

  if (error) throw new Error(error.message);
  return Number(count || 0);
}

async function loadQueueMappings(supabase: ReturnType<typeof createClient>, queueRow: Row) {
  const { data, error } = await supabase
    .from("company_enrichment_queue_jobs")
    .select("id,queue_id,job_id,user_id,campaign_id,status")
    .eq("queue_id", queueRow.id)
    .eq("status", "pending");

  if (error) throw new Error(error.message);
  if ((data || []).length > 0) return data || [];

  const legacyJobIds = Array.isArray(queueRow.job_ids) ? queueRow.job_ids.filter(Boolean) : [];
  return legacyJobIds.map((jobId: string) => ({
    id: null,
    queue_id: queueRow.id,
    job_id: jobId,
    user_id: queueRow.user_id || null,
    campaign_id: queueRow.campaign_id || null,
    status: "pending",
  }));
}

async function incrementPoolContact(supabase: ReturnType<typeof createClient>, row: Row, count: number) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("company_contacts_pool")
    .update({ use_count: Number(row.use_count || 0) + count, last_used_at: now, updated_at: now })
    .eq("id", row.id);
  if (error) throw new Error(error.message);
}

async function updateMappedJobsWithPoolContact(supabase: ReturnType<typeof createClient>, mappings: Row[], poolRow: Row) {
  const email = cleanEmail(poolRow.email);
  if (!email) return 0;
  const jobIds = [...new Set(mappings.map((mapping) => mapping.job_id).filter(Boolean))];
  if (!jobIds.length) return 0;

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("jobs")
    .update({
      extracted_email: email,
      company_website_url: poolRow.company_website_url || null,
      website_discovery_status: poolRow.company_website_url ? "found" : null,
      website_discovery_source: "company_contacts_pool",
      website_discovery_confidence: Number(poolRow.confidence || 0),
      website_discovery_error: null,
      apply_method: "email",
      email_extraction_status: "found",
      email_extraction_source: "company_contacts_pool",
      email_extraction_confidence: Number(poolRow.confidence || 0),
      email_extraction_error: null,
      email_extraction_attempted_at: now,
    })
    .in("id", jobIds);

  if (error) throw new Error(error.message);
  await incrementPoolContact(supabase, poolRow, jobIds.length);
  return jobIds.length;
}

async function createNotification(supabase: ReturnType<typeof createClient>, userId: string, campaignId: string, draftsReady: number) {
  await supabase.from("user_notifications").insert({
    user_id: userId,
    campaign_id: campaignId,
    type: "company_enrichment_completed",
    title: "Applications ready for review",
    message: `Applix prepared ${draftsReady} applications. Please review and approve before sending.`,
    metadata: { drafts_ready: draftsReady },
  });
}

async function generateDraftsForMappings(supabase: ReturnType<typeof createClient>, mappings: Row[]) {
  const byUserCampaign = new Map<string, { userId: string; campaignId: string; count: number }>();
  for (const mapping of mappings) {
    const userId = txt(mapping.user_id);
    const campaignId = txt(mapping.campaign_id);
    if (!userId || !campaignId) continue;
    const key = `${userId}:${campaignId}`;
    const existing = byUserCampaign.get(key) || { userId, campaignId, count: 0 };
    existing.count += 1;
    byUserCampaign.set(key, existing);
  }

  let draftsReady = 0;
  for (const item of byUserCampaign.values()) {
    const result = await invokeFunction("generate-job-outreach-drafts", {
      campaign_id: item.campaignId,
      user_id: item.userId,
      only_approved: true,
      send_immediately: false,
      limit: Math.min(24, Math.max(1, item.count)),
    }, DRAFT_TIMEOUT_MS);
    const created = Number(result.draft_created_count || 0);
    draftsReady += created;
    if (created > 0) await createNotification(supabase, item.userId, item.campaignId, created);
  }
  return draftsReady;
}

async function markMappingsCompleted(supabase: ReturnType<typeof createClient>, mappings: Row[]) {
  const mappingIds = mappings.map((mapping) => mapping.id).filter(Boolean);
  if (!mappingIds.length) return;
  const { error } = await supabase
    .from("company_enrichment_queue_jobs")
    .update({ status: "completed", processed_at: new Date().toISOString() })
    .in("id", mappingIds);
  if (error) throw new Error(error.message);
}

async function markCompleted(supabase: ReturnType<typeof createClient>, queueId: string) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("company_enrichment_queue")
    .update({ status: "completed", processed_at: now, updated_at: now, locked_at: null, locked_by: null, last_error: null })
    .eq("id", queueId);
  if (error) throw new Error(error.message);
}

async function markRetryOrFailed(supabase: ReturnType<typeof createClient>, row: Row, message: string) {
  const attempts = Number(row.attempts || 0) + 1;
  const maxAttempts = Number(row.max_attempts || 3);
  const failed = attempts >= maxAttempts;
  const backoffMinutes = message.includes("timed out") ? 5 : Math.min(240, Math.max(15, attempts * 15));
  const now = new Date();
  const availableAt = new Date(now.getTime() + backoffMinutes * 60 * 1000).toISOString();

  const { error } = await supabase
    .from("company_enrichment_queue")
    .update({
      status: failed ? "failed" : "pending",
      attempts,
      last_error: message.slice(0, 500),
      locked_at: null,
      locked_by: null,
      available_at: failed ? new Date().toISOString() : availableAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);
  if (error) throw new Error(error.message);
  return failed ? "failed" : "retried";
}

async function claimRows(supabase: ReturnType<typeof createClient>, workerId: string) {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("company_enrichment_queue")
    .select("*")
    .eq("status", "pending")
    .lte("available_at", now)
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(3);

  if (error) throw new Error(error.message);

  const claimed: Row[] = [];
  for (const row of (data || []).filter((item: Row) => Number(item.attempts || 0) < Number(item.max_attempts || 3))) {
    if (claimed.length >= MAX_WORKER_LIMIT) break;
    const update = await supabase
      .from("company_enrichment_queue")
      .update({ status: "processing", locked_at: now, locked_by: workerId, updated_at: now })
      .eq("id", row.id)
      .eq("status", "pending")
      .select("*")
      .maybeSingle();
    if (update.error) throw new Error(update.error.message);
    if (update.data) claimed.push(update.data as Row);
  }

  return claimed;
}

async function processRow(supabase: ReturnType<typeof createClient>, row: Row, limits: { emailFinderCallsRemaining: number }) {
  const mappings = await loadQueueMappings(supabase, row);
  const firstJobId = mappings.map((mapping) => mapping.job_id).filter(Boolean)[0];

  let pool = await findPoolContact(supabase, row.normalized_company);
  let enrichTimedOut = false;

  if (!pool && firstJobId) {
    const emailFinderCalls = limits.emailFinderCallsRemaining > 0 ? 1 : 0;
    limits.emailFinderCallsRemaining -= emailFinderCalls;

    try {
      const enrichResult = await invokeFunction("enrich-job-emails", {
        job_id: firstJobId,
        campaign_id: row.campaign_id || undefined,
        only_approved: true,
        force_retry: true,
        limit: 1,
        max_company_searches: 1,
        max_email_finder_calls: emailFinderCalls,
      }, ENRICH_TIMEOUT_MS);

      if (Number(enrichResult.provider_missing || 0) > 0) {
        throw new Error("Website search provider missing; retry after WEBSITE_SEARCH_API_URL and WEBSITE_SEARCH_API_KEY are configured.");
      }
      if (Number(enrichResult.failed || 0) > 0) {
        throw new Error("enrich-job-emails failed for queued company.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("timed out")) enrichTimedOut = true;
      throw error;
    }

    pool = await findPoolContact(supabase, row.normalized_company);
  }

  let updatedJobs = 0;
  let draftsReady = 0;
  let emailFound = false;
  let websiteFound = false;
  let poolReused = false;

  if (pool) {
    emailFound = true;
    websiteFound = Boolean(pool.company_website_url);
    poolReused = true;
    updatedJobs = await updateMappedJobsWithPoolContact(supabase, mappings, pool);
    draftsReady = await generateDraftsForMappings(supabase, mappings);
  }

  if (!enrichTimedOut) {
    await markMappingsCompleted(supabase, mappings);
    await markCompleted(supabase, row.id);
  }
  return { status: "completed", poolReused, emailFound, websiteFound, updatedJobs, draftsReady };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });

  try {
    if (req.method !== "POST") return json({ ok: false, error: "Use POST." }, 405);
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return json({ ok: false, error: "Missing Supabase service role configuration." }, 500);
    if (!isInternalAuthorized(req)) return json({ ok: false, error: "Unauthorized." }, 401);

    const input = await req.json().catch(() => ({}));
    const maxEmailFinderCalls = Math.max(0, Math.min(1, Number(input.max_email_finder_calls ?? 1)));
    const workerId = txt(input.lock_id, `${FUNCTION_NAME}-${crypto.randomUUID()}`);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const stale_unlocked = await unlockStaleProcessingRows(supabase);
    const rows = await claimRows(supabase, workerId);
    const limits = { emailFinderCallsRemaining: maxEmailFinderCalls };

    const summary = {
      ok: true,
      function: FUNCTION_NAME,
      requested_limit_ignored: input.limit ?? null,
      hard_limit: MAX_WORKER_LIMIT,
      stale_unlocked,
      claimed: rows.length,
      pool_reused: 0,
      website_found: 0,
      email_found: 0,
      completed: 0,
      failed: 0,
      retried: 0,
      drafts_ready: 0,
      updated_jobs: 0,
    };

    for (const row of rows) {
      try {
        const result = await processRow(supabase, row, limits);
        if (result.poolReused) summary.pool_reused += 1;
        if (result.websiteFound) summary.website_found += 1;
        if (result.emailFound) summary.email_found += 1;
        if (result.status === "completed") summary.completed += 1;
        summary.drafts_ready += Number(result.draftsReady || 0);
        summary.updated_jobs += Number(result.updatedJobs || 0);
      } catch (error) {
        const action = await markRetryOrFailed(supabase, row, error instanceof Error ? error.message : String(error));
        if (action === "failed") summary.failed += 1;
        else summary.retried += 1;
      }
    }

    return json(summary);
  } catch (error) {
    return json({ ok: false, function: FUNCTION_NAME, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
