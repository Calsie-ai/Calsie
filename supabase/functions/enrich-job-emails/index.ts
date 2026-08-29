import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type Row = Record<string, any>;

type CompanyGroup = {
  key: string;
  companyName: string;
  location: string | null;
  jobs: Row[];
};

type WebsiteDiscoveryResult = {
  status: "found" | "not_found" | "low_confidence" | "failed" | "provider_missing";
  website: string | null;
  confidence: number;
  source: string;
  attempted: boolean;
  error: string | null;
  raw?: unknown;
};

type EmailResult = {
  email: string | null;
  confidence: number;
  source: string;
  raw?: unknown;
  companyWebsite: string | null;
  companyDomain: string | null;
};

const FUNCTION_NAME = "enrich-job-emails";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("APPLIX_SERVICE_ROLE_KEY") || "";
const WEBSITE_SEARCH_API_URL = Deno.env.get("WEBSITE_SEARCH_API_URL") || "";
const WEBSITE_SEARCH_API_KEY = Deno.env.get("WEBSITE_SEARCH_API_KEY") || "";
const EMAIL_FINDER_URL = Deno.env.get("EMAIL_FINDER_URL") || "";
const EMAIL_FINDER_API_KEY = Deno.env.get("EMAIL_FINDER_API_KEY") || "";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
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

const BLOCKED_WEBSITE_DOMAINS = [
  "indeed.com",
  "au.indeed.com",
  "seek.com.au",
  "seek.com",
  "linkedin.com",
  "facebook.com",
  "instagram.com",
  "youtube.com",
  "jora.com",
  "jora.com.au",
  "adzuna.com.au",
  "adzuna.com",
  "google.com",
  "bing.com",
  "jobadder.com",
  "smartrecruiters.com",
  "dayforcehcm.com",
  "greenhouse.io",
  "grnh.se",
  "workable.com",
  "lever.co",
  "ashbyhq.com",
  "ats.rippling.com",
  "jobs.employmenthero.com",
  "bamboohr.com",
  "jobvite.com",
  "teamtailor.com",
  "myworkdayjobs.com",
  "workdayjobs.com",
  "icims.com",
  "oraclecloud.com",
  "successfactors.com",
];

const COMPANY_STOP_WORDS = new Set([
  "pty",
  "ltd",
  "limited",
  "inc",
  "company",
  "co",
  "group",
  "services",
  "service",
  "australia",
  "australian",
]);

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

function lower(value: unknown): string {
  return text(value)?.toLowerCase() || "";
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
    return new URL(withProtocol).hostname.toLowerCase().replace(/^www\./, "") || null;
  } catch {
    return raw.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] || null;
  }
}

function emailDomain(email: string | null): string | null {
  return email?.split("@")[1]?.toLowerCase() || null;
}

