import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type Row = Record<string, any>;

type EmailResult = {
  email: string | null;
  confidence: number;
  source: string;
  raw: unknown;
  companyWebsite?: string | null;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const EMAIL_FINDER_URL = Deno.env.get("EMAIL_FINDER_URL") || "";
const EMAIL_FINDER_API_KEY = Deno.env.get("EMAIL_FINDER_API_KEY") || "";
const WEBSITE_FINDER_URL = Deno.env.get("WEBSITE_FINDER_URL") || "";
const WEBSITE_FINDER_API_KEY = Deno.env.get("WEBSITE_FINDER_API_KEY") || "";

const BLOCKED_EMAIL_PARTS = [
  "noreply",
  "no-reply",
  "do-not-reply",
  "donotreply",
  "no_reply",
  "example.com",
  "test.com",
  "hostsajan",
  "indeed.com",
  "linkedin.com",
  "seek.com",
  "google.com",
  "facebook.com",
  "instagram.com",
  "youtube.com",
  "twitter.com",
  "x.com",
];

const BLOCKED_WEBSITE_HOSTS = [
  "indeed.",
  "linkedin.",
  "seek.",
  "jora.",
  "adzuna.",
  "facebook.",
  "instagram.",
  "youtube.",
  "twitter.",
  "x.com",
  "google.",
  "bing.",
];

const CONTACT_PATHS = [
  "/",
  "/contact",
  "/contact-us",
  "/contacts",
  "/careers",
  "/career",
  "/jobs",
  "/join-us",
  "/work-with-us",
  "/about",
  "/about-us",
];

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

function normaliseDomain(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  try {
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const host = new URL(withProtocol).hostname.toLowerCase();
    return host.replace(/^www\./, "") || null;
  } catch {
    return raw.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] || null;
  }
}

function isBlockedWebsite(value: unknown) {
  const domain = normaliseDomain(value);
  if (!domain) return true;
  return BLOCKED_WEBSITE_HOSTS.some((part) => domain.includes(part));
}

function withProtocol(value: string) {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function safeUrl(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  try {
    const url = new URL(withProtocol(raw));
    if (isBlockedWebsite(url.hostname)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function collectStrings(value: unknown, depth = 0, out: string[] = []) {
  if (depth > 5 || value === undefined || value === null) return out;
  if (typeof value === "string" || typeof value === "number") {
    const clean = text(value);
    if (clean) out.push(clean);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 50)) collectStrings(item, depth + 1, out);
    return out;
  }
  if (typeof value === "object") {
    for (const item of Object.values(value as Row).slice(0, 80)) collectStrings(item, depth + 1, out);
  }
  return out;
}

function extractEmailsFromText(value: unknown): string[] {
  const body = text(value);
  if (!body) return [];
  const matches = body.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  return [...new Set(matches.map(cleanEmail).filter(Boolean) as string[])];
}

function rawEmailCandidates(payload: unknown): string[] {
  const body = payload as Row;
  const direct = [
    body?.email,
    body?.found_email,
    body?.contact_email,
    body?.company_email,
    body?.data?.email,
    body?.data?.found_email,
    body?.data?.contact_email,
    ...(Array.isArray(body?.emails) ? body.emails : []),
    ...(Array.isArray(body?.data?.emails) ? body.data.emails : []),
    ...(Array.isArray(body?.results) ? body.results.map((item: Row) => item.email || item.value) : []),
  ];

  const strings = collectStrings(payload);
  return [...new Set([
    ...direct.map(cleanEmail).filter(Boolean),
    ...strings.flatMap(extractEmailsFromText),
  ] as string[])];
}

function companyWebsite(job: Row): string | null {
  const raw = job.raw_payload || {};
  const candidates = [
    job.company_website,
    raw.company_website,
    raw.website,
    raw.companyWebsite,
    raw.employer_website,
    raw.companyUrl,
    raw.company_url,
    raw.employerUrl,
    raw.employer_url,
    raw.company?.website,
    raw.company?.url,
    raw.data?.company_website,
    raw.data?.website,
    raw.data?.companyWebsite,
  ];

  for (const candidate of candidates) {
    const url = safeUrl(candidate);
    if (url) return url;
  }

  const strings = collectStrings(raw);
  for (const value of strings) {
    const matches = value.match(/https?:\/\/[^\s"'<>]+/gi) || [];
    for (const match of matches) {
      const url = safeUrl(match);
      if (url) return url;
    }
  }

  return null;
}

function scoreEmail(email: string, website: string | null) {
  const [local, domain] = email.split("@");
  let score = 20;
  if (["careers", "career", "jobs", "job", "recruitment", "recruiting", "talent", "hr", "people"].some((prefix) => local.startsWith(prefix))) score += 60;
  if (["contact", "info", "hello", "admin", "office", "enquiries", "enquiry"].some((prefix) => local.startsWith(prefix))) score += 45;
  if (["support", "service", "sales", "marketing"].some((prefix) => local.startsWith(prefix))) score += 10;
  if (website) {
    const websiteDomain = normaliseDomain(website);
    if (websiteDomain && domain && websiteDomain.endsWith(domain.replace(/^www\./, ""))) score += 30;
  }
  if (["gmail.com", "outlook.com", "hotmail.com", "yahoo.com", "icloud.com"].includes(domain)) score -= 15;
  return score;
}

function bestEmail(candidates: string[], website: string | null) {
  const clean = [...new Set(candidates.map(cleanEmail).filter(Boolean) as string[])];
  return clean
    .map((email) => ({ email, score: scoreEmail(email, website) }))
    .sort((a, b) => b.score - a.score)[0] || null;
}

async function fetchWithTimeout(url: string, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 ApplixBot/1.0 email contact discovery",
        accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
      },
    });
    const body = await response.text().catch(() => "");
    return { ok: response.ok, status: response.status, body };
  } finally {
    clearTimeout(timer);
  }
}

