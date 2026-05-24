import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type ProfileRow = {
  profile_id: string;
  target_role: string | null;
  industry: string | null;
  industry_specialisation: string | null;
  target_keywords: string[] | null;
  location: string | null;
  email: string | null;
};

type MatchJob = {
  id: string;
  title: string;
  company: string;
  location: string;
  salary: string;
  type: string;
  postedAt?: string | null;
  postedAgo?: string;
  match: number;
  description: string;
  tags: string[];
  logo: string;
  applyUrl?: string | null;
  contactEmail?: string | null;
  hiringEmail?: string | null;
  contactConfidence?: string;
  applicationMethod?: string;
  sourceUrl?: string | null;
  contactNotes?: string[];
};

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization") || "";

  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;
  const scraperUrl = process.env.RENDER_SCRAPER_URL;

  if (!supabaseUrl || !serviceKey || !appId || !appKey || !scraperUrl) {
    return NextResponse.json({
      ok: false,
      error: "Missing required env vars. Need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADZUNA_APP_ID, ADZUNA_APP_KEY, RENDER_SCRAPER_URL.",
    }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: profiles, error: profileError } = await supabase
    .from("resume_profiles")
    .select("profile_id,target_role,industry,industry_specialisation,target_keywords,location,email")
    .not("profile_id", "is", null)
    .limit(25);

  if (profileError) {
    return NextResponse.json({ ok: false, error: profileError.message }, { status: 500 });
  }

  const results = [];

  for (const profile of (profiles || []) as ProfileRow[]) {
    const huntResult = await runHuntForProfile({ profile, appId, appKey, scraperUrl, supabase });
    results.push(huntResult);
  }

  return NextResponse.json({ ok: true, processed: results.length, results });
}

