import { serve } from "std/http/server.ts";
import { createClient } from "supabase";

type Row = Record<string, unknown>;

const FUNCTION_NAME = "applix-daily-job-fetcher";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
const ACTIVE_STATUSES = ["active", "launched", "scheduled"];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret, x-applix-cron-secret",
};

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

function text(value: unknown) {
  return value == null ? "" : String(value).trim();
}

function bool(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return ["true", "1", "yes"].includes(value.toLowerCase());
  return fallback;
}

function authorized(req: Request) {
  const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const headerSecret = req.headers.get("x-cron-secret") || req.headers.get("x-applix-cron-secret") || "";
  return Boolean((SERVICE_KEY && bearer === SERVICE_KEY) || (CRON_SECRET && (bearer === CRON_SECRET || headerSecret === CRON_SECRET)));
}

function outreachObject(value: unknown): Row {
  return value && typeof value === "object" ? value as Row : {};
}

function campaignEligible(campaign: Row) {
  const status = text(campaign.status).toLowerCase();
  const outreach = outreachObject(campaign.outreach);
  return ACTIVE_STATUSES.includes(status) && outreach.active !== false && outreach.scheduled !== false;
}

async function runCampaign(campaignId: string, dailyTarget: number) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/calsie-campaign-orchestrator-v2`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-applix-cron-secret": CRON_SECRET,
    },
    body: JSON.stringify({
      campaign_id: campaignId,
      allowed_campaign_id: campaignId,
      dry_run: false,
      trigger: "scheduled_daily",
      daily_target: dailyTarget,
    }),
  });

  const raw = await response.text().catch(() => "");
  let payload: unknown = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = { raw };
  }

  return { ok: response.ok && (payload as Row)?.ok !== false, status: response.status, payload };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "POST") return reply({ ok: false, error: "Use POST" }, 405);
    if (!SUPABASE_URL || !SERVICE_KEY || !CRON_SECRET) return reply({ ok: false, error: "Missing daily dispatcher configuration" }, 500);
    if (!authorized(req)) return reply({ ok: false, function: FUNCTION_NAME, error: "Unauthorized internal scheduler request" }, 401);

    const input = await req.json().catch(() => ({})) as Row;
    const onlyCampaignId = text(input.campaign_id);
    const inspectOnly = bool(input.inspect_only, false);
    const force = bool(input.force, false);
    const today = new Date().toISOString().slice(0, 10);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    let query = admin.from("campaigns").select("id,status,outreach,search,updated_at");
    query = onlyCampaignId ? query.eq("id", onlyCampaignId) : query.in("status", ACTIVE_STATUSES);
    const campaignsResult = await query;
    if (campaignsResult.error) throw new Error(campaignsResult.error.message);

    const results: Row[] = [];
    let executed = 0;
    let skipped = 0;
    let failed = 0;

    for (const campaign of campaignsResult.data || []) {
      const outreach = outreachObject(campaign.outreach);
      const search = outreachObject(campaign.search);
      const dailyTarget = Math.max(1, Math.min(24, Number(search.daily_job_limit || outreach.daily_job_limit || 24)));

      if (!campaignEligible(campaign)) {
        skipped += 1;
        results.push({ campaign_id: campaign.id, skipped: true, reason: "campaign_not_active_or_scheduled" });
        continue;
      }

      const existingRun = await admin
        .from("orchestrator_runs")
        .select("id,status")
        .eq("campaign_id", campaign.id)
        .eq("run_date", today)
        .eq("run_type", "daily_catalogue")
        .maybeSingle();

      if (existingRun.error) throw new Error(existingRun.error.message);
      if (!force && existingRun.data?.id) {
        skipped += 1;
        results.push({ campaign_id: campaign.id, skipped: true, reason: "daily_run_already_exists", run: existingRun.data });
        continue;
      }

      if (inspectOnly) {
        results.push({ campaign_id: campaign.id, inspected: true, would_run: true, daily_target: dailyTarget });
        continue;
      }

      executed += 1;
      const run = await runCampaign(campaign.id, dailyTarget);
      if (!run.ok) failed += 1;
      results.push({ campaign_id: campaign.id, ...run });

      await admin.from("campaigns").update({
        updated_at: new Date().toISOString(),
        outreach: {
          ...outreach,
          last_daily_fetch_at: new Date().toISOString(),
          last_daily_fetch_result: { ok: run.ok, status: run.status },
        },
      }).eq("id", campaign.id);
    }

    return reply({
      ok: failed === 0,
      function: FUNCTION_NAME,
      version: "ai_orchestrator_dispatcher_v1",
      campaigns_queried: campaignsResult.data?.length || 0,
      executed_count: executed,
      skipped_count: skipped,
      failed_count: failed,
      results,
    }, failed === 0 ? 200 : 207);
  } catch (error) {
    return reply({
      ok: false,
      function: FUNCTION_NAME,
      version: "ai_orchestrator_dispatcher_v1",
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});