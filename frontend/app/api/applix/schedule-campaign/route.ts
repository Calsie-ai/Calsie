import { NextResponse } from "next/server";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://bnshgtrqbfuphhhdgccs.supabase.co";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

type ScheduleBody = {
  access_token?: string;
  campaign_id?: string;
  enabled?: boolean;
  starts_at?: string;
  timezone?: string;
  daily_cap?: number;
  hourly_cap?: number;
  campaign_days?: number;
};

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return fallback;
  return Math.max(min, Math.min(max, Math.round(numberValue)));
}

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
    const startsAt = body.starts_at || new Date().toISOString();
    const dailyCap = clampNumber(body.daily_cap, 1, 200, 25);
    const hourlyCap = clampNumber(body.hourly_cap, 1, 50, 10);
    const campaignDays = clampNumber(body.campaign_days, 1, 90, 14);

    const schedule = {
      enabled,
      starts_at: startsAt,
      timezone: body.timezone || "Australia/Sydney",
      daily_cap: dailyCap,
      hourly_cap: hourlyCap,
      campaign_days: campaignDays,
      mode: "scheduled",
      updated_at: new Date().toISOString(),
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
        outreach: schedule,
      }),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      return NextResponse.json({ ok: false, error: "Could not save schedule.", details: data }, { status: response.status });
    }

    return NextResponse.json({ ok: true, schedule, campaign: Array.isArray(data) ? data[0] : data });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not schedule campaign." }, { status: 500 });
  }
}
