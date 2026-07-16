import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
type Row = Record<string, any>;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("APPLIX_SERVICE_ROLE_KEY") || "";
function reply(body: unknown, status = 200) { return new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json" } }); }
function text(value: unknown) { return value == null ? "" : String(value).trim(); }
Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return reply({ ok: false, error: "Use POST" }, 405);
    if (!SUPABASE_URL || !SERVICE_KEY) return reply({ ok: false, error: "Missing Supabase service configuration" }, 500);
    if ((req.headers.get("authorization") || "") !== `Bearer ${SERVICE_KEY}`) return reply({ ok: false, error: "Service-role authorization required" }, 401);
    const input = await req.json().catch(() => ({})) as Row;
    const campaignId = text(input.campaign_id), runId = text(input.orchestrator_run_id), dailyTarget = Math.max(1, Math.min(24, Number(input.daily_target || 24)));
    if (!campaignId || !runId) return reply({ ok: false, error: "campaign_id and orchestrator_run_id are required" }, 400);
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const eligibleResult = await supabase.from("campaign_job_matches").select("id,job_id,match_score,ai_role_relevance_score,ai_confidence,ai_reason,created_at,jobs!inner(posted_at,fetched_at,created_at,title,company,location)").eq("campaign_id", campaignId).eq("filter_status", "eligible").eq("ai_status", "completed").eq("ai_verdict", "pass").order("ai_role_relevance_score", { ascending: false }).order("match_score", { ascending: false }).limit(500);
    if (eligibleResult.error) return reply({ ok: false, error: eligibleResult.error.message }, 500);
    const rows = (eligibleResult.data || []).sort((a: Row, b: Row) => Number(b.ai_role_relevance_score || 0) - Number(a.ai_role_relevance_score || 0) || Number(b.match_score || 0) - Number(a.match_score || 0));
    const selected = rows.slice(0, dailyTarget), held = rows.slice(dailyTarget), now = new Date().toISOString();
    if (selected.length) { const result = await supabase.from("campaign_job_matches").update({ filter_status: "selected", selected_for_campaign: true, selected_at: now, orchestrator_run_id: runId, updated_at: now }).in("id", selected.map((r: Row) => r.id)); if (result.error) return reply({ ok: false, error: result.error.message }, 500); }
    if (held.length) { const result = await supabase.from("campaign_job_matches").update({ filter_status: "held_for_later", selected_for_campaign: false, selected_at: null, orchestrator_run_id: runId, updated_at: now }).in("id", held.map((r: Row) => r.id)); if (result.error) return reply({ ok: false, error: result.error.message }, 500); }
    return reply({ ok: true, function: "select-daily-job-batch", campaign_id: campaignId, orchestrator_run_id: runId, eligible_count: rows.length, selected_count: selected.length, held_for_later_count: held.length, selected_jobs: selected.map((row: Row) => ({ job_id: row.job_id, match_score: row.match_score, ai_role_relevance_score: row.ai_role_relevance_score, ai_confidence: row.ai_confidence, ai_reason: row.ai_reason, title: row.jobs?.title || null, company: row.jobs?.company || null, location: row.jobs?.location || null })) });
  } catch (error) { return reply({ ok: false, function: "select-daily-job-batch", error: error instanceof Error ? error.message : String(error) }, 500); }
});