async function scrapeWebsiteForEmail(website: string): Promise<EmailResult> {
  const base = safeUrl(website);
  if (!base) return { email: null, confidence: 0, source: "website_invalid", raw: {}, companyWebsite: null };

  const found: string[] = [];
  const checked: Row[] = [];
  for (const path of CONTACT_PATHS) {
    const url = new URL(path, base).toString();
    try {
      const result = await fetchWithTimeout(url);
      checked.push({ url, status: result.status, ok: result.ok });
      if (!result.ok) continue;
      found.push(...extractEmailsFromText(result.body));
      if (found.length >= 5) break;
    } catch (error) {
      checked.push({ url, error: error instanceof Error ? error.message : String(error) });
    }
  }

  const best = bestEmail(found, base);
  if (!best) return { email: null, confidence: 0, source: "website_scrape_not_found", raw: { checked }, companyWebsite: base };
  return {
    email: best.email,
    confidence: Math.min(95, Math.max(50, best.score)),
    source: "website_contact_page_scrape",
    raw: { checked, candidates: [...new Set(found)] },
    companyWebsite: base,
  };
}

async function callWebsiteFinder(job: Row): Promise<string | null> {
  if (!WEBSITE_FINDER_URL || !WEBSITE_FINDER_API_KEY) return null;
  const response = await fetch(WEBSITE_FINDER_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${WEBSITE_FINDER_API_KEY}`,
      "x-api-key": WEBSITE_FINDER_API_KEY,
    },
    body: JSON.stringify({ company_name: job.company, location: job.location, job_url: job.apply_url, raw_payload: job.raw_payload || {} }),
  });
  const textBody = await response.text().catch(() => "");
  let payload: unknown = textBody;
  try { payload = textBody ? JSON.parse(textBody) : {}; } catch { payload = { raw: textBody }; }
  if (!response.ok) return null;

  const body = payload as Row;
  const candidates = [
    body.website,
    body.company_website,
    body.url,
    body.data?.website,
    body.data?.company_website,
    ...(Array.isArray(body.results) ? body.results.map((item: Row) => item.website || item.url || item.company_website) : []),
  ];
  for (const candidate of candidates) {
    const url = safeUrl(candidate);
    if (url) return url;
  }
  return null;
}

async function callEmailFinder(job: Row): Promise<EmailResult> {
  if (!EMAIL_FINDER_URL || !EMAIL_FINDER_API_KEY) {
    return { email: null, confidence: 0, source: "email_finder_not_configured", raw: { error: "EMAIL_FINDER_URL or EMAIL_FINDER_API_KEY is missing" } };
  }

  const response = await fetch(EMAIL_FINDER_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${EMAIL_FINDER_API_KEY}`,
      "x-api-key": EMAIL_FINDER_API_KEY,
    },
    body: JSON.stringify({ company_name: job.company, company_website: companyWebsite(job), job_title: job.title, job_url: job.apply_url, raw_payload: job.raw_payload || {} }),
  });

  const textBody = await response.text().catch(() => "");
  let payload: unknown = textBody;
  try { payload = textBody ? JSON.parse(textBody) : {}; } catch { payload = { raw: textBody }; }
  if (!response.ok) throw new Error(`Email finder failed ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`);
  const website = companyWebsite(job);
  const candidate = bestEmail(rawEmailCandidates(payload), website);
  return { email: candidate?.email || null, confidence: candidate?.score || 0, source: "email_finder_api", raw: payload, companyWebsite: website };
}

