import { NextResponse } from "next/server";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://bnshgtrqbfuphhhdgccs.supabase.co";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const ADZUNA_APP_ID = process.env.ADZUNA_APP_ID || "";
const ADZUNA_APP_KEY = process.env.ADZUNA_APP_KEY || "";

type FetchJobsBody = {
  access_token?: string;
  role?: string;
  location?: string;
  campaign_id?: string;
};

type AdzunaJob = {
  id?: string;
  title?: string;
  company?: { display_name?: string };
  location?: { display_name?: string };
  redirect_url?: string;
  description?: string;
  created?: string;
  salary_min?: number;
  salary_max?: number;
  category?: { label?: string; tag?: string };
};

function cleanText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function compactLocation(value: string) {
  return cleanText(value, "Sydney NSW").replace(/,+/g, ",").replace(/\s+/g, " ").trim();
}

function jobKey(job: { source_job_id?: string; apply_url?: string; title?: string; company?: string }) {
  if (job.source_job_id) return `id:${job.source_job_id}`;
  if (job.apply_url) return `url:${job.apply_url}`;
  return `text:${cleanText(job.title).toLowerCase()}::${cleanText(job.company).toLowerCase()}`;
}

async function getUserId(accessToken: string) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: SUPABASE_ANON_KEY,
    },
    cache: "no-store",
  });

  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.id) {
    throw new Error("Could not verify the signed-in Supabase user.");
  }

  return data.id as string;
}

async function loadExistingKeys(accessToken: string, userId: string, campaignId: string) {
  const params = new URLSearchParams({
    select: "source_job_id,apply_url,title,company",
    user_id: `eq.${userId}`,
    campaign_id: `eq.${campaignId}`,
    limit: "1000",
  });

  const response = await fetch(`${SUPABASE_URL}/rest/v1/jobs?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: SUPABASE_ANON_KEY,
    },
    cache: "no-store",
  });

  const data = await response.json().catch(() => []);
  if (!response.ok) throw new Error(`Could not check existing jobs: ${JSON.stringify(data).slice(0, 220)}`);

  return new Set((Array.isArray(data) ? data : []).map((job) => jobKey(job)).filter(Boolean));
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as FetchJobsBody;
    const accessToken = body.access_token;
    const role = cleanText(body.role, "support worker");
    const location = compactLocation(body.location || "Sydney NSW");
    const campaignId = cleanText(body.campaign_id);

    if (!accessToken) {
      return NextResponse.json({ ok: false, error: "Missing access token. Please sign in again." }, { status: 401 });
    }

    if (!campaignId) {
      return NextResponse.json({ ok: false, error: "Missing campaign_id. Create or load the saved campaign first." }, { status: 400 });
    }

    if (!SUPABASE_ANON_KEY) {
      return NextResponse.json({ ok: false, error: "Missing NEXT_PUBLIC_SUPABASE_ANON_KEY." }, { status: 500 });
    }

    if (!ADZUNA_APP_ID || !ADZUNA_APP_KEY) {
      return NextResponse.json({ ok: false, error: "Missing ADZUNA_APP_ID or ADZUNA_APP_KEY in Vercel environment variables." }, { status: 500 });
    }

    const userId = await getUserId(accessToken);
    const params = new URLSearchParams({
      app_id: ADZUNA_APP_ID,
      app_key: ADZUNA_APP_KEY,
      results_per_page: "50",
      what: role,
      where: location,
      sort_by: "date",
    });

    const jobsResponse = await fetch(`https://api.adzuna.com/v1/api/jobs/au/search/1?${params.toString()}`, { cache: "no-store" });
    const jobsPayload = await jobsResponse.json().catch(() => null);

    if (!jobsResponse.ok) {
      return NextResponse.json({ ok: false, error: `Job provider rejected the request with HTTP ${jobsResponse.status}.`, details: jobsPayload }, { status: jobsResponse.status });
    }

    const existingKeys = await loadExistingKeys(accessToken, userId, campaignId);
    const rows = ((jobsPayload?.results || []) as AdzunaJob[])
      .map((job) => ({
        user_id: userId,
        campaign_id: campaignId,
        source_job_id: cleanText(job.id),
        title: cleanText(job.title, "Untitled job"),
        company: cleanText(job.company?.display_name, "Unknown company"),
        location: cleanText(job.location?.display_name, location),
        source: "Adzuna",
        apply_url: cleanText(job.redirect_url),
        description: cleanText(job.description),
        posted_at: cleanText(job.created) || null,
        status: "new",
        search_query: `${role} ${location}`,
        category: cleanText(job.category?.label || job.category?.tag),
        salary_min: Number.isFinite(job.salary_min) ? Math.round(Number(job.salary_min)) : null,
        salary_max: Number.isFinite(job.salary_max) ? Math.round(Number(job.salary_max)) : null,
        raw_payload: job,
        fetched_at: new Date().toISOString(),
      }))
      .filter((job) => job.title !== "Untitled job" || job.company !== "Unknown company")
      .filter((job) => !existingKeys.has(jobKey(job)));

    if (rows.length === 0) {
      return NextResponse.json({ ok: true, count: ((jobsPayload?.results || []) as AdzunaJob[]).length || 0, inserted_count: 0, duplicate_count: ((jobsPayload?.results || []) as AdzunaJob[]).length || 0, saved: true, jobs: [] });
    }

    const saveResponse = await fetch(`${SUPABASE_URL}/rest/v1/jobs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        apikey: SUPABASE_ANON_KEY,
        Prefer: "return=representation",
      },
      body: JSON.stringify(rows),
    });

    const savedData = await saveResponse.json().catch(() => null);

    if (!saveResponse.ok) {
      return NextResponse.json({
        ok: false,
        count: rows.length,
        inserted_count: 0,
        saved: false,
        error: `Fetched jobs, but Supabase rejected the save with HTTP ${saveResponse.status}.`,
        details: savedData,
        jobs: rows,
      }, { status: saveResponse.status });
    }

    return NextResponse.json({ ok: true, count: rows.length, inserted_count: Array.isArray(savedData) ? savedData.length : rows.length, duplicate_count: ((jobsPayload?.results || []) as AdzunaJob[]).length - rows.length, saved: true, jobs: savedData || rows });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not fetch jobs." }, { status: 500 });
  }
}
