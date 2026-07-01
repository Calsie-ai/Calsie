import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type Row = Record<string, any>;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "https://bnshgtrqbfuphhhdgccs.supabase.co";

function env(name: string) {
  return Deno.env.get(name) || "";
}

function firstSecretKey() {
  const direct = env("SUPABASE_SERVICE_ROLE_KEY") || env("SERVICE_ROLE_KEY") || env("APPLIX_SERVICE_ROLE_KEY");
  if (direct) return direct;
  const modern = env("SUPABASE_SECRET_KEYS");
  if (!modern) return "";
  try {
    const parsed = JSON.parse(modern);
    if (Array.isArray(parsed)) return parsed[0]?.secret_key || parsed[0]?.key || parsed[0] || "";
    if (typeof parsed === "object" && parsed !== null) return parsed.secret_key || parsed.key || String(Object.values(parsed)[0] || "");
  } catch {
    return modern;
  }
  return "";
}

const SERVICE_KEY = firstSecretKey();
const CRON_SECRET = env("CRON_SECRET");

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json" } });
}

function txt(value: unknown) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function safeNumber(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.floor(parsed))) : fallback;
}

function isAuthorized(req: Request) {
  if (!CRON_SECRET) {
    throw new Error("CRON_SECRET is not configured. Refusing to run.");
  }

  const authHeader = req.headers.get("authorization") || "";
  const cronHeader = req.headers.get("x-applix-cron-secret") || "";
  return authHeader === `Bearer ${CRON_SECRET}` || cronHeader === CRON_SECRET;
}

async function callFunction(name: string, body: Row) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  return { ok: response.ok && payload?.ok !== false, status: response.status, payload };
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST" && req.method !== "GET") return reply({ ok: false, error: "Use GET or POST" }, 405);
    if (!isAuthorized(req)) return reply({ ok: false, error: "Unauthorized orchestrator request." }, 401);
    if (!SERVICE_KEY) return reply({ ok: false, error: "Missing service role secret. Add APPLIX_SERVICE_ROLE_KEY." }, 500);

    const input = req.method === "POST" ? await req.json().catch(() => ({})) as Row : {};
    const campaignId = txt(input.campaign_id);
    const maxCampaigns = safeNumber(input.max_campaigns, 10, 1, 50);
    const resultsLimit = safeNumber(input.results_limit, 100, 1, 100);
    const queueLimit = safeNumber(input.queue_limit, 100, 1, 100);
    const minLeadScore = safeNumber(input.min_lead_score, 70, 0, 100);

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    let campaignQuery = supabase
      .from("campaigns")
      .select("id,user_id,status,outreach,created_at")
      .in("status", ["active", "scheduled", "launched"])
      .order("created_at", { ascending: true })
      .limit(maxCampaigns);

    if (campaignId) campaignQuery = campaignQuery.eq("id", campaignId);

    const campaignResult = await campaignQuery;
    if (campaignResult.error) return reply({ ok: false, error: campaignResult.error.message }, 500);

    const results: Row[] = [];

    for (const campaign of campaignResult.data || []) {
      const launch = await callFunction("launch-applix-campaign", {
        campaign_id: campaign.id,
        user_id: campaign.user_id,
        results_limit: resultsLimit,
        queue_limit: queueLimit,
        min_lead_score: minLeadScore,
        exact_private_company_only: true,
      });

      const updatedAt = new Date().toISOString();
      await supabase
        .from("campaigns")
        .update({
          status: "launched",
          updated_at: updatedAt,
          outreach: {
            ...(campaign.outreach || {}),
            mode: "production",
            test_mode: false,
            agent_status: launch.ok ? "ready_for_review" : "needs_attention",
            last_orchestrator_run_at: updatedAt,
            last_orchestrator_result: launch,
          },
        })
        .eq("id", campaign.id);

      results.push({
        campaign_id: campaign.id,
        user_id: campaign.user_id,
        launch_ok: launch.ok,
        launch_status: launch.status,
        launch_summary: launch.payload,
      });
    }

    return reply({
      ok: true,
      function: "applix-agent-orchestrator",
      version: "production_orchestrator_v1",
      mode: "production",
      sends_emails_now: false,
      checked_campaigns: campaignResult.data?.length || 0,
      results,
    });
  } catch (error) {
    return reply({
      ok: false,
      function: "applix-agent-orchestrator",
      version: "production_orchestrator_v1",
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});