async function findReusableEmail(supabase: ReturnType<typeof createClient>, job: Row) {
  const company = normaliseCompany(job.company);
  const domain = normaliseDomain(companyWebsite(job));

  if (company) {
    const byCompany = await supabase
      .from("lead_contact_emails")
      .select("id,email,reuse_count")
      .eq("status", "active")
      .ilike("company_name", job.company)
      .order("last_used_at", { ascending: false, nullsFirst: false })
      .limit(10);
    if (byCompany.error) throw new Error(byCompany.error.message);
    const match = (byCompany.data || []).map((row: Row) => ({ ...row, email: cleanEmail(row.email) })).find((row: Row) => row.email);
    if (match) return match;
  }

  if (domain) {
    const byDomain = await supabase
      .from("lead_contact_emails")
      .select("id,email,reuse_count")
      .eq("status", "active")
      .ilike("company_website", `%${domain}%`)
      .order("last_used_at", { ascending: false, nullsFirst: false })
      .limit(10);
    if (byDomain.error) throw new Error(byDomain.error.message);
    const match = (byDomain.data || []).map((row: Row) => ({ ...row, email: cleanEmail(row.email) })).find((row: Row) => row.email);
    if (match) return match;
  }
  return null;
}

async function saveReusableEmail(supabase: ReturnType<typeof createClient>, job: Row, email: string, result: EmailResult) {
  const now = new Date().toISOString();
  const payload = {
    user_identifier: text(job.user_identifier) || text(job.user_id) || "system",
    campaign_id: job.campaign_id || null,
    job_id: job.id,
    company_name: job.company,
    company_website: result.companyWebsite || companyWebsite(job),
    email,
    email_type: "job_contact",
    source: result.source,
    confidence: result.confidence,
    status: "active",
    raw_source: { job_id: job.id, job_url: job.apply_url, source: result.source, provider_result: result.raw },
    last_used_at: now,
    updated_at: now,
  };

  const existing = await supabase.from("lead_contact_emails").select("id,reuse_count").eq("user_identifier", payload.user_identifier).eq("email", payload.email).limit(1);
  if (existing.error) throw new Error(existing.error.message);
  const existingRow = (existing.data || [])[0];
  if (existingRow) {
    const update = await supabase.from("lead_contact_emails").update({
      campaign_id: payload.campaign_id,
      job_id: payload.job_id,
      company_name: payload.company_name,
      company_website: payload.company_website,
      email_type: payload.email_type,
      source: payload.source,
      confidence: payload.confidence,
      status: payload.status,
      raw_source: payload.raw_source,
      reuse_count: Number(existingRow.reuse_count || 0) + 1,
      last_used_at: now,
      updated_at: now,
    }).eq("id", existingRow.id).select("id").single();
    if (update.error) throw new Error(update.error.message);
    return update.data.id as string;
  }

  const insert = await supabase.from("lead_contact_emails").insert(payload).select("id").single();
  if (insert.error) throw new Error(insert.error.message);
  return insert.data.id as string;
}

async function updateJob(supabase: ReturnType<typeof createClient>, jobId: string, patch: Row) {
  const result = await supabase.from("jobs").update({ ...patch, email_extraction_attempted_at: new Date().toISOString() }).eq("id", jobId);
  if (result.error) throw new Error(result.error.message);
}

