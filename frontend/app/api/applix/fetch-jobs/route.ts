import { NextResponse } from "next/server";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://bnshgtrqbfuphhhdgccs.supabase.co";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const EDGE_FUNCTION_NAME = process.env.OUTSCRAPER_JOBS_FUNCTION || "outscraper-jobs";

type FetchJobsBody = {
  access_token?: string;
  role?: string;
  location?: string;
  campaign_id?: string;
};

function cleanText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as FetchJobsBody;
    const token = body.access_token;
    const role = cleanText(body.role, "support worker");
    const location = cleanText(body.location, "Sydney NSW");
    const campaignId = cleanText(body.campaign_id);

    if (!token) {
      return NextResponse.json({ ok: false, error: "Missing session. Please sign in again." }, { status: 401 });
    }

    if (!SUPABASE_ANON_KEY) {
      return NextResponse.json({ ok: false, error: "Missing Supabase anon key." }, { status: 500 });
    }

    const response = await fetch(`${SUPABASE_URL}/functions/v1/${EDGE_FUNCTION_NAME}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
        "apikey": SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ role, location, ...(campaignId ? { campaign_id: campaignId } : {}) }),
      cache: "no-store",
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      return NextResponse.json({ ok: false, error: data?.error || "Outscraper Edge Function could not fetch jobs.", details: data }, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not fetch jobs." }, { status: 500 });
  }
}
