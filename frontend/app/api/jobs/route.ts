import { NextResponse } from "next/server";
import { jobs as demoJobs } from "../../data/jobs";

type AdzunaJob = {
  id?: string;
  title?: string;
  company?: { display_name?: string };
  location?: { display_name?: string };
  salary_min?: number;
  salary_max?: number;
  contract_time?: string;
  description?: string;
  category?: { label?: string };
  redirect_url?: string;
  created?: string;
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

type FetchAttempt = {
  url: URL;
  label: string;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const role = searchParams.get("role") || "support worker";
  const location = searchParams.get("location") || "Sydney";
  const country = searchParams.get("country") || "au";
  const industry = searchParams.get("industry") || "";
  const specialisation = searchParams.get("specialisation") || searchParams.get("industry_specialisation") || "";
  const keywords = searchParams.get("keywords") || "";
  const maxDays = searchParams.get("max_days") || "30";
  const requestedPage = searchParams.get("page");
  const page = requestedPage || String(Math.floor(Math.random() * 4) + 1);
  const searchQuery = buildSearchQuery(role, industry, specialisation, keywords);
  const simpleQuery = buildSearchQuery(role, "", "", "");

  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;

  if (!appId || !appKey) {
    return NextResponse.json({
      ok: true,
      source: "demo",
      message: "Adzuna keys are not set in Vercel. Add ADZUNA_APP_ID and ADZUNA_APP_KEY, then redeploy.",
      query: searchQuery,
      location,
      page,
      count: 0,
      jobs: demoJobs,
    });
  }

  const attempts: FetchAttempt[] = [
    {
      label: "profile query",
      url: buildAdzunaUrl({ country, page, appId, appKey, what: searchQuery, where: location, sortByDate: true, maxDays }),
    },
    {
      label: "simple role query",
      url: buildAdzunaUrl({ country, page: "1", appId, appKey, what: simpleQuery, where: location, sortByDate: false }),
    },
    {
      label: "role only query",
      url: buildAdzunaUrl({ country, page: "1", appId, appKey, what: simpleQuery, where: "", sortByDate: false }),
    },
  ];

  const errors: string[] = [];

  try {
    for (const attempt of attempts) {
      const result = await fetchAdzunaAttempt(attempt);

      if (!result.ok) {
        errors.push(`${attempt.label}: ${result.status} ${result.details}`.trim());
        continue;
      }

      const jobs: MatchJob[] = (result.data.results || []).map(mapAdzunaJob);

      if (!jobs.length) {
        errors.push(`${attempt.label}: no jobs returned`);
        continue;
      }

      const enriched = await enrichJobsWithRender(jobs);
      const emailReadyJobs = enriched.jobs.filter((job) => job.contactEmail || job.hiringEmail);
      const gatewayJobs = enriched.gatewayJobs || [];
      const jobsToShow = enriched.usedRender ? emailReadyJobs : jobs;
      const emailReadyCount = emailReadyJobs.length;

      return NextResponse.json({
        ok: true,
        source: emailReadyCount > 0 || !enriched.usedRender ? "adzuna" : "adzuna_no_email_ready",
        query: attempt.label === "profile query" ? searchQuery : simpleQuery,
        attemptedQuery: searchQuery,
        role,
        industry,
        specialisation,
        keywords,
        location,
        page: attempt.url.pathname.split("/").pop() || page,
        maxDays,
        count: jobsToShow.length,
        emailReadyCount,
        gatewayCount: gatewayJobs.length,
        jobs: jobsToShow,
        gatewayJobs,
        renderChecked: enriched.checked,
        message: buildSuccessMessage(jobs.length, jobsToShow.length, emailReadyCount, enriched.usedRender, attempt.label),
      });
    }

    return NextResponse.json({
      ok: true,
      source: "adzuna_empty_demo_fallback",
      query: searchQuery,
      role,
      industry,
      specialisation,
      keywords,
      location,
      page,
      maxDays,
      count: 0,
      jobs: demoJobs,
      message: `Adzuna could not return live jobs for this search. Tried profile and simple role queries. Showing demo jobs only.`,
      debug: errors.slice(0, 3),
    });
  } catch (error: any) {
    return NextResponse.json({
      ok: false,
      source: "fetch_error_demo_fallback",
      error: error?.message || "Unknown job fetch error",
      message: `Job fetch failed: ${error?.message || "Unknown error"}. Showing demo jobs only.`,
      query: searchQuery,
      location,
      page,
      count: 0,
      jobs: demoJobs,
    });
  }
}

async function fetchAdzunaAttempt(attempt: FetchAttempt) {
  const response = await fetch(attempt.url.toString(), {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  const contentType = response.headers.get("content-type") || "";

  if (!response.ok) {
    const text = await response.text();
    return {
      ok: false,
      status: response.status,
      details: cleanDetails(text),
      data: null as any,
    };
  }

  if (!contentType.includes("application/json")) {
    const text = await response.text();
    return {
      ok: false,
      status: response.status,
      details: `Expected JSON but received ${contentType}. ${cleanDetails(text)}`,
      data: null as any,
    };
  }

  return {
    ok: true,
    status: response.status,
    details: "",
    data: await response.json(),
  };
}

async function enrichJobsWithRender(jobs: MatchJob[]) {
  const scraperUrl = process.env.RENDER_SCRAPER_URL;

  if (!scraperUrl) {
    return { usedRender: false, checked: 0, jobs, gatewayJobs: [] as MatchJob[] };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 115000);

    const response = await fetch(`${scraperUrl.replace(/\/$/, "")}/email-ready-jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobs, limit: 8 }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return { usedRender: true, checked: 0, jobs: [] as MatchJob[], gatewayJobs: [] as MatchJob[] };
    }

    const data = await response.json();
    const emailReadyJobs = Array.isArray(data.jobs) ? data.jobs.map(normaliseRenderJob) : [];
    const gatewayJobs = Array.isArray(data.gatewayJobs) ? data.gatewayJobs.map(normaliseRenderJob) : [];

    return {
      usedRender: true,
      checked: Number(data.checked || 0),
      jobs: emailReadyJobs,
      gatewayJobs,
    };
  } catch {
    return { usedRender: true, checked: 0, jobs: [] as MatchJob[], gatewayJobs: [] as MatchJob[] };
  }
}

function normaliseRenderJob(job: any): MatchJob {
  const contactEmail = job.contactEmail || job.hiringEmail || null;
  const contactNotes = Array.isArray(job.contactNotes) ? job.contactNotes : [];
  const tags = Array.isArray(job.tags) ? job.tags : [];

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
    tags: [contactEmail ? "Hiring email found" : "Application gateway", ...tags].filter(Boolean),
    logo: job.logo || "💼",
    applyUrl: job.applyUrl || job.sourceUrl || null,
    contactEmail,
    hiringEmail: contactEmail,
    contactConfidence: job.contactConfidence || (contactEmail ? "medium" : "none"),
    applicationMethod: job.applicationMethod || (contactEmail ? "email" : "apply_link"),
    sourceUrl: job.sourceUrl || job.applyUrl || null,
    contactNotes,
  };
}

function buildSuccessMessage(total: number, returned: number, emailReady: number, usedRender: boolean, attemptLabel: string) {
  if (!usedRender) {
    return `Fetched ${total} live jobs from Adzuna using ${attemptLabel}. Add RENDER_SCRAPER_URL to check hiring emails.`;
  }

  if (emailReady > 0) {
    return `Fetched ${total} live jobs from Adzuna and found ${emailReady} with hiring emails.`;
  }

  return `Fetched ${total} live jobs from Adzuna, but no direct hiring emails were found in the first checked jobs. Applix is not showing gateway-only jobs by default.`;
}

function buildAdzunaUrl({
  country,
  page,
  appId,
  appKey,
  what,
  where,
  sortByDate,
  maxDays,
}: {
  country: string;
  page: string;
  appId: string;
  appKey: string;
  what: string;
  where: string;
  sortByDate: boolean;
  maxDays?: string;
}) {
  const url = new URL(`https://api.adzuna.com/v1/api/jobs/${country}/search/${page}`);
  url.searchParams.set("app_id", appId);
  url.searchParams.set("app_key", appKey);
  url.searchParams.set("what", what);
  if (where) url.searchParams.set("where", where);
  url.searchParams.set("results_per_page", "20");
  url.searchParams.set("content-type", "application/json");
  if (sortByDate) url.searchParams.set("sort_by", "date");
  if (sortByDate && maxDays) url.searchParams.set("max_days", maxDays);
  return url;
}

function buildSearchQuery(role: string, industry: string, specialisation: string, keywords: string) {
  const parts = [role, industry, specialisation, keywords]
    .map((item) => item.trim())
    .filter(Boolean);

  return Array.from(new Set(parts)).join(" ").replace(/\s+/g, " ").trim() || "support worker";
}

function mapAdzunaJob(job: AdzunaJob, index: number): MatchJob {
  const salary = formatSalary(job.salary_min, job.salary_max);
  const postedAgo = formatPostedAgo(job.created);
  const jobType = formatJobType(job.contract_time);

  return {
    id: job.id || `adzuna-${index}`,
    title: job.title || "Untitled role",
    company: job.company?.display_name || "Company not listed",
    logo: "💼",
    location: job.location?.display_name || "Location not listed",
    salary,
    type: postedAgo ? `${jobType} • ${postedAgo}` : jobType,
    postedAt: job.created || null,
    postedAgo,
    match: Math.max(72, 96 - index * 2),
    description: stripHtml(job.description || "No description provided."),
    tags: [job.category?.label, postedAgo, "Adzuna", "Live job"].filter(Boolean) as string[],
    applyUrl: job.redirect_url || null,
    contactEmail: null,
    applicationMethod: job.redirect_url ? "apply_link" : "unknown",
  };
}

function formatSalary(min?: number, max?: number) {
  if (min && max) return `$${Math.round(min).toLocaleString()}-$${Math.round(max).toLocaleString()}`;
  if (min) return `From $${Math.round(min).toLocaleString()}`;
  if (max) return `Up to $${Math.round(max).toLocaleString()}`;
  return "Salary not listed";
}

function formatJobType(type?: string) {
  if (!type) return "Job type not listed";
  return type.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
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

function cleanDetails(value: string) {
  const stripped = value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\{[^}]*\}/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!stripped || stripped.toLowerCase().includes("uh oh")) {
    return "Adzuna returned a bad request page. Retrying with a simpler query.";
  }

  return stripped.slice(0, 220);
}
