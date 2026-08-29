import { serve } from "std/http/server.ts";
import { createClient } from "supabase";
type Row = Record<string, any>;
const URL = Deno.env.get("SUPABASE_URL") || "";
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const SECRET = Deno.env.get("CRON_SECRET") || "";
const ACTIVE = ["active", "launched", "scheduled"];
const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization,apikey,content-type,x-cron-secret,x-applix-cron-secret" };
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body, null, 2), { status, headers: { ...headers, "content-type": "application/json" } }); }
function text(v: unknown) { return v == null ? "" : String(v).trim(); }
function obj(v: unknown): Row { return v && typeof v === "object" ? v as Row : {}; }
function bool(v: unknown) { return v === true || ["true", "1", "yes"].includes(text(v).toLowerCase()); }
function authorized(req: Request) {
  const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const secret = req.headers.get("x-cron-secret") || req.headers.get("x-applix-cron-secret") || "";
  return Boolean((KEY && bearer === KEY) || (SECRET && (bearer === SECRET || secret === SECRET)));
}
async function run(campaignId: string, target: number) {
  const response = await fetch(`${URL}/functions/v1/calsie-campaign-orchestrator-v3`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${KEY}`,
      apikey: KEY,
      "x-applix-cron-secret": SECRET,
    },
    body: JSON.stringify({ campaign_id: campaignId, allowed_campaign_id: campaignId, dry_run: false, run_type: "daily_catalogue", trigger: "scheduled_daily", daily_target: target }),
  });
  const raw = await response.text().catch(() => "");
  let payload: Row = {}; try { payload = raw ? JSON.parse(raw) : {}; } catch { payload = { raw }; }
  return { ok: response.ok && payload.ok !== false, status: response.status, payload };
}
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  try {
    if (req.method !== "POST") return json({ ok: false, error: "Use POST" }, 405);
    if (!URL || !KEY || !SECRET) return json({ ok: false, error: "Missing dispatcher configuration" }, 500);
    if (!authorized(req)) return json({ ok: false, error: "Unauthorized internal scheduler request" }, 401);
    const input = await req.json().catch(() => ({})) as Row;
    const admin = createClient(URL, KEY, { auth: { persistSession: false } });
    let query = admin.from("campaigns").select("id,status,outreach,search");
    query = text(input.campaign_id) ? query.eq("id", text(input.campaign_id)) : query.in("status", ACTIVE);
    const campaigns = await query; if (campaigns.error) throw new Error(campaigns.error.message);
    const today = new Date().toISOString().slice(0, 10), force = bool(input.force), inspect = bool(input.inspect_only);
    const results: Row[] = []; let executed = 0, skipped = 0, failed = 0;
    for (const campaign of campaigns.data || []) {
      const outreach = obj(campaign.outreach), search = obj(campaign.search), status = text(campaign.status).toLowerCase();
      const target = Math.max(1, Math.min(24, Number(search.daily_job_limit || outreach.daily_job_limit || 24)));
      if (!ACTIVE.includes(status) || outreach.active === false || outreach.scheduled === false) { skipped++; results.push({ campaign_id: campaign.id, skipped: true, reason: "campaign_not_active_or_scheduled" }); continue; }
      const existing = await admin.from("orchestrator_runs").select("id,status").eq("campaign_id", campaign.id).eq("run_date", today).eq("run_type", "daily_catalogue").maybeSingle();
      if (existing.error) throw new Error(existing.error.message);
      if (!force && existing.data?.id) { skipped++; results.push({ campaign_id: campaign.id, skipped: true, reason: "daily_run_already_exists", run: existing.data }); continue; }
      if (inspect) { results.push({ campaign_id: campaign.id, inspected: true, daily_target: target, attempt_limits: [100, 300, 700] }); continue; }
      executed++; const outcome = await run(campaign.id, target); if (!outcome.ok) failed++; results.push({ campaign_id: campaign.id, ...outcome });
      await admin.from("campaigns").update({ updated_at: new Date().toISOString(), outreach: { ...outreach, last_daily_fetch_at: new Date().toISOString(), last_daily_fetch_result: { ok: outcome.ok, status: outcome.status, orchestrator: "calsie-campaign-orchestrator-v3", attempt_limits: [100, 300, 700] } } }).eq("id", campaign.id);
    }
    return json({ ok: failed === 0, function: "applix-daily-job-fetcher-v2", version: "three_stage_dispatcher_v2_auth", campaigns_queried: campaigns.data?.length || 0, executed_count: executed, skipped_count: skipped, failed_count: failed, results }, failed === 0 ? 200 : 207);
  } catch (error) { return json({ ok: false, function: "applix-daily-job-fetcher-v2", error: error instanceof Error ? error.message : String(error) }, 500); }
});
