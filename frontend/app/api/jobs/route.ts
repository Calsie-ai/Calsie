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
  url.searchParams.set("results_per_page", "50");
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
          jobs: [],
        },
        { status: 200 }
      );
    }

    const data = await response.json();
    const allJobs = (data.results || []).map(mapAdzunaJob);
    const jobsWithEmail = allJobs.filter((job: any) => Boolean(job.contactEmail)).slice(0, 20);

    return NextResponse.json({
      ok: true,
      source: "adzuna",
      query: role,
      location,
      count: jobsWithEmail.length,
      total_checked: allJobs.length,
      jobs: jobsWithEmail,
      message: jobsWithEmail.length
        ? `Fetched ${jobsWithEmail.length} Adzuna jobs with hiring emails.`
        : "No Adzuna jobs with hiring email found. Try another role/location or use Visit jobsite.",
    });
  } catch (error: any) {
    return NextResponse.json({
      ok: false,
      source: "error",
      error: error?.message || "Unknown job fetch error",
      jobs: [],
    });
  }
}

function mapAdzunaJob(job: AdzunaJob, index: number) {
  const salary = formatSalary(job.salary_min, job.salary_max);
  const cleanDescription = stripHtml(job.description || "No description provided.");
  const contactEmail = extractEmail(cleanDescription);

  return {
    id: job.id || `adzuna-${index}`,
    title: job.title || "Untitled role",
    company: job.company?.display_name || "Company not listed",
    logo: "💼",
    location: job.location?.display_name || "Location not listed",
    salary,
    type: formatJobType(job.contract_time),
    match: Math.max(72, 96 - index * 2),
    description: cleanDescription,
    tags: [job.category?.label, "Adzuna", "Hiring email", "Live job"].filter(Boolean),
    applyUrl: job.redirect_url || null,
    contactEmail,
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

function extractEmail(value: string) {
  const match = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0] : null;
}
