import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type Row = Record<string, any>;

const PROJECT_URL = "https://bnshgtrqbfuphhhdgccs.supabase.co";
const TEST_RECIPIENT_EMAIL = "hostsajan@gmail.com";
const FALLBACK_USER_IDENTIFIER = Deno.env.get("APPLIX_FALLBACK_USER_ID") || "sajan3310giri@gmail.com";

function env(name: string) { return Deno.env.get(name) ?? ""; }
function firstSecretKey() {
  const direct = env("SUPABASE_SERVICE_ROLE_KEY") || env("SERVICE_ROLE_KEY") || env("APPLIX_SERVICE_ROLE_KEY");
  if (direct) return direct;
  const modern = env("SUPABASE_SECRET_KEYS");
  if (!modern) return "";
  try {
    const parsed = JSON.parse(modern);
    if (Array.isArray(parsed)) return parsed[0]?.secret_key || parsed[0]?.key || parsed[0] || "";
    if (typeof parsed === "object" && parsed !== null) return parsed.secret_key || parsed.key || String(Object.values(parsed)[0] || "");
  } catch { return modern; }
  return "";
}
const SUPABASE_URL = env("SUPABASE_URL") || PROJECT_URL;
const SUPABASE_SERVICE_ROLE_KEY = firstSecretKey();

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json" } });
}
function txt(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s ? s : null;
}
function safeLimit(v: unknown, fallback = 100) {
  const n = Number(v ?? fallback);
  return Math.max(1, Math.min(100, Number.isFinite(n) ? n : fallback));
}
async function callFunction(name: string, body: Row) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: SUPABASE_SERVICE_ROLE_KEY,
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  return { ok: response.ok && !payload.error, status: response.status, payload };
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return reply({ ok: false, error: "Use POST" }, 405);
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return reply({ ok: false, error: "Missing Supabase service configuration" }, 500);
    const input = await req.json().catch(() => ({}));
    const campaignId = txt(input.campaign_id);
    if (!campaignId) return reply({ ok: false, error: "campaign_id is required for Applix test launch" }, 400);
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const campaignResult = await supabase.from("campaigns").select("*").eq("id", campaignId).maybeSingle();
    if (!campaignResult) return reply({ ok: false, error: "Campaign query returned undefined", campaign_id: campaignId }, 500);
    if (campaignResult.error) return reply({ ok: false, error: campaignResult.error.message }, 500);
    const campaign = campaignResult.data;
    if (!campaign?.id) return reply({ ok: false, error: "Campaign not found", campaign_id: campaignId }, 404);
    const queueLimit = safeLimit(input.target_email_count || campaign.outreach?.target_email_count || campaign.outreach?.daily_cap || 100, 100);
    const userIdentifier = txt(campaign.user_id) || txt(input.user_identifier) || FALLBACK_USER_IDENTIFIER;
    const scraper = await callFunction("run-outscraper-campaigns", { campaign_id: campaignId, results_limit: 100, dry_run: false, exact_private_company_only: false });
    const leadsCountResult = await supabase.from("campaign_leads").select("id", { count: "exact", head: true }).eq("campaign_id", campaignId);
    const leadsWithEmailResult = await supabase.from("campaign_leads").select("id", { count: "exact", head: true }).eq("campaign_id", campaignId).not("found_email", "is", null);
    const generator = await callFunction("generate-outreach-drafts", { campaign_id: campaignId, limit: queueLimit, dry_run: false, min_lead_score: Number(input.min_lead_score ?? 0) });
    const queueResult = await supabase.from("outreach_queue").select("id, campaign_lead_id, recipient_email, status, review_status, ai_notes, created_at").eq("campaign_id", campaignId).order("created_at", { ascending: false }).limit(queueLimit);
    if (!queueResult) return reply({ ok: false, error: "Queue query returned undefined" }, 500);
    if (queueResult.error) return reply({ ok: false, error: queueResult.error.message, scraper, generator }, 500);
    const queueRows = queueResult.data || [];
    const queueIds = queueRows.map((row: Row) => row.id).filter(Boolean);
    let patchedCount = 0;
    let patchError: string | null = null;
    if (queueIds.length) {
      const patchResult = await supabase.from("outreach_queue").update({ recipient_email: TEST_RECIPIENT_EMAIL, status: "queued_test", review_status: "ready_for_review", ai_notes: { test_mode: true, real_recipients_off: true, forced_test_recipient_email: TEST_RECIPIENT_EMAIL, safety_rule: "Real employer recipients are OFF. Test only. No send is performed by launch-applix-test." }, updated_at: new Date().toISOString() }).in("id", queueIds).select("id, recipient_email, status, review_status");
      if (patchResult.error) patchError = patchResult.error.message;
      else patchedCount = patchResult.data?.length || queueIds.length;
    }
    const finalQueueCheck = await supabase.from("outreach_queue").select("id", { count: "exact", head: true }).eq("campaign_id", campaignId).eq("recipient_email", TEST_RECIPIENT_EMAIL);
    return reply({ ok: patchedCount > 0 && !patchError, function: "launch-applix-test", version: "test_only_orchestrator_v1", test_mode: true, real_recipients_off: true, sends_disabled_in_this_gateway: true, campaign_id: campaignId, user_identifier: userIdentifier, scraper_ok: scraper.ok, scraper_status: scraper.status, scraper_summary: scraper.payload, campaign_leads_count: leadsCountResult.count || 0, leads_with_email_count: leadsWithEmailResult.count || 0, generator_ok: generator.ok, generator_status: generator.status, generator_summary: generator.payload, queue_limit: queueLimit, queued_count_before_patch: queueRows.length, batch_size: patchedCount, forced_test_queue_count: finalQueueCheck.count || 0, sent_count: 0, forced_recipient_email: TEST_RECIPIENT_EMAIL, patch_error: patchError, errors: [ ...(scraper.ok ? [] : [`run-outscraper-campaigns failed: ${JSON.stringify(scraper.payload).slice(0, 700)}`]), ...(generator.ok ? [] : [`generate-outreach-drafts failed: ${JSON.stringify(generator.payload).slice(0, 700)}`]), ...(patchError ? [`Queue patch failed: ${patchError}`] : []), ...(patchedCount > 0 ? [] : ["No outreach_queue rows were patched. Check leads_with_email_count and generator_summary."]) ] });
  } catch (e) {
    return reply({ ok: false, function: "launch-applix-test", error: e instanceof Error ? e.message : String(e), stack: e instanceof Error ? e.stack : null }, 500);
  }
});
