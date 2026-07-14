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
  if (value === undefined || value === null) return "";
  return String(value).trim();
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
    if (!campaignId || !runId) return reply({ ok: false, error: "campaign_id and orchestrator_run_id are required" }, 400);

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const eligibleResult = await supabase
      .from("campaign_job_matches")
      .select("id,job_id,match_score,created_at,jobs!inner(posted_at,fetched_at,created_at,title,company,location)")
      .eq("campaign_id", campaignId)
      .eq("filter_status", "eligible")
      .order("match_score", { ascending: false })
      .limit(500);

    if (eligibleResult.error) return reply({ ok: false, error: eligibleResult.error.message }, 500);

    const rows = (eligibleResult.data || []).sort((a: Row, b: Row) => {
      const scoreDiff = Number(b.match_score || 0) - Number(a.match_score || 0);
      if (scoreDiff !== 0) return scoreDiff;
      const aJob = a.jobs || {};
      const bJob = b.jobs || {};
      const aDate = new Date(aJob.posted_at || aJob.fetched_at || aJob.created_at || 0).getTime();
      const bDate = new Date(bJob.posted_at || bJob.fetched_at || bJob.created_at || 0).getTime();
      return bDate - aDate;
    });

    const selected = rows.slice(0, dailyTarget);
    const held = rows.slice(dailyTarget);
    const now = new Date().toISOString();

    if (selected.length > 0) {
      const selectedUpdate = await supabase
        .from("campaign_job_matches")
        .update({
          filter_status: "selected",
          selected_for_campaign: true,
          selected_at: now,
          orchestrator_run_id: runId,
          updated_at: now,
        })
        .in("id", selected.map((row: Row) => row.id));
      if (selectedUpdate.error) return reply({ ok: false, error: selectedUpdate.error.message }, 500);
    }

    if (held.length > 0) {
      const heldUpdate = await supabase
        .from("campaign_job_matches")
        .update({
          filter_status: "held_for_later",
          selected_for_campaign: false,
          selected_at: null,
          orchestrator_run_id: runId,
          updated_at: now,
        })
        .in("id", held.map((row: Row) => row.id));
      if (heldUpdate.error) return reply({ ok: false, error: heldUpdate.error.message }, 500);
    }

    return reply({
      ok: true,
      function: "select-daily-job-batch",
      campaign_id: campaignId,
      orchestrator_run_id: runId,
      eligible_count: rows.length,
      selected_count: selected.length,
      held_for_later_count: held.length,
      selected_jobs: selected.map((row: Row) => ({
        job_id: row.job_id,
        match_score: row.match_score,
        title: row.jobs?.title || null,
        company: row.jobs?.company || null,
        location: row.jobs?.location || null,
      })),
    });
  } catch (error) {
    return reply({ ok: false, function: "select-daily-job-batch", error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
