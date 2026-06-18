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
};

type AdzunaJob = {
  id?: string;
  title?: string;
  company?: { display_name?: string };
  location?: { display_name?: string };
  redirect_url?: string;
  description?: string;
  created?: string;
};

function cleanText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

async function getUserId(accessToken: string) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: SUPABASE_ANON_KEY,
    },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.id) {
    throw new Error("Could not verify the signed-in Supabase user.");
  }

  return data.id as string;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as FetchJobsBody;
    const accessToken = body.access_token;
    const role = cleanText(body.role, "support worker");
    const location = cleanText(body.location, "Sydney NSW");

    if (!accessToken) {
      return NextResponse.json({ ok: false, error: "Missing access token. Please sign in again." }, { status: 401 });
    }

    if (!SUPABASE_ANON_KEY) {
      return NextResponse.json({ ok: false, error: "Missing NEXT_PUBLIC_SUPABASE_ANON_KEY." }, { status: 500 });
    }

    if (!ADZUNA_APP_ID || !ADZUNA_APP_KEY) {
      return NextResponse.json({
        ok: false,
        error: "Missing ADZUNA_APP_ID or ADZUNA_APP_KEY in Vercel environment variables. Add them, redeploy, then click Fetch real jobs again.",
      }, { status: 500 });
    }

    const userId = await getUserId(accessToken);
    const params = new URLSearchParams({
      app_id: ADZUNA_APP_ID,
      app_key: ADZUNA_APP_KEY,
      results_per_page: "25",
      what: role,
      where: location,
      sort_by: "date",
    });

    const jobsResponse = await fetch(`https://api.adzuna.com/v1/api/jobs/au/search/1?${params.toString()}`, { cache: "no-store" });
    const jobsPayload = await jobsResponse.json().catch(() => null);

    if (!jobsResponse.ok) {
      return NextResponse.json({ ok: false, error: "Job provider rejected the request.", details: jobsPayload }, { status: jobsResponse.status });
    }

    const rows = ((jobsPayload?.results || []) as AdzunaJob[]).map((job) => ({
      user_id: userId,
      title: cleanText(job.title, "Untitled job"),
      company: cleanText(job.company?.display_name, "Unknown company"),
      location: cleanText(job.location?.display_name, location),
      source: "Adzuna",
      apply_url: cleanText(job.redirect_url),
      description: cleanText(job.description),
      posted_at: cleanText(job.created),
      status: "new",
    }));

    if (rows.length === 0) {
      return NextResponse.json({ ok: true, count: 0, saved: true, jobs: [] });
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
        ok: true,
        count: rows.length,
        saved: false,
        error: "Fetched jobs, but could not save them into Supabase. Make sure the jobs table exists and RLS allows inserts for signed-in users.",
        details: savedData,
        jobs: rows,
      });
    }

    return NextResponse.json({ ok: true, count: rows.length, saved: true, jobs: savedData || rows });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not fetch jobs." }, { status: 500 });
  }
}
