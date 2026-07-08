import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type Row = Record<string, any>;

type EmailResult = {
  email: string | null;
  confidence: number;
  source: string;
  raw: unknown;
  companyWebsite?: string | null;
  companyDomain?: string | null;
};

type WebsiteCandidate = {
  url: string;
  title: string | null;
  snippet: string | null;
  raw: unknown;
  providerConfidence?: number;
};

type WebsiteDiscoveryResult = {
  status: "found" | "low_confidence" | "not_found" | "failed" | "provider_missing";
  website: string | null;
  confidence: number;
  source: string | null;
  attempted: boolean;
  error: string | null;
  raw: unknown;
};

type CompanyGroup = {
  key: string;
  companyName: string;
  location: string | null;
  userIdentifier: string;
  jobs: Row[];
};

type RunLimits = {
  emailFinderCallsRemaining: number;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const EMAIL_FINDER_URL = Deno.env.get("EMAIL_FINDER_URL") || "";
const EMAIL_FINDER_API_KEY = Deno.env.get("EMAIL_FINDER_API_KEY") || "";
const WEBSITE_SEARCH_API_URL = Deno.env.get("WEBSITE_SEARCH_API_URL") || "";
const WEBSITE_SEARCH_API_KEY = Deno.env.get("WEBSITE_SEARCH_API_KEY") || "";

const BLOCKED_EMAIL_PARTS = [
  "sentry.io",
  "ingest",
  ".ingest.",
  "zendesk",
  "noreply",
  "no-reply",
  "do-not-reply",
  "donotreply",
  "no_reply",
  "privacy@",
  "accounts@",
  "billing@",
  "example@",
  "test@",
  "example.com",
  "test.com",
  "hostsajan",
  "support@indeed",
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

const BLOCKED_WEBSITE_DOMAINS = [
  "indeed.com",
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
  "rippling.com",
  "jobs.employmenthero.com",
  "bamboohr.com",
  "jobvite.com",
  "teamtailor.com",
  "myworkdayjobs.com",
];

const CONTACT_PATHS = [
  "/",
  "/contact",
  "/contact-us",
  "/about",
  "/about-us",
  "/careers",
  "/jobs",
  "/join-us",
  "/work-with-us",
  "/recruitment",
  "/staff-recruitment",
  "/privacy-policy",
  "/referrals",
  "/ndis",
  "/disability-support",
];

const CARE_KEYWORDS = ["ndis", "disability", "care", "support", "home care", "aged care"];
const URL_HINTS = ["contact", "about", "careers", "jobs", "recruitment", "staff"];
const COMPANY_STOP_WORDS = new Set(["pty", "ltd", "limited", "the", "and", "&", "a", "an", "inc", "co", "company", "group"]);

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
    const host = new URL(withProtocol).hostname.toLowerCase();
    return host.replace(/^www\./, "") || null;
  } catch {
    return raw.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] || null;
  }
}

function isBlockedDomain(domain: string | null) {
  if (!domain) return true;
  return BLOCKED_WEBSITE_DOMAINS.some((blocked) => domain === blocked || domain.endsWith(`.${blocked}`));
}

