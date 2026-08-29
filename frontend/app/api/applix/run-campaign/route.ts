import { NextResponse } from "next/server";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://bnshgtrqbfuphhhdgccs.supabase.co";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

const DAILY_JOB_LIMIT = 24;

type RunBody = {
  access_token?: string;
  campaign_id?: string;
};

async function getCurrentUser(accessToken: string) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: SUPABASE_ANON_KEY,
    },
    cache: "no-store",
  });

  if (!response.ok) return null;
  return response.json().catch(() => null) as Promise<{ id?: string } | null>;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as RunBody;
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

    const user = await getCurrentUser(accessToken);
    if (!user?.id) {
      return NextResponse.json({ ok: false, error: "Could not verify the signed-in user." }, { status: 401 });
    }

    const campaignResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/campaigns?id=eq.${encodeURIComponent(campaignId)}&user_id=eq.${encodeURIComponent(user.id)}&select=id,status`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: SUPABASE_ANON_KEY,
        },
        cache: "no-store",
      },
    );

    const campaigns = await campaignResponse.json().catch(() => []);
    const campaign = Array.isArray(campaigns) ? campaigns[0] : null;
    if (!campaignResponse.ok || !campaign?.id) {
      return NextResponse.json({ ok: false, error: "Campaign not found." }, { status: 404 });
    }
    if (!["active", "launched", "scheduled"].includes(String(campaign.status || "").toLowerCase())) {
      return NextResponse.json({ ok: false, error: "Resume the campaign before finding new jobs." }, { status: 409 });
    }

    const runType = `manual_refresh_${Date.now()}`;
    const launchResponse = await fetch(`${SUPABASE_URL}/functions/v1/launch-applix-campaign`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        campaign_id: campaignId,
        daily_job_limit: DAILY_JOB_LIMIT,
        run_type: runType,
        trigger: "manual_refresh",
      }),
      cache: "no-store",
    });

    const result = await launchResponse.json().catch(() => null);
    if (!launchResponse.ok || result?.ok === false) {
      return NextResponse.json(
        { ok: false, error: result?.error || "Could not find new jobs.", details: result },
        { status: launchResponse.status || 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      run_type: runType,
      sends_emails_now: false,
      result,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Could not run campaign." },
      { status: 500 },
    );
  }
}
