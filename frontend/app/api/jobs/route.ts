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

      const jobs = (result.data.results || []).map(mapAdzunaJob);

      if (!jobs.length) {
        errors.push(`${attempt.label}: no jobs returned`);
        continue;
      }

      return NextResponse.json({
        ok: true,
        source: "adzuna",
        query: attempt.label === "profile query" ? searchQuery : simpleQuery,
        attemptedQuery: searchQuery,
        role,
        industry,
        specialisation,
        keywords,
        location,
        page: attempt.url.pathname.split("/").pop() || page,
        maxDays,
        count: jobs.length,
        jobs,
        message: `Fetched ${jobs.length} live jobs from Adzuna using ${attempt.label}.`,
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

function mapAdzunaJob(job: AdzunaJob, index: number) {
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
    tags: [job.category?.label, postedAgo, "Adzuna", "Live job"].filter(Boolean),
    applyUrl: job.redirect_url || null,
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
