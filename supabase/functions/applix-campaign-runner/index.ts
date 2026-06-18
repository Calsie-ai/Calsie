import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "https://bnshgtrqbfuphhhdgccs.supabase.co";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("APPLIX_SERVICE_ROLE_KEY") || "";
const CRON_SECRET = Deno.env.get("APPLIX_CRON_SECRET") || Deno.env.get("CRON_SECRET") || "";

type Campaign = {
  id: string;
  user_id?: string | null;
  status?: string | null;
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
};

const jsonHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: jsonHeaders });
}

function isAuthorized(req: Request) {
  if (!CRON_SECRET) return true;
  const authHeader = req.headers.get("authorization") || "";
  const cronHeader = req.headers.get("x-applix-cron-secret") || "";
  return authHeader === `Bearer ${CRON_SECRET}` || cronHeader === CRON_SECRET;
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
  if (!SERVICE_ROLE_KEY) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY in Supabase Edge Function secrets.");

  return fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
      "apikey": SERVICE_ROLE_KEY,
      ...(options.headers || {}),
    },
  });
}

async function runCampaign(campaign: Campaign, now: Date) {
  const outreach = campaign.outreach || {};
  const batchSize = Math.max(1, Math.min(50, Number(outreach.hourly_cap || 10)));

  const launchResponse = await fetch(`${SUPABASE_URL}/functions/v1/launch-applix-test`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
      "apikey": SERVICE_ROLE_KEY,
    },
    body: JSON.stringify({
      campaign_id: campaign.id,
      target_email_count: batchSize,
      user_identifier: campaign.user_id,
      scheduled_run: true,
      runner: "applix-campaign-runner",
    }),
  });

  const launchData = await launchResponse.json().catch(() => ({}));
  const ok = Boolean(launchResponse.ok && launchData?.ok);
  const updatedOutreach = {
    ...outreach,
    last_run_at: now.toISOString(),
    last_run_ok: ok,
    last_run_result: launchData,
  };

  const patchResponse = await supabaseFetch(`/rest/v1/campaigns?id=eq.${encodeURIComponent(campaign.id)}`, {
    method: "PATCH",
    headers: { "Prefer": "return=minimal" },
    body: JSON.stringify({ outreach: updatedOutreach }),
  });

  return {
    campaign_id: campaign.id,
    ok,
    status: launchResponse.status,
    patch_ok: patchResponse.ok,
    result: launchData,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: jsonHeaders });

  try {
    if (!isAuthorized(req)) return json({ ok: false, error: "Unauthorized cron request." }, 401);
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ ok: false, error: "Missing Supabase service configuration." }, 500);

    const now = new Date();
    const campaignResponse = await supabaseFetch("/rest/v1/campaigns?select=id,user_id,status,outreach&status=in.(scheduled,active)&limit=25");
    const campaigns = (await campaignResponse.json().catch(() => [])) as Campaign[];

    if (!campaignResponse.ok) {
      return json({ ok: false, error: "Could not load scheduled campaigns.", details: campaigns }, campaignResponse.status);
    }

    const dueCampaigns = campaigns.filter((campaign) => shouldRun(campaign, now));
    const results = [];

    for (const campaign of dueCampaigns) {
      results.push(await runCampaign(campaign, now));
    }

    return json({
      ok: true,
      function: "applix-campaign-runner",
      checked: campaigns.length,
      due: dueCampaigns.length,
      results,
      ran_at: now.toISOString(),
    });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : "Campaign runner failed." }, 500);
  }
});
