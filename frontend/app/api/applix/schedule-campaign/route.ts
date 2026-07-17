import { NextResponse } from "next/server";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://bnshgtrqbfuphhhdgccs.supabase.co";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const LAUNCH_FUNCTION_NAME = process.env.APPLIX_LAUNCH_FUNCTION || "launch-applix-campaign";
const REQUIRE_PAYMENT = process.env.APPLIX_REQUIRE_PAYMENT === "true";

const DAILY_JOB_LIMIT = 24;
const DAILY_EMAIL_LIMIT = 24;
const HOURLY_EMAIL_LIMIT = 1;
const CAMPAIGN_DAYS = 30;
const TOTAL_CAP = 720;

type ScheduleBody = {
  access_token?: string;
  campaign_id?: string;
  enabled?: boolean;
};

type CampaignRow = {
  id?: string;
  status?: string;
  outreach?: Record<string, unknown> | null;
  created_at?: string;
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
  return response.json().catch(() => null) as Promise<{ id?: string; email?: string } | null>;
}

function isActiveSubscription(status?: string | null) {
  return status === "active" || status === "trialing";
}

async function hasActivePayment(accessToken: string, userId: string) {
  if (!REQUIRE_PAYMENT) return true;

  const response = await fetch(`${SUPABASE_URL}/rest/v1/applix_subscriptions?user_id=eq.${encodeURIComponent(userId)}&select=status`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: SUPABASE_ANON_KEY,
    },
    cache: "no-store",
  });

  if (!response.ok) return false;
  const rows = await response.json().catch(() => []);
  const subscription = Array.isArray(rows) ? rows[0] : null;
  return isActiveSubscription(subscription?.status);
}

async function getCampaign(accessToken: string, userId: string, campaignId: string) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/campaigns?id=eq.${encodeURIComponent(campaignId)}&user_id=eq.${encodeURIComponent(userId)}&select=id,status,outreach,created_at`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: SUPABASE_ANON_KEY,
    },
    cache: "no-store",
  });

  if (!response.ok) return null;
  const rows = await response.json().catch(() => []);
  return (Array.isArray(rows) ? rows[0] : null) as CampaignRow | null;
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

    const currentUser = await getCurrentUser(accessToken);

    if (!currentUser?.id) {
      return NextResponse.json({ ok: false, error: "Could not verify the signed-in user." }, { status: 401 });
    }

    if (body.enabled === false) {
      const pauseResponse = await fetch(`${SUPABASE_URL}/rest/v1/campaigns?id=eq.${encodeURIComponent(campaignId)}&user_id=eq.${encodeURIComponent(currentUser.id)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          apikey: SUPABASE_ANON_KEY,
          Prefer: "return=representation",
        },
        body: JSON.stringify({ status: "paused" }),
      });

      const pauseData = await pauseResponse.json().catch(() => null);
      if (!pauseResponse.ok) {
        return NextResponse.json({ ok: false, error: "Could not pause campaign.", details: pauseData }, { status: pauseResponse.status });
      }

      return NextResponse.json({ ok: true, campaign: Array.isArray(pauseData) ? pauseData[0] : pauseData, agent_run: null });
    }

    if (REQUIRE_PAYMENT && !(await hasActivePayment(accessToken, currentUser.id))) {
      return NextResponse.json({
        ok: false,
        code: "payment_required",
        error: "Payment required. Please activate Applix Pro before starting the agent.",
      }, { status: 402 });
    }

    const existingCampaign = await getCampaign(accessToken, currentUser.id, campaignId);
    if (!existingCampaign?.id) {
      return NextResponse.json({ ok: false, error: "Campaign not found." }, { status: 404 });
    }

    const existingOutreach = existingCampaign.outreach || {};
    const startedAt = typeof existingOutreach.started_at === "string" && existingOutreach.started_at
      ? existingOutreach.started_at
      : new Date().toISOString();

    const nextOutreach = {
      ...existingOutreach,
      scheduled: true,
      active: true,
      started_at: startedAt,
      campaign_days: CAMPAIGN_DAYS,
      daily_job_limit: DAILY_JOB_LIMIT,
      daily_email_limit: DAILY_EMAIL_LIMIT,
      hourly_email_limit: HOURLY_EMAIL_LIMIT,
      daily_cap: DAILY_EMAIL_LIMIT,
      hourly_cap: HOURLY_EMAIL_LIMIT,
      total_cap: TOTAL_CAP,
      require_email: true,
      require_user_approval: true,
      approval_mode: "Ask me before applying",
      test_mode: false,
    };

    const campaignPatchResponse = await fetch(`${SUPABASE_URL}/rest/v1/campaigns?id=eq.${encodeURIComponent(campaignId)}&user_id=eq.${encodeURIComponent(currentUser.id)}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        apikey: SUPABASE_ANON_KEY,
        Prefer: "return=representation",
      },
      body: JSON.stringify({ status: "active", outreach: nextOutreach }),
    });

    const campaignData = await campaignPatchResponse.json().catch(() => null);
    if (!campaignPatchResponse.ok) {
      return NextResponse.json({ ok: false, error: "Could not apply campaign limits.", details: campaignData }, { status: campaignPatchResponse.status });
    }

    const updatedCampaign = Array.isArray(campaignData) ? campaignData[0] : campaignData;

    const launchResponse = await fetch(`${SUPABASE_URL}/functions/v1/${LAUNCH_FUNCTION_NAME}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        campaign_id: campaignId,
        results_limit: DAILY_JOB_LIMIT,
        queue_limit: DAILY_JOB_LIMIT,
        target_email_count: DAILY_EMAIL_LIMIT,
        hourly_email_limit: HOURLY_EMAIL_LIMIT,
        daily_email_limit: DAILY_EMAIL_LIMIT,
        campaign_days: CAMPAIGN_DAYS,
        total_cap: TOTAL_CAP,
        min_lead_score: 70,
        exact_private_company_only: true,
      }),
      cache: "no-store",
    });

    const launchData = await launchResponse.json().catch(() => null);

    if (!launchResponse.ok || launchData?.ok === false) {
      return NextResponse.json({
        ok: false,
        error: launchData?.error || "Could not start Applix production launcher.",
        details: launchData,
      }, { status: launchResponse.status || 502 });
    }

    return NextResponse.json({
      ok: true,
      outreach: nextOutreach,
      campaign: updatedCampaign,
      agent_run: launchData,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not start campaign." }, { status: 500 });
  }
}