function withProtocol(value: string) {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function safeUrl(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  try {
    const url = new URL(withProtocol(raw));
    const domain = normaliseDomain(url.hostname);
    if (isBlockedDomain(domain)) return null;
    return url.origin;
  } catch {
    return null;
  }
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

function emailDomain(email: string | null): string | null {
  return email?.split("@")[1]?.toLowerCase() || null;
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
    body?.value,
    body?.found_email,
    body?.contact_email,
    body?.company_email,
    body?.data?.email,
    body?.data?.found_email,
    body?.data?.contact_email,
    ...(Array.isArray(body?.emails) ? body.emails.map((item: Row | string) => typeof item === "string" ? item : item.email || item.value) : []),
    ...(Array.isArray(body?.data?.emails) ? body.data.emails.map((item: Row | string) => typeof item === "string" ? item : item.email || item.value) : []),
    ...(Array.isArray(body?.contacts) ? body.contacts.flatMap((item: Row) => [item.email, item.value, ...(Array.isArray(item.emails) ? item.emails.map((email: Row | string) => typeof email === "string" ? email : email.email || email.value) : [])]) : []),
    ...(Array.isArray(body?.data) ? body.data.flatMap((item: Row) => [
      item.email,
      item.value,
      ...(Array.isArray(item.emails) ? item.emails.map((email: Row | string) => typeof email === "string" ? email : email.email || email.value) : []),
      ...(Array.isArray(item.contacts) ? item.contacts.flatMap((contact: Row) => [contact.email, contact.value, ...(Array.isArray(contact.emails) ? contact.emails.map((email: Row | string) => typeof email === "string" ? email : email.email || email.value) : [])]) : []),
    ]) : []),
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

function textMentionsCompany(value: unknown, company: string) {
  const body = lower(value);
  if (!body) return false;
  const tokens = companyTokens(company);
  if (!tokens.length) return body.includes(company.toLowerCase());
  return tokens.filter((token) => body.includes(token)).length >= Math.min(2, tokens.length);
}

function textMentionsLocation(value: unknown, location: string | null) {
  const locationText = lower(location);
  if (!locationText) return false;
  const haystack = lower(value);
  return locationText.split(/[, ]+/).filter((part) => part.length >= 3).some((part) => haystack.includes(part));
}

function scoreWebsiteCandidate(candidate: WebsiteCandidate, company: string, location: string | null) {
  const url = safeUrl(candidate.url);
  if (!url) return -100;
  const domain = normaliseDomain(url);
  let score = 0;
  const combinedText = [candidate.title, candidate.snippet].filter(Boolean).join(" ");

  if (isBlockedDomain(domain)) score -= 50;
  if (domainLooksLikeCompany(domain, company)) score += 40;
  if (textMentionsCompany(combinedText, company)) score += 20;
  if (textMentionsLocation(combinedText, location)) score += 15;
  if (CARE_KEYWORDS.some((keyword) => lower(combinedText).includes(keyword))) score += 15;
  if (URL_HINTS.some((hint) => lower(candidate.url).includes(hint))) score += 10;
  if (!domainLooksLikeCompany(domain, company) && !textMentionsCompany(combinedText, company)) score -= 30;
  if (candidate.providerConfidence !== undefined) score = Math.max(score, candidate.providerConfidence);

  return score;
}

function searchQueries(company: string, location: string | null) {
  const withLocation = location ? [
    `"${company}" "${location}"`,
    `"${company}" "${location}" contact`,
    `"${company}" "${location}" email`,
  ] : [];

  return [...new Set([
    ...withLocation,
    company,
    `"${company}" "recruitment" email`,
    `"${company}" "careers"`,
    `"${company}" "NDIS" contact`,
    `"${company}" "disability support" contact`,
    `"${company}" "staff recruitment"`,
  ])];
}

function parseJson(value: string): unknown {
  try {
    return value ? JSON.parse(value) : {};
  } catch {
    return { raw: value };
  }
}

function confidenceToPercent(value: unknown): number | undefined {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return undefined;
  if (numeric <= 1) return Math.round(numeric * 100);
  return Math.round(numeric);
}

function addCandidateFromObject(item: Row, out: WebsiteCandidate[]) {
  const url = text(item.url || item.link || item.website || item.company_website || item.formattedUrl || item.displayLink || item.domain);
  if (!url) return;
  out.push({
    url,
    title: text(item.title || item.name || item.company_name || item.companyName || item.query),
    snippet: text(item.snippet || item.description || item.summary || item.text || item.domain),
    raw: item,
    providerConfidence: confidenceToPercent(item.confidence_score ?? item.confidence ?? item.score),
  });
}

function collectWebsiteCandidates(payload: unknown, depth = 0, out: WebsiteCandidate[] = []) {
  if (depth > 5 || !payload) return out;
  if (Array.isArray(payload)) {
    for (const item of payload.slice(0, 50)) collectWebsiteCandidates(item, depth + 1, out);
    return out;
  }
  if (typeof payload !== "object") return out;

  const item = payload as Row;
  addCandidateFromObject(item, out);
  for (const key of ["items", "results", "organic_results", "data", "pages", "value"]) {
    if (Array.isArray(item[key])) collectWebsiteCandidates(item[key], depth + 1, out);
  }
  if (item.webPages?.value) collectWebsiteCandidates(item.webPages.value, depth + 1, out);
  return out;
}

async function callSearchProvider(query: string, company: string, location: string | null) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    authorization: `Bearer ${WEBSITE_SEARCH_API_KEY}`,
    "X-API-KEY": WEBSITE_SEARCH_API_KEY,
  };

  let requestUrl = WEBSITE_SEARCH_API_URL;
  let init: RequestInit = { method: "POST", headers, body: JSON.stringify({ query, company, location }) };

  if (requestUrl.includes("{query}") || requestUrl.includes("{q}") || requestUrl.includes("{api_key}")) {
    requestUrl = requestUrl
      .replaceAll("{query}", encodeURIComponent(query))
      .replaceAll("{q}", encodeURIComponent(query))
      .replaceAll("{api_key}", encodeURIComponent(WEBSITE_SEARCH_API_KEY));
    init = { method: "GET", headers };
  }

  const response = await fetch(requestUrl, init);
  const responseText = await response.text().catch(() => "");
  const payload = parseJson(responseText);
  if (!response.ok) throw new Error(`Website search failed ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`);
  return payload;
}

async function discoverCompanyWebsite(company: string, location: string | null): Promise<WebsiteDiscoveryResult> {
  if (!WEBSITE_SEARCH_API_URL || !WEBSITE_SEARCH_API_KEY) {
    return { status: "provider_missing", website: null, confidence: 0, source: null, attempted: false, error: null, raw: null };
  }

  try {
    const candidates: WebsiteCandidate[] = [];
    const rawResults: Row[] = [];

    for (const query of searchQueries(company, location)) {
      const payload = await callSearchProvider(query, company, location);
      rawResults.push({ query, payload });
      candidates.push(...collectWebsiteCandidates(payload));
    }

    const uniqueCandidates = [...new Map(candidates.map((candidate) => [safeUrl(candidate.url) || candidate.url, candidate])).values()]
      .filter((candidate) => Boolean(safeUrl(candidate.url)));

    if (!uniqueCandidates.length) {
      return { status: "not_found", website: null, confidence: 0, source: "search_api", attempted: true, error: null, raw: rawResults };
    }

    const scored = uniqueCandidates
      .map((candidate) => ({ candidate, score: scoreWebsiteCandidate(candidate, company, location) }))
      .sort((a, b) => b.score - a.score);

    const best = scored[0];
    const website = safeUrl(best.candidate.url);
    if (website && best.score >= 70) {
      return { status: "found", website, confidence: best.score, source: "search_api", attempted: true, error: null, raw: { scored: scored.slice(0, 10), rawResults } };
    }

    return { status: "low_confidence", website: null, confidence: Math.max(0, best.score), source: "search_api", attempted: true, error: null, raw: { scored: scored.slice(0, 10), rawResults } };
  } catch (error) {
    return {
      status: "failed",
      website: null,
      confidence: 0,
      source: "search_api",
      attempted: true,
      error: error instanceof Error ? error.message : String(error),
      raw: null,
    };
  }
}

function scoreEmail(email: string, website: string | null) {
  const [local, domain] = email.split("@");
  let score = 20;
  if (["recruitment", "careers", "career", "hr", "jobs", "job", "people"].some((prefix) => local.startsWith(prefix))) score += 70;
  if (["admin", "info", "contact", "hello", "office", "enquiries", "enquiry"].some((prefix) => local.startsWith(prefix))) score += 45;
  if (website) {
    if (emailDomainMatchesWebsite(email, website)) score += 35;
    else score -= 25;
  }
  if (["gmail.com", "outlook.com", "hotmail.com", "yahoo.com", "icloud.com"].includes(domain)) score -= 15;
  return score;
}

function bestEmail(candidates: string[], website: string | null) {
  const clean = [...new Set(candidates.map(cleanEmail).filter(Boolean) as string[])];
  return clean
    .map((email) => ({ email, score: scoreEmail(email, website) }))
    .filter((candidate) => !website || emailDomainMatchesWebsite(candidate.email, website) || candidate.score >= 70)
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
  if (!base) return { email: null, confidence: 0, source: "website_invalid", raw: {}, companyWebsite: null, companyDomain: null };

  const found: string[] = [];
  const checked: Row[] = [];
  for (const path of CONTACT_PATHS) {
    const url = new URL(path, base).toString();
    try {
      const result = await fetchWithTimeout(url);
      checked.push({ url, status: result.status, ok: result.ok });
      if (!result.ok) continue;
      found.push(...extractEmailsFromText(result.body));
      if (found.length >= 8) break;
    } catch (error) {
      checked.push({ url, error: error instanceof Error ? error.message : String(error) });
    }
  }

  const best = bestEmail(found, base);
  if (!best) return { email: null, confidence: 0, source: "website_scrape_not_found", raw: { checked }, companyWebsite: base, companyDomain: normaliseDomain(base) };
  return {
    email: best.email,
    confidence: Math.min(100, Math.max(50, best.score)),
    source: "website_contact_page_scrape",
    raw: { checked, candidates: [...new Set(found)] },
    companyWebsite: base,
    companyDomain: normaliseDomain(base),
  };
}

function emailFinderQuery(job: Row, website: string | null) {
  const officialWebsite = safeUrl(website || job.company_website_url || companyWebsite(job));
  const domain = normaliseDomain(officialWebsite);
  return domain || officialWebsite || companyNameFromJob(job) || "";
}

async function callEmailFinder(job: Row, website: string | null): Promise<EmailResult> {
  if (!EMAIL_FINDER_URL || !EMAIL_FINDER_API_KEY) {
    return { email: null, confidence: 0, source: "email_finder_not_configured", raw: { error: "EMAIL_FINDER_URL or EMAIL_FINDER_API_KEY is missing" }, companyWebsite: website, companyDomain: normaliseDomain(website) };
  }

  const query = emailFinderQuery(job, website);
  if (!query) {
    return { email: null, confidence: 0, source: "email_finder_no_query", raw: { error: "No email finder query could be built" }, companyWebsite: website, companyDomain: normaliseDomain(website) };
  }

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

function isApprovedJob(job: Row) {
  return text(job.status)?.toLowerCase() === "approved" || text(job.user_decision)?.toLowerCase() === "approved";
}

function canRetry(job: Row, maxAttempts: number) {
  const status = text(job.email_extraction_status)?.toLowerCase();
  if (status === "found") return false;
  if (status === "provider_missing") return true;
  return Number(job.email_extraction_attempt_count || 0) < maxAttempts;
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

    groups.set(key, {
      key,
      companyName,
      location: text(job.location),
      userIdentifier: text(job.user_identifier) || text(job.user_id) || "system",
      jobs: [job],
    });
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

function cleanPatch(patch: Row) {
  return Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
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

async function saveCompanyContactPool(supabase: ReturnType<typeof createClient>, group: CompanyGroup, email: string, result: EmailResult) {
  const clean = cleanEmail(email);
  if (!clean) return null;

  const website = safeUrl(result.companyWebsite);
  if (website && !emailDomainMatchesWebsite(clean, website) && Number(result.confidence || 0) < 70) return null;

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

async function fetchReusableCandidates(supabase: ReturnType<typeof createClient>, group: CompanyGroup, domain: string | null) {
  const rows: Row[] = [];

  async function add(result: PromiseLike<{ data: Row[] | null; error: { message: string } | null }>) {
    const { data, error } = await result;
    if (error) throw new Error(error.message);
    rows.push(...(data || []));
  }

  await add(supabase
    .from("lead_contact_emails")
    .select("id,email,reuse_count,company_name,company_website,company_domain,source,confidence,website_confidence,last_checked_at")
    .eq("status", "active")
    .ilike("company_name", group.companyName)
    .order("last_checked_at", { ascending: false, nullsFirst: false })
    .limit(20));

  if (domain) {
    await add(supabase
      .from("lead_contact_emails")
      .select("id,email,reuse_count,company_name,company_website,company_domain,source,confidence,website_confidence,last_checked_at")
      .eq("status", "active")
      .eq("company_domain", domain)
      .order("last_checked_at", { ascending: false, nullsFirst: false })
      .limit(20));

    await add(supabase
      .from("lead_contact_emails")
      .select("id,email,reuse_count,company_name,company_website,company_domain,source,confidence,website_confidence,last_checked_at")
      .eq("status", "active")
      .ilike("company_website", `%${domain}%`)
      .order("last_checked_at", { ascending: false, nullsFirst: false })
      .limit(20));
  }

  return [...new Map(rows.map((row) => [row.id, row])).values()];
}

async function findReusableContact(supabase: ReturnType<typeof createClient>, group: CompanyGroup) {
  const knownWebsite = knownWebsiteForGroup(group);
  const domain = normaliseDomain(knownWebsite);
  const candidates = await fetchReusableCandidates(supabase, group, domain);

  return candidates
    .map((row) => ({
      ...row,
      email: cleanEmail(row.email),
      company_website: safeUrl(row.company_website),
      company_domain: normaliseDomain(row.company_domain || row.company_website),
    }))
    .filter((row) => {
      const rowCompany = normaliseCompany(row.company_name);
      const companyMatches = rowCompany === group.key || textMentionsCompany(row.company_name, group.companyName);
      const domainMatches = domain && row.company_domain === domain;
      return row.email && Number(row.confidence || 0) >= 70 && (companyMatches || domainMatches);
    })
    .sort((a, b) => Number(b.confidence || b.website_confidence || 0) - Number(a.confidence || a.website_confidence || 0))[0] || null;
}

async function saveReusableEmail(supabase: ReturnType<typeof createClient>, group: CompanyGroup, email: string, result: EmailResult) {
  const now = new Date().toISOString();
  const website = safeUrl(result.companyWebsite);
  const domain = normaliseDomain(result.companyDomain || website || emailDomain(email));
  const job = representativeJob(group);
  const payload = {
    user_identifier: group.userIdentifier,
    campaign_id: job.campaign_id || null,
    job_id: job.id,
    company_name: group.companyName,
    company_website: website,
    company_domain: domain,
    company_website_status: website ? "found" : null,
    website_confidence: website ? result.confidence : null,
    email,
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

async function incrementReusableContact(supabase: ReturnType<typeof createClient>, row: Row, count: number) {
  if (!row?.id) return;
  const now = new Date().toISOString();
  const update = await supabase
    .from("lead_contact_emails")
    .update({ reuse_count: Number(row.reuse_count || 0) + count, last_used_at: now, last_checked_at: now, updated_at: now })
    .eq("id", row.id);
  if (update.error) throw new Error(update.error.message);
}

async function updateJobsForGroup(
  supabase: ReturnType<typeof createClient>,
  group: CompanyGroup,
  patch: Row,
  options: { incrementEmailAttempt?: boolean; incrementWebsiteAttempt?: boolean } = {},
) {
  const now = new Date().toISOString();
  let updated = 0;

  for (const job of group.jobs) {
    const nextPatch: Row = cleanPatch({ ...patch, email_extraction_attempted_at: now });
    if (options.incrementEmailAttempt !== false) {
      nextPatch.email_extraction_attempt_count = Number(job.email_extraction_attempt_count || 0) + 1;
    }
    if (options.incrementWebsiteAttempt) {
      nextPatch.website_discovery_attempt_count = Number(job.website_discovery_attempt_count || 0) + 1;
      nextPatch.website_discovery_attempted_at = now;
    }

    const result = await supabase.from("jobs").update(nextPatch).eq("id", job.id);
    if (result.error) throw new Error(result.error.message);
    updated += 1;
  }

  return updated;
}

function websitePatch(result: WebsiteDiscoveryResult) {
  if (result.status === "provider_missing") return {};
  return {
    company_website_url: result.website,
    website_discovery_status: result.status,
    website_discovery_source: result.source,
    website_discovery_confidence: result.confidence,
    website_discovery_error: result.error,
  };
}

async function applyFoundEmail(supabase: ReturnType<typeof createClient>, group: CompanyGroup, email: string, result: EmailResult, source: string, discovery?: WebsiteDiscoveryResult) {
  const clean = cleanEmail(email);
  if (!clean) return null;
  await saveCompanyContactPool(supabase, group, clean, result);
  const contactId = await saveReusableEmail(supabase, group, clean, result);
  const website = safeUrl(result.companyWebsite);
  const updatedJobs = await updateJobsForGroup(supabase, group, {
    extracted_email: clean,
    email_contact_id: contactId,
    company_website_url: website,
    website_discovery_status: website ? "found" : undefined,
    website_discovery_source: website ? (discovery?.source || source) : undefined,
    website_discovery_confidence: website ? (discovery?.confidence || result.confidence) : undefined,
    website_discovery_error: null,
    apply_method: "email",
    email_extraction_status: "found",
    email_extraction_source: source,
    email_extraction_confidence: result.confidence,
    email_extraction_error: null,
  }, { incrementWebsiteAttempt: discovery?.attempted || false });
  return updatedJobs;
}

async function processCompanyGroup(supabase: ReturnType<typeof createClient>, group: CompanyGroup, limits: RunLimits) {
  const job = representativeJob(group);
  const rawWebsite = knownWebsiteForGroup(group);

  const poolContact = await findPoolContact(supabase, group);
  if (poolContact?.email) {
    await incrementPoolContact(supabase, poolContact, group.jobs.length);
    const website = safeUrl(poolContact.company_website_url || rawWebsite);
    const contactId = await saveReusableEmail(supabase, group, poolContact.email, {
      email: poolContact.email,
      confidence: Number(poolContact.confidence || 80),
      source: "company_contacts_pool",
      raw: { pool_contact_id: poolContact.id },
      companyWebsite: website,
      companyDomain: normaliseDomain(poolContact.company_domain || website),
    });
    const updatedJobs = await updateJobsForGroup(supabase, group, {
      extracted_email: poolContact.email,
      email_contact_id: contactId,
      company_website_url: website,
      website_discovery_status: website ? "found" : undefined,
      website_discovery_source: website ? "company_contacts_pool" : undefined,
      website_discovery_confidence: Number(poolContact.confidence || 80),
      website_discovery_error: null,
      apply_method: "email",
      email_extraction_status: "found",
      email_extraction_source: "company_contacts_pool",
      email_extraction_confidence: Number(poolContact.confidence || 80),
      email_extraction_error: null,
    }, { incrementEmailAttempt: false });
    return { status: "pool_reused", websiteFound: Boolean(website), emailFound: true, updatedJobs, providerMissing: false, emailFinderProviderMissing: false };
  }

  const reusable = await findReusableContact(supabase, group);
  if (reusable?.email) {
    await incrementReusableContact(supabase, reusable, group.jobs.length);
    const website = safeUrl(reusable.company_website || rawWebsite);
    await saveCompanyContactPool(supabase, group, reusable.email, {
      email: reusable.email,
      confidence: Number(reusable.confidence || 80),
      source: "lead_contact_emails_cache",
      raw: { lead_contact_email_id: reusable.id },
      companyWebsite: website,
      companyDomain: normaliseDomain(reusable.company_domain || website),
    });
    const updatedJobs = await updateJobsForGroup(supabase, group, {
      extracted_email: reusable.email,
      email_contact_id: reusable.id,
      company_website_url: website,
      website_discovery_status: website ? "found" : undefined,
      website_discovery_source: website ? "lead_contact_emails_cache" : undefined,
      website_discovery_confidence: Number(reusable.website_confidence || reusable.confidence || 80),
      website_discovery_error: null,
      apply_method: "email",
      email_extraction_status: "found",
      email_extraction_source: "reused_lead_contact_emails",
      email_extraction_confidence: Number(reusable.confidence || 80),
      email_extraction_error: null,
    }, { incrementEmailAttempt: false });
    return { status: "cache_reused", websiteFound: Boolean(website), emailFound: true, updatedJobs, providerMissing: false, emailFinderProviderMissing: false };
  }

  const knownWebsite = safeUrl(rawWebsite);
  const rawEmail = bestEmail(group.jobs.flatMap((item) => rawEmailCandidates(item.raw_payload || {})), knownWebsite);
  if (rawEmail?.email) {
    const result: EmailResult = { email: rawEmail.email, confidence: rawEmail.score, source: "job_raw_payload_email", raw: { company_key: group.key }, companyWebsite: knownWebsite, companyDomain: normaliseDomain(knownWebsite) };
    const updatedJobs = await applyFoundEmail(supabase, group, rawEmail.email, result, result.source);
    if (updatedJobs !== null) return { status: "email_found", websiteFound: Boolean(knownWebsite), emailFound: true, updatedJobs, providerMissing: false, emailFinderProviderMissing: false };
  }

  let website = knownWebsite;
  const discovery: WebsiteDiscoveryResult = website
    ? { status: "found", website, confidence: 80, source: "raw_payload", attempted: false, error: null, raw: null }
    : await discoverCompanyWebsite(group.companyName, group.location);

  if (discovery.status === "provider_missing") {
    return { status: "provider_missing", websiteFound: false, emailFound: false, updatedJobs: 0, providerMissing: true, emailFinderProviderMissing: false };
  }

  if (discovery.status === "found") website = discovery.website;

  if (website) {
    if (EMAIL_FINDER_URL && EMAIL_FINDER_API_KEY && limits.emailFinderCallsRemaining > 0) {
      limits.emailFinderCallsRemaining -= 1;
      const finderResult = await callEmailFinder({ ...job, company_website_url: website }, website);
      const finderEmail = cleanEmail(finderResult.email);
      if (finderEmail) {
        const updatedJobs = await applyFoundEmail(supabase, group, finderEmail, finderResult, finderResult.source, discovery);
        if (updatedJobs !== null) return { status: "email_found", websiteFound: true, emailFound: true, updatedJobs, providerMissing: false, emailFinderProviderMissing: false };
      }
    }

    const scrapeResult = await scrapeWebsiteForEmail(website);
    if (scrapeResult.email) {
      const updatedJobs = await applyFoundEmail(supabase, group, scrapeResult.email, scrapeResult, scrapeResult.source, discovery);
      if (updatedJobs !== null) return { status: "email_found", websiteFound: true, emailFound: true, updatedJobs, providerMissing: false, emailFinderProviderMissing: !EMAIL_FINDER_URL || !EMAIL_FINDER_API_KEY };
    }

    const updatedJobs = await updateJobsForGroup(supabase, group, {
      company_website_url: website,
      website_discovery_status: "found",
      website_discovery_source: discovery.source,
      website_discovery_confidence: discovery.confidence,
      website_discovery_error: null,
      apply_method: "url",
      email_extraction_status: "not_found",
      email_extraction_source: "website_scrape_not_found",
      email_extraction_confidence: 0,
      email_extraction_error: null,
    }, { incrementWebsiteAttempt: discovery.attempted });
    return { status: "not_found", websiteFound: true, emailFound: false, updatedJobs, providerMissing: false, emailFinderProviderMissing: !EMAIL_FINDER_URL || !EMAIL_FINDER_API_KEY };
  }

  const failed = discovery.status === "failed";
  const updatedJobs = await updateJobsForGroup(supabase, group, {
    ...websitePatch(discovery),
    apply_method: "url",
    email_extraction_status: failed ? "failed" : "not_found",
    email_extraction_source: "company_website_not_found",
    email_extraction_confidence: 0,
    email_extraction_error: discovery.error,
  }, { incrementWebsiteAttempt: discovery.attempted });

  return {
    status: failed ? "failed" : discovery.status === "low_confidence" ? "low_confidence" : "not_found",
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
    const limit = Math.max(1, Math.min(200, Number(input.limit || 50)));
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
    const limits: RunLimits = { emailFinderCallsRemaining: maxEmailFinderCalls };
    const summary = {
      ok: true,
      function: "enrich-job-emails",
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
      if (result.status === "cache_reused") summary.cache_reused += 1;
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
    return json({ ok: false, function: "enrich-job-emails", error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
