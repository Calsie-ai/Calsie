import { NextResponse } from "next/server";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://bnshgtrqbfuphhhdgccs.supabase.co";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

type ScheduleBody = {
  access_token?: string;
  campaign_id?: string;
  enabled?: boolean;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as ScheduleBody;
    const accessToken = body.access_token;
    const campaignId = body.campaign_id;

    if (!accessToken) {
      return NextResponse.json({ ok: false, error: "Missing access token. Please sign in again." }, { status: 401 });
    }

    if (!campaignId) {
      return NextResponse.json({ ok: false, error: "Missing campaign_id." }, { status: 400 });
    }

    if (!SUPABASE_ANON_KEY) {
      return NextResponse.json({ ok: false, error: "Missing NEXT_PUBLIC_SUPABASE_ANON_KEY." }, { status: 500 });
    }

    const enabled = body.enabled !== false;
    const now = new Date().toISOString();

    const outreach = {
      enabled,
      mode: "applix_default",
      starts_at: now,
      timezone: "Australia/Sydney",
      daily_job_target: 100,
      send_strategy: "qualified_count_divided_by_24_hours",
      daily_email_cap: "qualified_leads_only",
      updated_at: now,
    };

    const response = await fetch(`${SUPABASE_URL}/rest/v1/campaigns?id=eq.${encodeURIComponent(campaignId)}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`,
        "apikey": SUPABASE_ANON_KEY,
        "Prefer": "return=representation",
      },
      body: JSON.stringify({
        status: enabled ? "scheduled" : "paused",
        outreach,
      }),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      return NextResponse.json({ ok: false, error: "Could not start campaign.", details: data }, { status: response.status });
    }

    return NextResponse.json({ ok: true, outreach, campaign: Array.isArray(data) ? data[0] : data });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not start campaign." }, { status: 500 });
  }
}
