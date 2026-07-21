import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type Row = Record<string, unknown>;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("APPLIX_SERVICE_ROLE_KEY") || "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

function integer(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.floor(parsed))) : fallback;
}

async function runOrchestrator(campaignId: string, input: Row, admin: ReturnType<typeof createClient>) {
  const runType = text(input.run_type) || `campaign_launch_${Date.now()}`;
  const trigger = text(input.trigger) || "campaign_launch";

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/calsie-campaign-orchestrator-v3`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-applix-cron-secret": CRON_SECRET,
      },
      body: JSON.stringify({
        campaign_id: campaignId,
        allowed_campaign_id: campaignId,
        dry_run: false,
        run_type: runType,
        trigger,
        daily_target: integer(input.daily_job_limit ?? input.results_limit, 24, 1, 24),
        catalogue_age_days: integer(input.catalogue_age_days, 30, 1, 30),
        minimum_match_score: integer(input.minimum_match_score ?? input.min_lead_score, 70, 0, 100),
      }),
    });

    const raw = await response.text().catch(() => "");
    let payload: Row = {};
    try {
      payload = raw ? JSON.parse(raw) : {};
    } catch {
      payload = { raw };
    }

    const ok = response.ok && payload.ok !== false;
    const now = new Date().toISOString();
    const current = await admin.from("campaigns").select("outreach").eq("id", campaignId).maybeSingle();
    const outreach = current.data?.outreach && typeof current.data.outreach === "object" ? current.data.outreach : {};

    await admin.from("campaigns").update({
      updated_at: now,
      outreach: {
        ...outreach,
        agent_status: ok ? "ready_for_review" : "needs_attention",
        last_orchestrator_result: {
          ran_at: now,
          ok,
          status: response.status,
          orchestrator: "calsie-campaign-orchestrator-v3",
          run_type: runType,
          error: ok ? null : text(payload.error) || "Background job search failed",
        },
      },
    }).eq("id", campaignId);
  } catch (error) {
    const now = new Date().toISOString();
    const current = await admin.from("campaigns").select("outreach").eq("id", campaignId).maybeSingle();
    const outreach = current.data?.outreach && typeof current.data.outreach === "object" ? current.data.outreach : {};
    await admin.from("campaigns").update({
      updated_at: now,
      outreach: {
        ...outreach,
        agent_status: "needs_attention",
        last_orchestrator_result: {
          ran_at: now,
          ok: false,
          status: 500,
          orchestrator: "calsie-campaign-orchestrator-v3",
          run_type: runType,
          error: error instanceof Error ? error.message : String(error),
        },
      },
    }).eq("id", campaignId);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "POST") return reply({ ok: false, error: "Use POST" }, 405);
    if (!SUPABASE_URL || !SERVICE_KEY || !CRON_SECRET) return reply({ ok: false, error: "Missing launcher configuration" }, 500);

    const input = await req.json().catch(() => ({})) as Row;
    const campaignId = text(input.campaign_id);
    if (!campaignId) return reply({ ok: false, error: "campaign_id is required" }, 400);

    const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!bearer) return reply({ ok: false, error: "Please sign in again" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const auth = await admin.auth.getUser(bearer);
    if (auth.error || !auth.data.user?.id) return reply({ ok: false, error: "Invalid login session" }, 401);

    const campaign = await admin
      .from("campaigns")
      .select("id,user_id,status,outreach")
      .eq("id", campaignId)
      .eq("user_id", auth.data.user.id)
      .maybeSingle();

    if (campaign.error) throw new Error(campaign.error.message);
    if (!campaign.data) return reply({ ok: false, error: "Campaign not found" }, 404);

    const now = new Date().toISOString();
    const outreach = campaign.data.outreach && typeof campaign.data.outreach === "object" ? campaign.data.outreach : {};
    const nextOutreach = {
      ...outreach,
      active: true,
      scheduled: true,
      require_user_approval: true,
      test_mode: false,
      started_at: (outreach as Row).started_at || now,
      agent_status: "finding_jobs",
    };

    const lifecycle = await admin
      .from("campaigns")
      .update({ status: "active", updated_at: now, outreach: nextOutreach })
      .eq("id", campaignId)
      .select("id,status,outreach")
      .maybeSingle();

    if (lifecycle.error || !lifecycle.data) throw new Error(lifecycle.error?.message || "Campaign lifecycle update failed");

    EdgeRuntime.waitUntil(runOrchestrator(campaignId, input, admin));

    return reply({
      ok: true,
      accepted: true,
      function: "launch-applix-campaign",
      version: "async_background_launcher_v2",
      campaign_id: campaignId,
      campaign_status: "active",
      agent_status: "finding_jobs",
      sends_emails_now: false,
      message: "Campaign started. Calsie is finding jobs in the background.",
    }, 202);
  } catch (error) {
    return reply({
      ok: false,
      function: "launch-applix-campaign",
      version: "async_background_launcher_v2",
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});