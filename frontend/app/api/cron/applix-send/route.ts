import { NextResponse } from "next/server";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://bnshgtrqbfuphhhdgccs.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const CRON_SECRET = process.env.CRON_SECRET || "";

type Campaign = {
  id: string;
  user_id?: string;
  outreach?: {
    enabled?: boolean;
    starts_at?: string;
    hourly_cap?: number;
    daily_cap?: number;
    campaign_days?: number;
    mode?: string;
    last_run_at?: string;
    [key: string]: unknown;
  } | null;
  status?: string | null;
};

function isAuthorized(req: Request) {
  if (!CRON_SECRET) return true;
  const authHeader = req.headers.get("authorization") || "";
  return authHeader === `Bearer ${CRON_SECRET}`;
}

function shouldRun(campaign: Campaign, now: Date) {
  const outreach = campaign.outreach || {};
  if (campaign.status !== "scheduled" && campaign.status !== "active") return false;
  if (outreach.enabled === false) return false;
  if (outreach.mode && outreach.mode !== "scheduled") return false;

  const startsAt = outreach.starts_at ? new Date(String(outreach.starts_at)) : now;
  if (Number.isNaN(startsAt.getTime()) || startsAt.getTime() > now.getTime()) return false;

  if (outreach.last_run_at) {
    const lastRunAt = new Date(String(outreach.last_run_at));
    if (!Number.isNaN(lastRunAt.getTime())) {
      const minutesSinceLastRun = (now.getTime() - lastRunAt.getTime()) / 60000;
      if (minutesSinceLastRun < 55) return false;
    }
  }

  return true;
}

async function supabaseFetch(path: string, options: RequestInit = {}) {
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY in Vercel environment variables.");
  }

  return fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "apikey": SUPABASE_SERVICE_ROLE_KEY,
      ...(options.headers || {}),
    },
  });
}

export async function GET(req: Request) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ ok: false, error: "Unauthorized cron request." }, { status: 401 });
    }

    const now = new Date();
    const campaignResponse = await supabaseFetch("/rest/v1/campaigns?select=id,user_id,status,outreach&status=in.(scheduled,active)&limit=25");
    const campaigns = (await campaignResponse.json().catch(() => [])) as Campaign[];

    if (!campaignResponse.ok) {
      return NextResponse.json({ ok: false, error: "Could not load scheduled campaigns.", details: campaigns }, { status: campaignResponse.status });
    }

    const dueCampaigns = campaigns.filter((campaign) => shouldRun(campaign, now));
    const results = [];

    for (const campaign of dueCampaigns) {
      const outreach = campaign.outreach || {};
      const batchSize = Math.max(1, Math.min(50, Number(outreach.hourly_cap || 10)));

      const launchResponse = await fetch(`${SUPABASE_URL}/functions/v1/launch-applix-test`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "apikey": SUPABASE_SERVICE_ROLE_KEY,
        },
        body: JSON.stringify({
          campaign_id: campaign.id,
          target_email_count: batchSize,
          user_identifier: campaign.user_id,
          scheduled_run: true,
        }),
      });

      const launchData = await launchResponse.json().catch(() => ({}));
      const updatedOutreach = {
        ...outreach,
        last_run_at: now.toISOString(),
        last_run_ok: Boolean(launchResponse.ok && launchData?.ok),
        last_run_result: launchData,
      };

      await supabaseFetch(`/rest/v1/campaigns?id=eq.${encodeURIComponent(campaign.id)}`, {
        method: "PATCH",
        headers: { "Prefer": "return=minimal" },
        body: JSON.stringify({ outreach: updatedOutreach }),
      });

      results.push({
        campaign_id: campaign.id,
        ok: Boolean(launchResponse.ok && launchData?.ok),
        status: launchResponse.status,
        result: launchData,
      });
    }

    return NextResponse.json({
      ok: true,
      checked: campaigns.length,
      due: dueCampaigns.length,
      results,
      ran_at: now.toISOString(),
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Scheduled sender failed." }, { status: 500 });
  }
}
