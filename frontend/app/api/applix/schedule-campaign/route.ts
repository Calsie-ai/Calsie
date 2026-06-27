import { NextResponse } from "next/server";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://bnshgtrqbfuphhhdgccs.supabase.co";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const AGENT_FUNCTION_NAME = process.env.APPLIX_AGENT_FUNCTION || "applix-agent-orchestrator";
const REQUIRE_PAYMENT = process.env.APPLIX_REQUIRE_PAYMENT !== "false";

type ScheduleBody = {
  access_token?: string;
  campaign_id?: string;
  enabled?: boolean;
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
    const senderUserIdentifier = currentUser?.email || currentUser?.id || null;
    const enabled = body.enabled !== false;

    if (enabled && REQUIRE_PAYMENT) {
      if (!currentUser?.id || !(await hasActivePayment(accessToken, currentUser.id))) {
        return NextResponse.json({
          ok: false,
          code: "payment_required",
          error: "Payment required. Please activate Applix Pro before starting the agent.",
        }, { status: 402 });
      }
    }

    const now = new Date().toISOString();

    const outreach = {
      enabled,
      mode: "applix_agent",
      starts_at: now,
      launched_at: enabled ? now : null,
      timezone: "Australia/Sydney",
      agent_days: 10,
      daily_job_limit: 100,
      hourly_limit: 4,
      test_mode: true,
      sender_user_identifier: senderUserIdentifier,
      first_agent_triggered_at: enabled ? now : null,
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
        status: enabled ? "launched" : "paused",
        outreach,
      }),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      return NextResponse.json({ ok: false, error: "Could not start campaign.", details: data }, { status: response.status });
    }

    let agentRun = null;

    if (enabled) {
      const edgeResponse = await fetch(`${SUPABASE_URL}/functions/v1/${AGENT_FUNCTION_NAME}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`,
          "apikey": SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          campaign_id: campaignId,
          test_mode: true,
          agent_days: 10,
          daily_job_limit: 100,
          hourly_email_limit: 4,
          sender_user_identifier: senderUserIdentifier,
          max_campaigns: 1,
          trigger: "start_campaign_ui",
        }),
        cache: "no-store",
      });

      agentRun = await edgeResponse.json().catch(() => null);

      if (!edgeResponse.ok || agentRun?.ok === false) {
        return NextResponse.json({
          ok: false,
          error: agentRun?.error || "Campaign was launched, but the first agent run failed.",
          campaign: Array.isArray(data) ? data[0] : data,
          outreach,
          agent_run: agentRun,
        }, { status: 502 });
      }
    }

    return NextResponse.json({ ok: true, outreach, campaign: Array.isArray(data) ? data[0] : data, agent_run: agentRun });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not start campaign." }, { status: 500 });
  }
}
