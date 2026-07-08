import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type Row = Record<string, any>;

const FUNCTION_NAME = "process-company-enrichment-queue";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("APPLIX_SERVICE_ROLE_KEY") || "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") || Deno.env.get("APPLIX_CRON_SECRET") || "";

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

async function invokeFunction(name: string, payload: Row) {
  const response = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: SUPABASE_SERVICE_ROLE_KEY,
    },
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.ok === false) {
    throw new Error(`${name} failed: ${txt(body?.error || response.statusText, "Unknown function error")}`);
  }
  return body as Row;
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

async function incrementPoolContact(supabase: ReturnType<typeof createClient>, row: Row, count: number) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("company_contacts_pool")
    .update({ use_count: Number(row.use_count || 0) + count, last_used_at: now, updated_at: now })
    .eq("id", row.id);
  if (error) throw new Error(error.message);
}

async function saveLeadContactEmail(supabase: ReturnType<typeof createClient>, queueRow: Row, poolRow: Row) {
  const email = cleanEmail(poolRow.email);
  if (!email || !queueRow.user_id) return null;

  const existing = await supabase
    .from("lead_contact_emails")
    .select("id,reuse_count")
    .eq("user_identifier", queueRow.user_id)
    .eq("email", email)
    .limit(1);
  if (existing.error) throw new Error(existing.error.message);

  const now = new Date().toISOString();
  const payload = {
    user_identifier: queueRow.user_id,
    campaign_id: queueRow.campaign_id || null,
    company_name: queueRow.company_name,
    company_website: poolRow.company_website_url || null,
    company_domain: poolRow.company_domain || null,
    company_website_status: poolRow.company_website_url ? "found" : null,
    website_confidence: Number(poolRow.confidence || 0),
    email,
    email_type: poolRow.email_type || "job_contact",
    source: "company_contacts_pool",
    confidence: Number(poolRow.confidence || 0),
    status: "active",
    raw_source: { pool_contact_id: poolRow.id, queue_id: queueRow.id, job_ids: queueRow.job_ids || [] },
    last_checked_at: now,
    last_used_at: now,
    updated_at: now,
  };

  const existingRow = (existing.data || [])[0];
  if (existingRow) {
    const update = await supabase.from("lead_contact_emails").update({
      ...payload,
      reuse_count: Number(existingRow.reuse_count || 0) + Math.max(1, (queueRow.job_ids || []).length),
    }).eq("id", existingRow.id).select("id").single();
    if (update.error) throw new Error(update.error.message);
    return update.data.id as string;
  }

  const insert = await supabase.from("lead_contact_emails").insert(payload).select("id").single();
  if (insert.error) throw new Error(insert.error.message);
  return insert.data.id as string;
}

async function updateJobsWithPoolContact(supabase: ReturnType<typeof createClient>, queueRow: Row, poolRow: Row) {
  const email = cleanEmail(poolRow.email);
  if (!email) return 0;

  const now = new Date().toISOString();
  const contactId = await saveLeadContactEmail(supabase, queueRow, poolRow);
  const patch = {
    extracted_email: email,
    email_contact_id: contactId,
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
  };

  let updated = 0;
  const jobIds = Array.isArray(queueRow.job_ids) ? queueRow.job_ids.filter(Boolean) : [];
  if (jobIds.length) {
    const byIds = await supabase.from("jobs").update(patch).in("id", jobIds);
    if (byIds.error) throw new Error(byIds.error.message);
    updated += jobIds.length;
  }

  if (queueRow.campaign_id && queueRow.normalized_company) {
    const byCompany = await supabase
      .from("jobs")
      .update(patch)
      .eq("campaign_id", queueRow.campaign_id)
      .eq("normalized_company", queueRow.normalized_company)
      .or("extracted_email.is.null,email_extraction_status.neq.found");
    if (byCompany.error) throw new Error(byCompany.error.message);
  }

  await incrementPoolContact(supabase, poolRow, Math.max(1, jobIds.length));
  return updated;
}

async function createNotification(supabase: ReturnType<typeof createClient>, queueRow: Row, draftsReady: number) {
  if (!queueRow.user_id) return;
  await supabase.from("user_notifications").insert({
    user_id: queueRow.user_id,
    campaign_id: queueRow.campaign_id || null,
    type: "company_enrichment_completed",
    title: "Applications ready for review",
    message: `Applix found 0 new jobs and prepared ${draftsReady} applications. Please review and approve before sending.`,
    metadata: {
      queue_id: queueRow.id,
      normalized_company: queueRow.normalized_company,
      job_ids: queueRow.job_ids || [],
      drafts_ready: draftsReady,
    },
  });
}

