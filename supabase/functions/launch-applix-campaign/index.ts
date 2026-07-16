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

async function callOrchestrator(campaignId: string, input: Row) {
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
      trigger: "campaign_launch",
      daily_target: integer(input.daily_job_limit ?? input.results_limit, 24, 1, 24),
      catalogue_age_days: integer(input.catalogue_age_days, 30, 1, 30),
      minimum_match_score: integer(input.minimum_match_score ?? input.min_lead_score, 70, 0, 100),
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "POST") return reply({ ok: false, error: "Use POST" }, 405);
    if (!SUPABASE_URL || !SERVICE_KEY || !CRON_SECRET) {
      return reply({ ok: false, error: "Missing launcher configuration" }, 500);
    }

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
    const outreach = typeof campaign.data.outreach === "object" && campaign.data.outreach ? campaign.data.outreach : {};
    const lifecycle = await admin
      .from("campaigns")
      .update({
        status: "active",
        updated_at: now,
        outreach: {
          ...outreach,
          active: true,
          scheduled: true,
          require_user_approval: true,
          test_mode: false,
          started_at: (outreach as Row).started_at || now,
          agent_status: "finding_jobs",
        },
      })
      .eq("id", campaignId)
      .select("id,status,outreach")
      .maybeSingle();

    if (lifecycle.error || !lifecycle.data) throw new Error(lifecycle.error?.message || "Campaign lifecycle update failed");

    const orchestrator = await callOrchestrator(campaignId, input);
    const finalStatus = orchestrator.ok ? "ready_for_review" : "needs_attention";

    await admin.from("campaigns").update({
      updated_at: new Date().toISOString(),
      outreach: {
        ...(lifecycle.data.outreach || {}),
        agent_status: finalStatus,
        last_orchestrator_result: {
          ran_at: new Date().toISOString(),
          ok: orchestrator.ok,
          status: orchestrator.status,
        },
      },
    }).eq("id", campaignId);

    return reply({
      ok: orchestrator.ok,
      function: "launch-applix-campaign",
      version: "ai_orchestrator_wiring_v1",
      campaign_id: campaignId,
      campaign_status: lifecycle.data.status,
      sends_emails_now: false,
      drafts_created_at_launch: false,
      orchestrator: orchestrator.payload,
    }, orchestrator.ok ? 200 : orchestrator.status || 502);
  } catch (error) {
    return reply({
      ok: false,
      function: "launch-applix-campaign",
      version: "ai_orchestrator_wiring_v1",
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});