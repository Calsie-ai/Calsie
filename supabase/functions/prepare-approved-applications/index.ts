import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type Row = Record<string, any>;

type CompanyGroup = {
  key: string;
  companyName: string;
  location: string | null;
  jobs: Row[];
};

const FUNCTION_NAME = "prepare-approved-applications";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BLOCKED_EMAIL_PARTS = ["sentry.io", "ingest", ".ingest.", "zendesk", "noreply", "no-reply", "do-not-reply", "donotreply", "privacy@", "accounts@", "billing@", "example@", "test@", "support@indeed"];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

function text(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const clean = String(value).trim();
  return clean ? clean : null;
}

function readBearerToken(req: Request) {
  const authorization = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function cleanEmail(value: unknown): string | null {
  let email = text(value)?.toLowerCase() || null;
  if (!email) return null;
  email = email.replace(/^mailto:/i, "").split("?")[0].trim();
  email = email.replace(/[),.;:'"\]>]+$/g, "").replace(/^[([<'"]+/g, "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  if (BLOCKED_EMAIL_PARTS.some((part) => email.includes(part))) return null;
  return email;
}

function normaliseCompany(value: unknown): string | null {
  return text(value)?.toLowerCase().replace(/\s+/g, " ") || null;
}

function companyNameFromJob(job: Row): string | null {
  const raw = job.raw_payload || {};
  return text(job.company)
    || text(job.normalized_company)
    || text(raw.company)
    || text(raw.company_name)
    || text(raw.employer)
    || text(raw.organization)
    || text(raw.hiringOrganization?.name)
    || text(raw.companyInfo?.name)
    || text(raw.data?.company)
    || text(raw.data?.company_name);
}

function companyKey(job: Row): string | null {
  return normaliseCompany(job.normalized_company) || normaliseCompany(job.company) || normaliseCompany(companyNameFromJob(job));
}

function normaliseDomain(value: unknown): string | null {
  const raw = text(value);
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

function isApprovedJob(job: Row) {
  return text(job.status)?.toLowerCase() === "approved" || text(job.user_decision)?.toLowerCase() === "approved";
}

function isEmailReady(job: Row) {
  return Boolean(cleanEmail(job.extracted_email)) && text(job.email_extraction_status)?.toLowerCase() === "found";
}

function buildCompanyGroups(jobs: Row[]): CompanyGroup[] {
  const groups = new Map<string, CompanyGroup>();
  for (const job of jobs) {
    const key = companyKey(job);
    const companyName = companyNameFromJob(job);
    if (!key || !companyName) continue;
    const existing = groups.get(key);
    if (existing) {
      existing.jobs.push(job);
      if (!existing.location && text(job.location)) existing.location = text(job.location);
      continue;
    }
    groups.set(key, { key, companyName, location: text(job.location), jobs: [job] });
  }
  return [...groups.values()];
}

function isReusablePoolRow(row: Row) {
  const email = cleanEmail(row.email);
  if (!email) return false;
  if (text(row.status)?.toLowerCase() !== "active") return false;
  if (Number(row.confidence || 0) < 70) return false;
  if (row.company_website_url && !emailDomainMatchesWebsite(email, row.company_website_url) && Number(row.confidence || 0) < 90) return false;
  return true;
}

async function findPoolContact(supabase: ReturnType<typeof createClient>, group: CompanyGroup) {
  const { data, error } = await supabase
    .from("company_contacts_pool")
    .select("*")
    .eq("status", "active")
    .eq("normalized_company", group.key)
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

async function updateJobsWithPoolContact(supabase: ReturnType<typeof createClient>, group: CompanyGroup, poolRow: Row) {
  const email = cleanEmail(poolRow.email);
  if (!email) return 0;

  const jobIds = group.jobs.map((job) => job.id).filter(Boolean);
  if (!jobIds.length) return 0;

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
      email_extraction_attempted_at: new Date().toISOString(),
    })
    .in("id", jobIds);

  if (error) throw new Error(error.message);
  await incrementPoolContact(supabase, poolRow, jobIds.length);
  return jobIds.length;
}

async function mergeQueueRow(supabase: ReturnType<typeof createClient>, group: CompanyGroup, userId: string, campaignId: string) {
  const jobIds = group.jobs.map((job) => job.id).filter(Boolean);
  const existing = await supabase
    .from("company_enrichment_queue")
    .select("id,job_ids,status")
    .eq("normalized_company", group.key)
    .in("status", ["pending", "processing"])
    .order("created_at", { ascending: true })
    .limit(1);

  if (existing.error) throw new Error(existing.error.message);
  const existingRow = (existing.data || [])[0];

  if (existingRow) {
    const mergedJobIds = [...new Set([...(existingRow.job_ids || []), ...jobIds])];
    const update = await supabase
      .from("company_enrichment_queue")
      .update({
        user_id: userId,
        campaign_id: campaignId,
        company_name: group.companyName,
        location: group.location,
        job_ids: mergedJobIds,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingRow.id);
    if (update.error) throw new Error(update.error.message);
    return existingRow.id as string;
  }

  const insert = await supabase
    .from("company_enrichment_queue")
    .insert({
      user_id: userId,
      campaign_id: campaignId,
      normalized_company: group.key,
      company_name: group.companyName,
      location: group.location,
      job_ids: jobIds,
      status: "pending",
      priority: 100,
      max_attempts: 3,
    })
    .select("id")
    .single();

  if (insert.error) {
    if (insert.error.code === "23505") {
      return mergeQueueRow(supabase, group, userId, campaignId);
    }
    throw new Error(insert.error.message);
  }

  return insert.data.id as string;
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
  if (!response.ok || body?.ok === false) throw new Error(`${name} failed: ${text(body?.error || response.statusText) || "Unknown function error"}`);
  return body as Row;
}

async function createNotification(supabase: ReturnType<typeof createClient>, userId: string, campaignId: string, queuedCompanies: number, draftsReady: number) {
  if (queuedCompanies === 0 && draftsReady === 0) return;
  await supabase.from("user_notifications").insert({
    user_id: userId,
    campaign_id: campaignId,
    type: "approved_applications_preparing",
    title: queuedCompanies > 0 ? "Applications are being prepared" : "Applications ready for review",
    message: queuedCompanies > 0
      ? `Applix is preparing ${queuedCompanies} company contacts. Drafts will appear as soon as emails are found.`
      : `Applix found 0 new jobs and prepared ${draftsReady} applications. Please review and approve before sending.`,
    metadata: { queued_companies: queuedCompanies, drafts_ready: draftsReady },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "POST") return json({ ok: false, function: FUNCTION_NAME, error: "Use POST" }, 405);
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return json({ ok: false, function: FUNCTION_NAME, error: "Missing Supabase service role configuration" }, 500);

    const token = readBearerToken(req);
    if (!token) return json({ ok: false, function: FUNCTION_NAME, error: "Missing bearer token" }, 401);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData.user) return json({ ok: false, function: FUNCTION_NAME, error: "Invalid login session" }, 401);

    const input = await req.json().catch(() => ({}));
    const campaignId = text(input.campaign_id);
    const limit = Math.max(1, Math.min(25, Number(input.limit || 25)));
    if (!campaignId) return json({ ok: false, function: FUNCTION_NAME, error: "campaign_id is required" }, 400);

    const campaign = await supabase
      .from("campaigns")
      .select("id,user_id")
      .eq("id", campaignId)
      .eq("user_id", authData.user.id)
      .maybeSingle();
    if (campaign.error) throw new Error(campaign.error.message);
    if (!campaign.data) return json({ ok: false, function: FUNCTION_NAME, error: "Campaign not found" }, 404);

    const jobsResult = await supabase
      .from("jobs")
      .select("*")
      .eq("campaign_id", campaignId)
      .eq("user_id", authData.user.id)
      .or("status.eq.approved,user_decision.eq.approved")
      .order("created_at", { ascending: true })
      .limit(limit);
    if (jobsResult.error) throw new Error(jobsResult.error.message);

    const approvedJobs = (jobsResult.data || []).filter(isApprovedJob);
    const alreadyReady = approvedJobs.filter(isEmailReady).length;
    const missingEmailJobs = approvedJobs.filter((job: Row) => !isEmailReady(job));
    const groups = buildCompanyGroups(missingEmailJobs);

    let poolHits = 0;
    let queuedCompanies = 0;
    let updatedFromPool = 0;

    for (const group of groups) {
      const pool = await findPoolContact(supabase, group);
      if (pool) {
        poolHits += 1;
        updatedFromPool += await updateJobsWithPoolContact(supabase, group, pool);
        continue;
      }

      await mergeQueueRow(supabase, group, authData.user.id, campaignId);
      queuedCompanies += 1;
    }

    let draftsCreated = 0;
    if (alreadyReady > 0 || updatedFromPool > 0) {
      const draftResult = await invokeFunction("generate-job-outreach-drafts", {
        campaign_id: campaignId,
        user_id: authData.user.id,
        only_approved: true,
        send_immediately: false,
        limit: Math.min(24, limit),
      });
      draftsCreated = Number(draftResult.draft_created_count || 0);
    }

    await createNotification(supabase, authData.user.id, campaignId, queuedCompanies, draftsCreated);

    return json({
      ok: true,
      function: FUNCTION_NAME,
      approved_jobs_seen: approvedJobs.length,
      companies_seen: groups.length,
      pool_hits: poolHits,
      queued_companies: queuedCompanies,
      already_ready: alreadyReady,
      jobs_updated_from_pool: updatedFromPool,
      drafts_created: draftsCreated,
      next_step: queuedCompanies > 0
        ? "Company enrichment queue is processing. Drafts will be prepared after emails are found."
        : "Approved applications with known emails are ready as drafts. Final send still requires approved queued outreach.",
    });
  } catch (error) {
    return json({ ok: false, function: FUNCTION_NAME, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