async function runHuntForProfile({ profile, appId, appKey, scraperUrl, supabase }: any) {
  const role = cleanRole(profile.target_role || "support worker");
  const location = cleanLocation(profile.location || "Sydney");
  const industry = profile.industry || "";
  const specialisation = profile.industry_specialisation || "";
  const keywords = Array.isArray(profile.target_keywords) ? profile.target_keywords.join(" ") : "";
  const profileQuery = buildSearchQuery(role, industry, specialisation, keywords);
  const searchAttempts = buildSearchAttempts(role, profileQuery, location);

  let uniqueJobs: MatchJob[] = [];
  let usedAttempt = searchAttempts[0];

  for (const attempt of searchAttempts) {
    const adzunaJobs = await fetchAdzunaPages({
      appId,
      appKey,
      query: attempt.query,
      location: attempt.location,
      country: "au",
      pages: attempt.pages,
      useDateSort: attempt.useDateSort,
    });

    uniqueJobs = dedupeJobs(adzunaJobs).slice(0, 1000);
    usedAttempt = attempt;

    if (uniqueJobs.length > 0) break;
  }

  const jobsForRender = uniqueJobs.slice(0, 20);
  const standard = await enrichJobsWithRender(jobsForRender, scraperUrl, jobsForRender.length, false);
  let emailReadyJobs = standard.jobs.filter((job: MatchJob) => job.contactEmail || job.hiringEmail);
  let deep = { checked: 0, jobs: [] as MatchJob[] };

  if (!emailReadyJobs.length && jobsForRender.length) {
    deep = await enrichJobsWithRender(jobsForRender, scraperUrl, jobsForRender.length, true);
    emailReadyJobs = deep.jobs.filter((job: MatchJob) => job.contactEmail || job.hiringEmail);
  }

  if (emailReadyJobs.length) {
    const rows = emailReadyJobs.map((job: MatchJob) => ({
      user_id: profile.profile_id,
      external_job_id: job.id,
      title: job.title,
      company: job.company,
      location: job.location,
      salary: job.salary,
      job_type: job.type,
      description: job.description,
      source_website: "adzuna",
      apply_url: job.applyUrl || null,
      hiring_email: job.contactEmail || job.hiringEmail || null,
      application_method: "email",
      contact_confidence: job.contactConfidence || "medium",
      source_url: job.sourceUrl || job.applyUrl || null,
      contact_notes: job.contactNotes || [],
      tags: job.tags || [],
      posted_at: job.postedAt || null,
      posted_ago: job.postedAgo || null,
      match_score: job.match || 75,
      requested_role: role,
      requested_industry: industry,
      requested_specialisation: specialisation,
      requested_location: location,
      refreshed_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from("jobs_gateway")
      .upsert(rows, { onConflict: "user_id,external_job_id" });

    if (error) {
      return { userId: profile.profile_id, query: usedAttempt.query, location: usedAttempt.location, fetched: uniqueJobs.length, checked: standard.checked, deepChecked: deep.checked, saved: 0, error: error.message };
    }
  }

  return {
    userId: profile.profile_id,
    query: usedAttempt.query,
    location: usedAttempt.location || "Australia-wide",
    fetched: uniqueJobs.length,
    checked: standard.checked,
    deepChecked: deep.checked,
    emailReady: emailReadyJobs.length,
    saved: emailReadyJobs.length,
    attemptsTried: searchAttempts.indexOf(usedAttempt) + 1,
    note: uniqueJobs.length > 20 ? `Fetched ${uniqueJobs.length} leads. Checked first 20 with Render to avoid timeout.` : undefined,
  };
}

function buildSearchAttempts(role: string, profileQuery: string, location: string) {
  const broadRoles = expandRole(role);
  const queries = [profileQuery, role, ...broadRoles];
  const attempts: Array<{ query: string; location: string; pages: number; useDateSort: boolean }> = [];

  for (const query of queries) {
    attempts.push({ query, location, pages: 5, useDateSort: false });
  }

  for (const query of queries) {
    attempts.push({ query, location: "", pages: 5, useDateSort: false });
  }

  const seen = new Set<string>();
  return attempts.filter((attempt) => {
    const key = `${attempt.query}|${attempt.location}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return Boolean(attempt.query.trim());
  });
}

function expandRole(role: string) {
  const value = role.toLowerCase();
  if (value.includes("market")) return ["market research", "market researcher", "marketing", "research assistant", "insights analyst", "data analyst"];
  if (value === "admin" || value.includes("admin")) return ["administrator", "office administrator", "administration assistant", "office support"];
  if (value.includes("support worker")) return ["support worker", "disability support worker", "care worker"];
  if (value.includes("account")) return ["accounts", "bookkeeper", "accounts officer"];
  return [role];
}

function cleanRole(value: string) {
  return value.replace(/,+/g, " ").replace(/\s+/g, " ").trim() || "support worker";
}

function cleanLocation(value: string) {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned) return "Sydney";
  const upper = cleaned.toUpperCase();
  if (upper === "NSW") return "New South Wales";
  if (upper === "NT") return "Northern Territory";
  if (upper === "VIC") return "Victoria";
  if (upper === "QLD") return "Queensland";
  if (upper === "SA") return "South Australia";
  if (upper === "WA") return "Western Australia";
  if (upper === "TAS") return "Tasmania";
  if (upper === "ACT") return "Australian Capital Territory";
  return cleaned;
}

async function fetchAdzunaPages({ appId, appKey, query, location, country, pages, useDateSort }: any) {
  const allJobs: MatchJob[] = [];

  for (let page = 1; page <= pages; page += 1) {
    const url = new URL(`https://api.adzuna.com/v1/api/jobs/${country}/search/${page}`);
    url.searchParams.set("app_id", appId);
    url.searchParams.set("app_key", appKey);
    url.searchParams.set("what", query);
    if (location) url.searchParams.set("where", location);
    url.searchParams.set("results_per_page", "50");
    url.searchParams.set("content-type", "application/json");
    if (useDateSort) {
      url.searchParams.set("sort_by", "date");
      url.searchParams.set("max_days", "30");
    }

    const response = await fetch(url.toString(), { headers: { Accept: "application/json" }, cache: "no-store" });
    if (!response.ok) continue;

    const data = await response.json();
    allJobs.push(...((data.results || []).map(mapAdzunaJob)));
  }

  return allJobs;
}

async function enrichJobsWithRender(jobs: MatchJob[], scraperUrl: string, limit: number, deep: boolean) {
  if (!jobs.length || !limit) return { checked: 0, jobs: [] as MatchJob[] };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 115000);

    const response = await fetch(`${scraperUrl.replace(/\/$/, "")}/email-ready-jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobs, limit, deep }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) return { checked: 0, jobs: [] as MatchJob[] };

    const data = await response.json();
    return {
      checked: Number(data.checked || 0),
      jobs: Array.isArray(data.jobs) ? data.jobs.map(normaliseRenderJob) : [],
    };
  } catch {
    return { checked: 0, jobs: [] as MatchJob[] };
  }
}

function normaliseRenderJob(job: any): MatchJob {
  const contactEmail = job.contactEmail || job.hiringEmail || null;
  return {
    id: String(job.id || `${job.company}-${job.title}-${job.location}`),
    title: job.title || "Untitled role",
    company: job.company || "Company not listed",
    location: job.location || "Location not listed",
    salary: job.salary || "Salary not listed",
    type: job.type || "Job type not listed",
    postedAt: job.postedAt || null,
    postedAgo: job.postedAgo || "",
    match: Number(job.match || 75),
    description: job.description || "No description provided.",
    tags: Array.isArray(job.tags) ? ["Hiring email found", ...job.tags] : ["Hiring email found"],
    logo: job.logo || "💼",
    applyUrl: job.applyUrl || job.sourceUrl || null,
    contactEmail,
    hiringEmail: contactEmail,
    contactConfidence: job.contactConfidence || (contactEmail ? "medium" : "none"),
    applicationMethod: job.applicationMethod || (contactEmail ? "email" : "apply_link"),
    sourceUrl: job.sourceUrl || job.applyUrl || null,
    contactNotes: Array.isArray(job.contactNotes) ? job.contactNotes : [],
  };
}

function mapAdzunaJob(job: any, index: number): MatchJob {
  const postedAgo = formatPostedAgo(job.created);
  const jobType = formatJobType(job.contract_time);
  return {
    id: job.id || `adzuna-${index}`,
    title: job.title || "Untitled role",
    company: job.company?.display_name || "Company not listed",
    location: job.location?.display_name || "Location not listed",
    salary: formatSalary(job.salary_min, job.salary_max),
    type: postedAgo ? `${jobType} • ${postedAgo}` : jobType,
    postedAt: job.created || null,
    postedAgo,
    match: Math.max(72, 96 - index * 2),
    description: stripHtml(job.description || "No description provided."),
    tags: [job.category?.label, postedAgo, "Adzuna", "Live job"].filter(Boolean),
    logo: "💼",
    applyUrl: job.redirect_url || null,
    contactEmail: null,
  };
}

function dedupeJobs(jobs: MatchJob[]) {
  const seen = new Set<string>();
  return jobs.filter((job) => {
    const key = job.id || `${job.company}-${job.title}-${job.location}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildSearchQuery(role: string, industry: string, specialisation: string, keywords: string) {
  return Array.from(new Set([role, industry, specialisation, keywords].map((item) => item.trim()).filter(Boolean))).join(" ").replace(/\s+/g, " ").trim() || "support worker";
}

function formatSalary(min?: number, max?: number) {
  if (min && max) return `$${Math.round(min).toLocaleString()}-$${Math.round(max).toLocaleString()}`;
  if (min) return `From $${Math.round(min).toLocaleString()}`;
  if (max) return `Up to $${Math.round(max).toLocaleString()}`;
  return "Salary not listed";
}

function formatJobType(type?: string) {
  if (!type) return "Job type not listed";
  return type.replace(/_/g, " ").replace(/\b\w/g, (letter: string) => letter.toUpperCase());
}

function formatPostedAgo(created?: string) {
  if (!created) return "";
  const createdDate = new Date(created);
  if (Number.isNaN(createdDate.getTime())) return "";
  const diffMs = Date.now() - createdDate.getTime();
  const diffHours = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60)));
  const diffDays = Math.floor(diffHours / 24);
  if (diffHours < 1) return "posted just now";
  if (diffHours < 24) return `posted ${diffHours}h ago`;
  if (diffDays === 1) return "posted 1 day ago";
  if (diffDays < 30) return `posted ${diffDays} days ago`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths === 1) return "posted 1 month ago";
  return `posted ${diffMonths} months ago`;
}

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}