async function generateDrafts(supabase: ReturnType<typeof createClient>, queueRow: Row) {
  if (!queueRow.campaign_id) return 0;
  const result = await invokeFunction("generate-job-outreach-drafts", {
    campaign_id: queueRow.campaign_id,
    user_id: queueRow.user_id || undefined,
    only_approved: true,
    send_immediately: false,
    limit: 5,
  });
  const draftsReady = Number(result.draft_created_count || 0);
  if (draftsReady > 0) await createNotification(supabase, queueRow, draftsReady);
  return draftsReady;
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
  const backoffMinutes = Math.min(240, Math.max(15, attempts * 15));
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

async function claimRows(supabase: ReturnType<typeof createClient>, limit: number, workerId: string) {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("company_enrichment_queue")
    .select("*")
    .eq("status", "pending")
    .lte("available_at", now)
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(limit * 3);

  if (error) throw new Error(error.message);

  const claimed: Row[] = [];
  for (const row of (data || []).filter((item: Row) => Number(item.attempts || 0) < Number(item.max_attempts || 3))) {
    if (claimed.length >= limit) break;
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
  let pool = await findPoolContact(supabase, row.normalized_company);
  if (pool) {
    const updatedJobs = await updateJobsWithPoolContact(supabase, row, pool);
    const draftsReady = await generateDrafts(supabase, row);
    await markCompleted(supabase, row.id);
    return { status: "completed", poolReused: true, emailFound: true, websiteFound: Boolean(pool.company_website_url), updatedJobs, draftsReady };
  }

  const jobId = Array.isArray(row.job_ids) ? row.job_ids.filter(Boolean)[0] : null;
  if (!jobId) {
    await markCompleted(supabase, row.id);
    return { status: "completed", poolReused: false, emailFound: false, websiteFound: false, updatedJobs: 0, draftsReady: 0 };
  }

  const emailFinderCalls = limits.emailFinderCallsRemaining > 0 ? 1 : 0;
  limits.emailFinderCallsRemaining -= emailFinderCalls;

  const enrichResult = await invokeFunction("enrich-job-emails", {
    job_id: jobId,
    campaign_id: row.campaign_id || undefined,
    only_approved: true,
    force_retry: true,
    limit: 1,
    max_company_searches: 1,
    max_email_finder_calls: emailFinderCalls,
  });

  if (Number(enrichResult.provider_missing || 0) > 0) {
    throw new Error("Website search provider missing; retry after WEBSITE_SEARCH_API_URL and WEBSITE_SEARCH_API_KEY are configured.");
  }
  if (Number(enrichResult.failed || 0) > 0) {
    throw new Error("enrich-job-emails failed for queued company.");
  }

  pool = await findPoolContact(supabase, row.normalized_company);
  if (pool) {
    const updatedJobs = await updateJobsWithPoolContact(supabase, row, pool);
    const draftsReady = await generateDrafts(supabase, row);
    await markCompleted(supabase, row.id);
    return { status: "completed", poolReused: false, emailFound: true, websiteFound: Boolean(pool.company_website_url || Number(enrichResult.website_found || 0)), updatedJobs, draftsReady };
  }

  await markCompleted(supabase, row.id);
  return { status: "completed", poolReused: false, emailFound: false, websiteFound: Number(enrichResult.website_found || 0) > 0, updatedJobs: Number(enrichResult.updated_jobs || 0), draftsReady: 0 };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });

  try {
    if (req.method !== "POST") return json({ ok: false, error: "Use POST." }, 405);
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return json({ ok: false, error: "Missing Supabase service role configuration." }, 500);
    if (!isInternalAuthorized(req)) return json({ ok: false, error: "Unauthorized." }, 401);

    const input = await req.json().catch(() => ({}));
    const limit = Math.max(1, Math.min(5, Number(input.limit || 2)));
    const maxEmailFinderCalls = Math.max(0, Math.min(limit, Number(input.max_email_finder_calls ?? limit)));
    const workerId = txt(input.lock_id, `${FUNCTION_NAME}-${crypto.randomUUID()}`);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const rows = await claimRows(supabase, limit, workerId);
    const limits = { emailFinderCallsRemaining: maxEmailFinderCalls };

    const summary = {
      ok: true,
      function: FUNCTION_NAME,
      claimed: rows.length,
      pool_reused: 0,
      website_found: 0,
      email_found: 0,
      completed: 0,
      failed: 0,
      retried: 0,
      drafts_ready: 0,
    };

    for (const row of rows) {
      try {
        const result = await processRow(supabase, row, limits);
        if (result.poolReused) summary.pool_reused += 1;
        if (result.websiteFound) summary.website_found += 1;
        if (result.emailFound) summary.email_found += 1;
        if (result.status === "completed") summary.completed += 1;
        summary.drafts_ready += Number(result.draftsReady || 0);
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
