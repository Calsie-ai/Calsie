import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type Row = Record<string, any>;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("APPLIX_SERVICE_ROLE_KEY") || "";

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function text(value: unknown) {
  return value == null ? "" : String(value).trim();
}

function toSelectedJob(row: Row) {
  return {
    job_id: row.job_id,
    match_score: row.match_score,
    ai_role_relevance_score: row.ai_role_relevance_score,
    ai_confidence: row.ai_confidence,
    ai_reason: row.ai_reason,
    title: row.jobs?.title || null,
    company: row.jobs?.company || null,
    location: row.jobs?.location || null,
  };
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return reply({ ok: false, error: "Use POST" }, 405);
    if (!SUPABASE_URL || !SERVICE_KEY) return reply({ ok: false, error: "Missing Supabase service configuration" }, 500);
    if ((req.headers.get("authorization") || "") !== `Bearer ${SERVICE_KEY}`) {
      return reply({ ok: false, error: "Service-role authorization required" }, 401);
    }

    const input = await req.json().catch(() => ({})) as Row;
    const campaignId = text(input.campaign_id);
    const runId = text(input.orchestrator_run_id);
    const dailyTarget = Math.max(1, Math.min(24, Number(input.daily_target || 24)));

    if (!campaignId || !runId) {
      return reply({ ok: false, error: "campaign_id and orchestrator_run_id are required" }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    const fields = "id,job_id,match_score,ai_role_relevance_score,ai_confidence,ai_reason,created_at,selected_at,filter_status,selected_for_campaign,jobs!inner(posted_at,fetched_at,created_at,title,company,location)";

    const alreadyResult = await supabase
      .from("campaign_job_matches")
      .select(fields)
      .eq("campaign_id", campaignId)
      .eq("selected_for_campaign", true)
      .eq("ai_status", "completed")
      .eq("ai_verdict", "pass")
      .order("selected_at", { ascending: true })
      .limit(500);

    if (alreadyResult.error) return reply({ ok: false, error: alreadyResult.error.message }, 500);

    const alreadySelected = (alreadyResult.data || []) as Row[];
    const remainingQuota = Math.max(0, dailyTarget - alreadySelected.length);

    const eligibleResult = await supabase
      .from("campaign_job_matches")
      .select(fields)
      .eq("campaign_id", campaignId)
      .eq("filter_status", "eligible")
      .eq("selected_for_campaign", false)
      .eq("ai_status", "completed")
      .eq("ai_verdict", "pass")
      .order("ai_role_relevance_score", { ascending: false })
      .order("match_score", { ascending: false })
      .limit(500);

    if (eligibleResult.error) return reply({ ok: false, error: eligibleResult.error.message }, 500);

    const eligible = (eligibleResult.data || []) as Row[];
    const newlySelected = eligible.slice(0, remainingQuota);
    const held = eligible.slice(remainingQuota);
    const now = new Date().toISOString();

    if (newlySelected.length) {
      const result = await supabase
        .from("campaign_job_matches")
        .update({
          filter_status: "selected",
          selected_for_campaign: true,
          selected_at: now,
          orchestrator_run_id: runId,
          updated_at: now,
        })
        .in("id", newlySelected.map((row) => row.id));

      if (result.error) return reply({ ok: false, error: result.error.message }, 500);
    }

    if (held.length) {
      const result = await supabase
        .from("campaign_job_matches")
        .update({
          filter_status: "held_for_later",
          selected_for_campaign: false,
          selected_at: null,
          orchestrator_run_id: runId,
          updated_at: now,
        })
        .in("id", held.map((row) => row.id));

      if (result.error) return reply({ ok: false, error: result.error.message }, 500);
    }

    const cumulativeSelected = [...alreadySelected, ...newlySelected].slice(0, dailyTarget);

    return reply({
      ok: true,
      function: "select-daily-job-batch",
      version: "cumulative_selection_v2",
      campaign_id: campaignId,
      orchestrator_run_id: runId,
      daily_target: dailyTarget,
      already_selected_count: alreadySelected.length,
      newly_selected_count: newlySelected.length,
      eligible_count: eligible.length,
      selected_count: cumulativeSelected.length,
      held_for_later_count: held.length,
      remaining_quota: Math.max(0, dailyTarget - cumulativeSelected.length),
      selected_jobs: cumulativeSelected.map(toSelectedJob),
    });
  } catch (error) {
    return reply({
      ok: false,
      function: "select-daily-job-batch",
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});