async function enrichOneJob(supabase: ReturnType<typeof createClient>, job: Row, attemptCount: number): Promise<"reused" | "found" | "not_found" | "skipped"> {
  const reusable = await findReusableEmail(supabase, job);
  if (reusable?.email) {
    await updateJob(supabase, job.id, {
      extracted_email: reusable.email,
      email_contact_id: reusable.id,
      apply_method: "email",
      email_extraction_status: "found",
      email_extraction_source: "reused_lead_contact_emails",
      email_extraction_confidence: 80,
      email_extraction_error: null,
      email_extraction_attempt_count: attemptCount + 1,
    });
    await supabase.from("lead_contact_emails").update({ reuse_count: Number(reusable.reuse_count || 0) + 1, last_used_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", reusable.id);
    return "reused";
  }

  const rawEmail = bestEmail(rawEmailCandidates(job.raw_payload || {}), companyWebsite(job));
  if (rawEmail?.email) {
    const result: EmailResult = { email: rawEmail.email, confidence: rawEmail.score, source: "job_raw_payload_email", raw: { candidates: rawEmailCandidates(job.raw_payload || {}) }, companyWebsite: companyWebsite(job) };
    const contactId = await saveReusableEmail(supabase, job, rawEmail.email, result);
    await updateJob(supabase, job.id, {
      extracted_email: rawEmail.email,
      email_contact_id: contactId,
      apply_method: "email",
      email_extraction_status: "found",
      email_extraction_source: result.source,
      email_extraction_confidence: result.confidence,
      email_extraction_error: null,
      email_extraction_attempt_count: attemptCount + 1,
    });
    return "found";
  }

  let website = companyWebsite(job) || await callWebsiteFinder(job);
  if (website) {
    const scrapeResult = await scrapeWebsiteForEmail(website);
    if (scrapeResult.email) {
      const contactId = await saveReusableEmail(supabase, job, scrapeResult.email, scrapeResult);
      await updateJob(supabase, job.id, {
        extracted_email: scrapeResult.email,
        email_contact_id: contactId,
        apply_method: "email",
        email_extraction_status: "found",
        email_extraction_source: scrapeResult.source,
        email_extraction_confidence: scrapeResult.confidence,
        email_extraction_error: null,
        email_extraction_attempt_count: attemptCount + 1,
      });
      return "found";
    }
  }

  if (EMAIL_FINDER_URL && EMAIL_FINDER_API_KEY) {
    const result = await callEmailFinder({ ...job, company_website: website || companyWebsite(job) });
    const email = cleanEmail(result.email);
    if (email) {
      const contactId = await saveReusableEmail(supabase, job, email, result);
      await updateJob(supabase, job.id, {
        extracted_email: email,
        email_contact_id: contactId,
        apply_method: "email",
        email_extraction_status: "found",
        email_extraction_source: result.source,
        email_extraction_confidence: result.confidence,
        email_extraction_error: null,
        email_extraction_attempt_count: attemptCount + 1,
      });
      return "found";
    }
  }

  await updateJob(supabase, job.id, {
    apply_method: "url",
    email_extraction_status: "not_found",
    email_extraction_source: website ? "website_scrape_not_found" : "company_website_not_found",
    email_extraction_confidence: 0,
    email_extraction_error: null,
    email_extraction_attempt_count: attemptCount + 1,
  });
  return "not_found";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "POST") return json({ ok: false, error: "Use POST" }, 405);
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return json({ ok: false, error: "Missing Supabase service role configuration" }, 500);

    const input = await req.json().catch(() => ({}));
    const limit = Math.max(1, Math.min(25, Number(input.limit || 10)));
    const campaignId = text(input.campaign_id);
    const userId = text(input.user_id);
    const forceRetry = input.force_retry === true;
    const maxAttempts = Math.max(1, Math.min(5, Number(input.max_attempts || 3)));

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    let query = supabase
      .from("jobs")
      .select("*")
      .is("extracted_email", null)
      .not("company", "is", null)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (!forceRetry) {
      query = query.or("email_extraction_status.is.null,email_extraction_status.in.(not_started,failed,not_found)").lt("email_extraction_attempt_count", maxAttempts);
    }
    if (campaignId) query = query.eq("campaign_id", campaignId);
    if (userId) query = query.eq("user_id", userId);

    const { data: jobs, error } = await query;
    if (error) throw new Error(error.message);

    let reusedCount = 0;
    let apiCalledCount = 0;
    let websiteScrapeCalledCount = 0;
    let foundCount = 0;
    let notFoundCount = 0;
    let skippedCount = 0;

    for (const job of jobs || []) {
      const attemptCount = Number(job.email_extraction_attempt_count || 0);
      if (cleanEmail(job.extracted_email) || !text(job.company)) {
        skippedCount += 1;
        continue;
      }

      try {
        if (companyWebsite(job)) websiteScrapeCalledCount += 1;
        if (EMAIL_FINDER_URL && EMAIL_FINDER_API_KEY) apiCalledCount += 1;
        const status = await enrichOneJob(supabase, job, forceRetry ? 0 : attemptCount);
        if (status === "reused") {
          reusedCount += 1;
          foundCount += 1;
        } else if (status === "found") {
          foundCount += 1;
        } else if (status === "not_found") {
          notFoundCount += 1;
        } else {
          skippedCount += 1;
        }
      } catch (error) {
        await updateJob(supabase, job.id, {
          apply_method: "url",
          email_extraction_status: "failed",
          email_extraction_error: error instanceof Error ? error.message : String(error),
          email_extraction_attempt_count: attemptCount + 1,
        });
        skippedCount += 1;
      }
    }

    return json({
      ok: true,
      function: "enrich-job-emails",
      limit,
      selected_count: jobs?.length || 0,
      reused_count: reusedCount,
      website_scrape_called_count: websiteScrapeCalledCount,
      api_called_count: apiCalledCount,
      found_count: foundCount,
      not_found_count: notFoundCount,
      skipped_count: skippedCount,
    });
  } catch (error) {
    return json({ ok: false, function: "enrich-job-emails", error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
