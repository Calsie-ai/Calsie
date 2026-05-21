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
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const role = searchParams.get("role") || "support worker";
  const location = searchParams.get("location") || "Sydney";
  const country = searchParams.get("country") || "au";

  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;

  if (!appId || !appKey) {
    return NextResponse.json({
      ok: true,
      source: "demo",
      message:
        "Adzuna keys are not set in Vercel yet. Returning demo jobs so the fetch flow still runs.",
      jobs: demoJobs,
    });
  }

  const url = new URL(`https://api.adzuna.com/v1/api/jobs/${country}/search/1`);
  url.searchParams.set("app_id", appId);
  url.searchParams.set("app_key", appKey);
  url.searchParams.set("what", role);
  url.searchParams.set("where", location);
  url.searchParams.set("results_per_page", "20");
  url.searchParams.set("content-type", "application/json");

  try {
    const response = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json(
        {
          ok: false,
          source: "adzuna",
          error: `Adzuna request failed: ${response.status}`,
          details: text.slice(0, 500),
          jobs: demoJobs,
        },
        { status: 200 }
      );
    }

    const data = await response.json();
    const jobs = (data.results || []).map(mapAdzunaJob);

    return NextResponse.json({
      ok: true,
      source: "adzuna",
      query: role,
      location,
      count: jobs.length,
      jobs: jobs.length ? jobs : demoJobs,
      message: jobs.length ? "Fetched live jobs from Adzuna." : "No Adzuna jobs found. Showing demo jobs.",
    });
  } catch (error: any) {
    return NextResponse.json({
      ok: false,
      source: "error",
      error: error?.message || "Unknown job fetch error",
      jobs: demoJobs,
    });
  }
}

function mapAdzunaJob(job: AdzunaJob, index: number) {
  const salary = formatSalary(job.salary_min, job.salary_max);

  return {
    id: job.id || `adzuna-${index}`,
    title: job.title || "Untitled role",
    company: job.company?.display_name || "Company not listed",
    logo: "💼",
    location: job.location?.display_name || "Location not listed",
    salary,
    type: formatJobType(job.contract_time),
    match: Math.max(72, 96 - index * 2),
    description: stripHtml(job.description || "No description provided."),
    tags: [job.category?.label, "Adzuna", "Live job"].filter(Boolean),
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

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}