function safeUrl(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  try {
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const url = new URL(withProtocol);
    url.hash = "";
    const domain = url.hostname.toLowerCase().replace(/^www\./, "");
    if (!domain || isBlockedWebsiteDomain(domain, raw)) return null;
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function isBlockedWebsiteDomain(domain: string | null, raw = "") {
  if (!domain) return true;
  const clean = domain.toLowerCase().replace(/^www\./, "");
  const rawLower = raw.toLowerCase();
  return BLOCKED_WEBSITE_DOMAINS.some((blocked) => {
    if (clean === blocked || clean.endsWith(`.${blocked}`)) return true;
    return rawLower.includes(`://${blocked}/`) || rawLower.includes(`.${blocked}/`);
  });
}

function emailDomainMatchesWebsite(email: string | null, website: string | null) {
  const domain = emailDomain(email);
  const websiteDomain = normaliseDomain(website);
  if (!domain || !websiteDomain) return false;
  return domain === websiteDomain || domain.endsWith(`.${websiteDomain}`) || websiteDomain.endsWith(`.${domain}`);
}

function collectStrings(value: unknown, depth = 0, out: string[] = []) {
  if (depth > 5 || value === undefined || value === null) return out;
  if (typeof value === "string" || typeof value === "number") {
    const clean = text(value);
    if (clean) out.push(clean);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 80)) collectStrings(item, depth + 1, out);
    return out;
  }
  if (typeof value === "object") {
    for (const item of Object.values(value as Row).slice(0, 120)) collectStrings(item, depth + 1, out);
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
  return [...new Set(collectStrings(payload).flatMap(extractEmailsFromText))];
}

function parseJson(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
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

function companyWebsite(job: Row): string | null {
  const raw = job.raw_payload || {};
  const candidates = [
    job.company_website_url,
    job.company_website,
    raw.company_website,
    raw.website,
    raw.domain,
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
    raw.data?.domain,
    raw.data?.companyWebsite,
  ];

  for (const candidate of candidates) {
    const url = safeUrl(candidate);
    if (url) return url;
  }
  return null;
}

function companyTokens(company: string) {
  return company
    .toLowerCase()
    .replace(/[^a-z0-9& ]+/g, " ")
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 3 && !COMPANY_STOP_WORDS.has(part));
}

function compact(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function domainLooksLikeCompany(domain: string | null, company: string) {
  if (!domain) return false;
  const host = domain.split(".")[0] || domain;
  const compactHost = compact(host);
  const tokens = companyTokens(company);
  if (!tokens.length) return false;
  const hits = tokens.filter((token) => compactHost.includes(compact(token))).length;
  if (hits >= Math.min(2, tokens.length)) return true;
  const compactCompany = compact(tokens.join(""));
  return compactCompany.length >= 5 && (compactHost.includes(compactCompany) || compactCompany.includes(compactHost));
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

function representativeJob(group: CompanyGroup) {
  return { ...group.jobs[0], company: group.companyName };
}

function knownWebsiteForGroup(group: CompanyGroup) {
  for (const job of group.jobs) {
    const website = companyWebsite(job);
    if (website) return website;
  }
  return null;
}

function scoreEmail(email: string, website: string | null) {
  const [local, domain] = email.split("@");
  let score = 20;
  if (["recruitment", "careers", "career", "hr", "jobs", "job", "people"].some((prefix) => local.startsWith(prefix))) score += 70;
  if (["admin", "info", "contact", "hello", "office", "enquiries", "enquiry"].some((prefix) => local.startsWith(prefix))) score += 45;
  if (website) {
    if (emailDomainMatchesWebsite(email, website)) score += 35;
    else score -= 40;
  }
  if (["gmail.com", "outlook.com", "hotmail.com", "yahoo.com", "icloud.com"].includes(domain)) score -= 15;
  return Math.max(0, Math.min(100, score));
}

function bestEmail(candidates: string[], website: string | null) {
  const clean = [...new Set(candidates.map(cleanEmail).filter(Boolean) as string[])];
  return clean
    .map((email) => ({ email, score: scoreEmail(email, website) }))
    .filter((candidate) => !website || emailDomainMatchesWebsite(candidate.email, website) || candidate.score >= 90)
    .sort((a, b) => b.score - a.score)[0] || null;
}

function isApprovedJob(job: Row) {
  return text(job.status)?.toLowerCase() === "approved" || text(job.user_decision)?.toLowerCase() === "approved";
}

function canRetry(job: Row, maxAttempts: number) {
  const status = text(job.email_extraction_status)?.toLowerCase();
  if (status === "found") return false;
  if (status === "provider_missing") return true;
  return Number(job.email_extraction_attempt_count || 0) < maxAttempts;
}

function isReusablePoolRow(row: Row, website: string | null) {
  const email = cleanEmail(row.email);
  if (!email) return false;
  if (Number(row.confidence || 0) < 70) return false;
  if (text(row.status)?.toLowerCase() !== "active") return false;
  if (website && !emailDomainMatchesWebsite(email, website) && Number(row.confidence || 0) < 90) return false;
  return true;
}

async function findPoolContact(supabase: ReturnType<typeof createClient>, group: CompanyGroup) {
  const website = knownWebsiteForGroup(group);
  const domain = normaliseDomain(website);
  const rows: Row[] = [];

  if (domain) {
    const byDomain = await supabase
      .from("company_contacts_pool")
      .select("*")
      .eq("status", "active")
      .eq("company_domain", domain)
      .gte("confidence", 70)
      .order("confidence", { ascending: false })
      .limit(10);
    if (byDomain.error) throw new Error(byDomain.error.message);
    rows.push(...(byDomain.data || []));
  }

  const byCompany = await supabase
    .from("company_contacts_pool")
    .select("*")
    .eq("status", "active")
    .eq("normalized_company", group.key)
    .gte("confidence", 70)
    .order("confidence", { ascending: false })
    .limit(10);
  if (byCompany.error) throw new Error(byCompany.error.message);
  rows.push(...(byCompany.data || []));

  return [...new Map(rows.map((row) => [row.id, row])).values()]
    .map((row) => ({ ...row, email: cleanEmail(row.email), company_website_url: safeUrl(row.company_website_url), company_domain: normaliseDomain(row.company_domain || row.company_website_url) }))
    .filter((row) => isReusablePoolRow(row, row.company_website_url || website))
    .sort((a, b) => {
      const aSameDomain = emailDomainMatchesWebsite(a.email, a.company_website_url || website) ? 1 : 0;
      const bSameDomain = emailDomainMatchesWebsite(b.email, b.company_website_url || website) ? 1 : 0;
      return bSameDomain - aSameDomain || Number(b.confidence || 0) - Number(a.confidence || 0);
    })[0] || null;
}

async function incrementPoolContact(supabase: ReturnType<typeof createClient>, row: Row, count: number) {
  if (!row?.id) return;
  const now = new Date().toISOString();
  const update = await supabase
    .from("company_contacts_pool")
    .update({ use_count: Number(row.use_count || 0) + count, last_used_at: now, updated_at: now })
    .eq("id", row.id);
  if (update.error) throw new Error(update.error.message);
}

async function discoverCompanyWebsite(companyName: string, location: string | null): Promise<WebsiteDiscoveryResult> {
  if (!WEBSITE_SEARCH_API_URL || !WEBSITE_SEARCH_API_KEY) {
    return { status: "provider_missing", website: null, confidence: 0, source: "search_api", attempted: false, error: "WEBSITE_SEARCH_API_URL or WEBSITE_SEARCH_API_KEY is missing" };
  }

  const query = [companyName, location, "official website"].filter(Boolean).join(" ");
  const headers: Record<string, string> = {
    "content-type": "application/json",
    authorization: `Bearer ${WEBSITE_SEARCH_API_KEY}`,
    "X-API-KEY": WEBSITE_SEARCH_API_KEY,
  };

  let requestUrl = WEBSITE_SEARCH_API_URL;
  let init: RequestInit = {
    method: "POST",
    headers,
    body: JSON.stringify({ query, q: query, company_name: companyName, location }),
  };

  if (requestUrl.includes("{query}") || requestUrl.includes("{q}") || requestUrl.includes("{api_key}")) {
    requestUrl = requestUrl
      .replaceAll("{query}", encodeURIComponent(query))
      .replaceAll("{q}", encodeURIComponent(query))
      .replaceAll("{api_key}", encodeURIComponent(WEBSITE_SEARCH_API_KEY));
    init = { method: "GET", headers };
  }

  try {
    const response = await fetch(requestUrl, init);
    const textBody = await response.text().catch(() => "");
    const payload = parseJson(textBody);
    if (!response.ok) throw new Error(`Website search failed ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`);

    const strings = collectStrings(payload);
    const urls = strings.flatMap((value) => value.match(/https?:\/\/[^\s"'<>]+/gi) || []);
    const domains = strings.filter((value) => /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(value));
    const candidates = [...urls, ...domains].map(safeUrl).filter(Boolean) as string[];

    for (const candidate of [...new Set(candidates)]) {
      const domain = normaliseDomain(candidate);
      if (domain && domainLooksLikeCompany(domain, companyName)) {
        return { status: "found", website: candidate, confidence: 85, source: "search_api", attempted: true, error: null, raw: payload };
      }
    }

    const first = candidates[0] || null;
    return first
      ? { status: "low_confidence", website: null, confidence: 40, source: "search_api", attempted: true, error: null, raw: payload }
      : { status: "not_found", website: null, confidence: 0, source: "search_api", attempted: true, error: null, raw: payload };
  } catch (error) {
    return { status: "failed", website: null, confidence: 0, source: "search_api", attempted: true, error: error instanceof Error ? error.message : String(error) };
  }
}

async function callEmailFinder(job: Row, website: string | null): Promise<EmailResult> {
  if (!EMAIL_FINDER_URL || !EMAIL_FINDER_API_KEY) {
    return { email: null, confidence: 0, source: "email_finder_not_configured", raw: { error: "EMAIL_FINDER_URL or EMAIL_FINDER_API_KEY is missing" }, companyWebsite: website, companyDomain: normaliseDomain(website) };
  }

  const query = normaliseDomain(website) || website || companyNameFromJob(job) || "";
  if (!query) return { email: null, confidence: 0, source: "email_finder_no_query", raw: {}, companyWebsite: website, companyDomain: normaliseDomain(website) };

  const headers: Record<string, string> = {
    "content-type": "application/json",
    authorization: `Bearer ${EMAIL_FINDER_API_KEY}`,
    "X-API-KEY": EMAIL_FINDER_API_KEY,
  };

  let requestUrl = EMAIL_FINDER_URL;
  let init: RequestInit = {
    method: "POST",
    headers,
    body: JSON.stringify({ query, company_name: companyNameFromJob(job), company_website: website, job_title: job.title, job_url: job.apply_url, raw_payload: job.raw_payload || {} }),
  };

  if (requestUrl.includes("{query}") || requestUrl.includes("{q}") || requestUrl.includes("{api_key}")) {
    requestUrl = requestUrl
      .replaceAll("{query}", encodeURIComponent(query))
      .replaceAll("{q}", encodeURIComponent(query))
      .replaceAll("{api_key}", encodeURIComponent(EMAIL_FINDER_API_KEY));
    init = { method: "GET", headers };
  }

  const response = await fetch(requestUrl, init);
  const textBody = await response.text().catch(() => "");
  const payload = parseJson(textBody);
  if (!response.ok) throw new Error(`Email finder failed ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`);
  const officialWebsite = safeUrl(website);
  const candidate = bestEmail(rawEmailCandidates(payload), officialWebsite);
  return { email: candidate?.email || null, confidence: candidate?.score || 0, source: "email_finder_api", raw: payload, companyWebsite: officialWebsite, companyDomain: normaliseDomain(officialWebsite) };
}

async function saveCompanyContactPool(supabase: ReturnType<typeof createClient>, group: CompanyGroup, email: string, result: EmailResult) {
  const clean = cleanEmail(email);
  if (!clean) return null;

  const website = safeUrl(result.companyWebsite);
  if (website && !emailDomainMatchesWebsite(clean, website) && Number(result.confidence || 0) < 90) return null;
  if (Number(result.confidence || 0) < 70) return null;

  const domain = normaliseDomain(result.companyDomain || website || emailDomain(clean));
  const now = new Date().toISOString();
  const job = representativeJob(group);
  const payload = {
    company_name: group.companyName,
    normalized_company: group.key,
    company_domain: domain,
    company_website_url: website,
    email: clean,
    email_type: "job_contact",
    source: result.source,
    confidence: Math.max(0, Math.min(100, Math.round(Number(result.confidence || 0)))),
    status: "active",
    quality_status: Number(result.confidence || 0) >= 70 ? "verified" : "unverified",
    last_verified_at: Number(result.confidence || 0) >= 70 ? now : null,
    last_used_at: now,
    use_count: group.jobs.length,
    first_job_id: job.id || null,
    first_campaign_id: job.campaign_id || null,
    raw_source: { company_key: group.key, job_ids: group.jobs.map((item) => item.id), source: result.source, provider_result: result.raw },
    updated_at: now,
  };

  const existing = await supabase
    .from("company_contacts_pool")
    .select("id,use_count,confidence")
    .eq("normalized_company", group.key)
    .eq("email", clean)
    .limit(1);
  if (existing.error) throw new Error(existing.error.message);

  const existingRow = (existing.data || [])[0];
  if (existingRow) {
    const update = await supabase.from("company_contacts_pool").update({
      ...payload,
      confidence: Math.max(Number(existingRow.confidence || 0), payload.confidence),
      use_count: Number(existingRow.use_count || 0) + group.jobs.length,
    }).eq("id", existingRow.id).select("id").single();
    if (update.error) throw new Error(update.error.message);
    return update.data.id as string;
  }

  const insert = await supabase.from("company_contacts_pool").insert(payload).select("id").single();
  if (insert.error) throw new Error(insert.error.message);
  return insert.data.id as string;
}

async function saveReusableEmail(supabase: ReturnType<typeof createClient>, group: CompanyGroup, email: string, result: EmailResult) {
  const clean = cleanEmail(email);
  if (!clean || Number(result.confidence || 0) < 70) return null;

  const now = new Date().toISOString();
  const website = safeUrl(result.companyWebsite);
  const domain = normaliseDomain(result.companyDomain || website || emailDomain(clean));
  const job = representativeJob(group);
  const payload = {
    user_identifier: text(job.user_identifier) || text(job.user_id) || "system",
    campaign_id: job.campaign_id || null,
    job_id: job.id,
    company_name: group.companyName,
    company_website: website,
    company_domain: domain,
    company_website_status: website ? "found" : null,
    website_confidence: website ? result.confidence : null,
    email: clean,
    email_type: "job_contact",
    source: result.source,
    confidence: result.confidence,
    status: "active",
    raw_source: { company_key: group.key, job_ids: group.jobs.map((item) => item.id), source: result.source, provider_result: result.raw },
    last_checked_at: now,
    last_used_at: now,
    updated_at: now,
  };

  const existing = await supabase
    .from("lead_contact_emails")
    .select("id,reuse_count")
    .eq("user_identifier", payload.user_identifier)
    .eq("email", payload.email)
    .limit(1);
  if (existing.error) throw new Error(existing.error.message);

  const existingRow = (existing.data || [])[0];
  if (existingRow) {
    const update = await supabase.from("lead_contact_emails").update({
      ...payload,
      reuse_count: Number(existingRow.reuse_count || 0) + group.jobs.length,
    }).eq("id", existingRow.id).select("id").single();
    if (update.error) throw new Error(update.error.message);
    return update.data.id as string;
  }

  const insert = await supabase.from("lead_contact_emails").insert(payload).select("id").single();
  if (insert.error) throw new Error(insert.error.message);
  return insert.data.id as string;
}

async function updateJobsForGroup(supabase: ReturnType<typeof createClient>, group: CompanyGroup, patch: Row, incrementAttempt = true) {
  const now = new Date().toISOString();
  let updated = 0;
  for (const job of group.jobs) {
    const nextPatch: Row = { ...patch, email_extraction_attempted_at: now };
    if (incrementAttempt) nextPatch.email_extraction_attempt_count = Number(job.email_extraction_attempt_count || 0) + 1;
    const result = await supabase.from("jobs").update(nextPatch).eq("id", job.id);
    if (result.error) throw new Error(result.error.message);
    updated += 1;
  }
  return updated;
}

async function applyFoundEmail(supabase: ReturnType<typeof createClient>, group: CompanyGroup, result: EmailResult) {
  const email = cleanEmail(result.email);
  if (!email || Number(result.confidence || 0) < 70) return null;
  const website = safeUrl(result.companyWebsite);
  if (website && !emailDomainMatchesWebsite(email, website) && Number(result.confidence || 0) < 90) return null;

  await saveCompanyContactPool(supabase, group, email, result);
  const contactId = await saveReusableEmail(supabase, group, email, result);
  const updatedJobs = await updateJobsForGroup(supabase, group, {
    extracted_email: email,
    email_contact_id: contactId,
    company_website_url: website,
    website_discovery_status: website ? "found" : undefined,
    website_discovery_source: result.source,
    website_discovery_confidence: result.confidence,
    website_discovery_error: null,
    apply_method: "email",
    email_extraction_status: "found",
    email_extraction_source: result.source,
    email_extraction_confidence: result.confidence,
    email_extraction_error: null,
  }, true);
  return updatedJobs;
}

async function processCompanyGroup(supabase: ReturnType<typeof createClient>, group: CompanyGroup, limits: { emailFinderCallsRemaining: number }) {
  const poolContact = await findPoolContact(supabase, group);
  if (poolContact?.email) {
    await incrementPoolContact(supabase, poolContact, group.jobs.length);
    const updatedJobs = await updateJobsForGroup(supabase, group, {
      extracted_email: poolContact.email,
      company_website_url: poolContact.company_website_url || null,
      website_discovery_status: poolContact.company_website_url ? "found" : undefined,
      website_discovery_source: "company_contacts_pool",
      website_discovery_confidence: Number(poolContact.confidence || 80),
      website_discovery_error: null,
      apply_method: "email",
      email_extraction_status: "found",
      email_extraction_source: "company_contacts_pool",
      email_extraction_confidence: Number(poolContact.confidence || 80),
      email_extraction_error: null,
    }, false);
    return { status: "pool_reused", websiteFound: Boolean(poolContact.company_website_url), emailFound: true, updatedJobs, providerMissing: false, emailFinderProviderMissing: false };
  }

  const job = representativeJob(group);
  const knownWebsite = safeUrl(knownWebsiteForGroup(group));
  const rawEmail = bestEmail(group.jobs.flatMap((item) => rawEmailCandidates(item.raw_payload || {})), knownWebsite);
  if (rawEmail?.email) {
    const result: EmailResult = { email: rawEmail.email, confidence: rawEmail.score, source: "job_raw_payload_email", raw: { company_key: group.key }, companyWebsite: knownWebsite, companyDomain: normaliseDomain(knownWebsite) };
    const updatedJobs = await applyFoundEmail(supabase, group, result);
    if (updatedJobs !== null) return { status: "email_found", websiteFound: Boolean(knownWebsite), emailFound: true, updatedJobs, providerMissing: false, emailFinderProviderMissing: false };
  }

  let website = knownWebsite;
  const discovery: WebsiteDiscoveryResult = website
    ? { status: "found", website, confidence: 80, source: "raw_payload", attempted: false, error: null }
    : await discoverCompanyWebsite(group.companyName, group.location);

  if (discovery.status === "provider_missing") {
    return { status: "provider_missing", websiteFound: false, emailFound: false, updatedJobs: 0, providerMissing: true, emailFinderProviderMissing: false };
  }

  if (discovery.status === "found") website = discovery.website;

  if (website && EMAIL_FINDER_URL && EMAIL_FINDER_API_KEY && limits.emailFinderCallsRemaining > 0) {
    limits.emailFinderCallsRemaining -= 1;
    const finderResult = await callEmailFinder({ ...job, company_website_url: website }, website);
    if (finderResult.email) {
      const updatedJobs = await applyFoundEmail(supabase, group, finderResult);
      if (updatedJobs !== null) return { status: "email_found", websiteFound: true, emailFound: true, updatedJobs, providerMissing: false, emailFinderProviderMissing: false };
    }
  }

  if (website) {
    const updatedJobs = await updateJobsForGroup(supabase, group, {
      company_website_url: website,
      website_discovery_status: "found",
      website_discovery_source: discovery.source,
      website_discovery_confidence: discovery.confidence,
      website_discovery_error: null,
      apply_method: "url",
      email_extraction_status: "not_found",
      email_extraction_source: "email_finder_not_found",
      email_extraction_confidence: 0,
      email_extraction_error: null,
    }, true);
    return { status: "not_found", websiteFound: true, emailFound: false, updatedJobs, providerMissing: false, emailFinderProviderMissing: !EMAIL_FINDER_URL || !EMAIL_FINDER_API_KEY };
  }

  const updatedJobs = await updateJobsForGroup(supabase, group, {
    company_website_url: null,
    website_discovery_status: discovery.status,
    website_discovery_source: discovery.source,
    website_discovery_confidence: discovery.confidence,
    website_discovery_error: discovery.error,
    apply_method: "url",
    email_extraction_status: discovery.status === "failed" ? "failed" : "not_found",
    email_extraction_source: "company_website_not_found",
    email_extraction_confidence: 0,
    email_extraction_error: discovery.error,
  }, true);

  return {
    status: discovery.status === "failed" ? "failed" : discovery.status === "low_confidence" ? "low_confidence" : "not_found",
    websiteFound: false,
    emailFound: false,
    updatedJobs,
    providerMissing: false,
    emailFinderProviderMissing: false,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "POST") return json({ ok: false, error: "Use POST" }, 405);
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return json({ ok: false, error: "Missing Supabase service role configuration" }, 500);

    const input = await req.json().catch(() => ({}));
    const requestedLimit = Number(input.limit || 50);
    const limit = Math.max(1, Math.min(200, Number.isFinite(requestedLimit) ? requestedLimit : 50));
    const campaignId = text(input.campaign_id);
    const userId = text(input.user_id);
    const jobId = text(input.job_id);
    const forceRetry = input.force_retry === true;
    const maxAttempts = Math.max(1, Math.min(10, Number(input.max_attempts || 3)));
    const maxCompanySearches = Math.max(1, Math.min(5, Number(input.max_company_searches || (jobId ? 1 : 2))));
    const maxEmailFinderCalls = Math.max(0, Math.min(5, Number(input.max_email_finder_calls || maxCompanySearches)));
    const onlyApproved = input.only_approved === false ? false : true;
    const queryLimit = jobId ? 1 : Math.max(limit * 4, 100);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    let query = supabase
      .from("jobs")
      .select("*")
      .is("extracted_email", null)
      .order("created_at", { ascending: true })
      .limit(queryLimit);

    if (campaignId) query = query.eq("campaign_id", campaignId);
    if (userId) query = query.eq("user_id", userId);
    if (jobId) query = query.eq("id", jobId);

    const { data: jobs, error } = await query;
    if (error) throw new Error(error.message);

    const eligibleJobs = (jobs || [])
      .filter((job) => !cleanEmail(job.extracted_email))
      .filter((job) => text(job.email_extraction_status)?.toLowerCase() !== "found")
      .filter((job) => (onlyApproved ? isApprovedJob(job) : true))
      .filter((job) => (forceRetry ? true : canRetry(job, maxAttempts)))
      .filter((job) => Boolean(companyKey(job)))
      .slice(0, jobId ? 1 : limit);

    const groups = buildCompanyGroups(eligibleJobs).slice(0, jobId ? 1 : maxCompanySearches);
    const processedJobs = groups.reduce((total, group) => total + group.jobs.length, 0);
    const limits = { emailFinderCallsRemaining: maxEmailFinderCalls };
    const summary = {
      ok: true,
      function: FUNCTION_NAME,
      processed_jobs: processedJobs,
      unique_companies: groups.length,
      pool_reused: 0,
      cache_reused: 0,
      website_found: 0,
      email_found: 0,
      not_found: 0,
      low_confidence: 0,
      failed: 0,
      provider_missing: 0,
      updated_jobs: 0,
      website_search_provider_missing: !WEBSITE_SEARCH_API_URL || !WEBSITE_SEARCH_API_KEY,
      email_finder_provider_missing: !EMAIL_FINDER_URL || !EMAIL_FINDER_API_KEY,
      requested_job_id: jobId,
      only_approved: onlyApproved,
      max_company_searches: maxCompanySearches,
      max_email_finder_calls: maxEmailFinderCalls,
    };

    for (const group of groups) {
      const result = await processCompanyGroup(supabase, group, limits);
      summary.updated_jobs += result.updatedJobs;
      if (result.status === "pool_reused") summary.pool_reused += 1;
      if (result.websiteFound) summary.website_found += 1;
      if (result.emailFound) summary.email_found += 1;
      if (result.status === "not_found") summary.not_found += 1;
      if (result.status === "low_confidence") summary.low_confidence += 1;
      if (result.status === "failed") summary.failed += 1;
      if (result.status === "provider_missing") summary.provider_missing += 1;
      if (result.providerMissing) summary.website_search_provider_missing = true;
      if (result.emailFinderProviderMissing) summary.email_finder_provider_missing = true;
    }

    return json(summary);
  } catch (error) {
    return json({ ok: false, function: FUNCTION_NAME, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
