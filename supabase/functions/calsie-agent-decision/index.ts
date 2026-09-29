import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const MAIN_URL = Deno.env.get("SUPABASE_URL") || "";
const MAIN_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const MAIN_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const JOBS_FEED_URL = "https://ibgmpamvkvjzdxirzxzr.supabase.co/functions/v1/calsie-category-job-feed";
const TABLES = new Set(["disability_jobs_apify", "agecare_jobs_apify", "childcare_jobs_apify"]);

function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowed = ["https://calsie.com.au", "https://www.calsie.com.au"].includes(origin) || origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:");
  return {
    "access-control-allow-origin": allowed ? origin : "https://calsie.com.au",
    "access-control-allow-headers": "authorization, content-type, apikey, x-client-info",
    "access-control-allow-methods": "POST, OPTIONS", vary: "Origin",
  };
}

function respond(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(req), "content-type": "application/json", "cache-control": "no-store" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return respond(req, { ok: false, error: "Use POST." }, 405);
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return respond(req, { ok: false, error: "Please sign in again." }, 401);
  if (!MAIN_URL || !MAIN_ANON_KEY || !MAIN_SERVICE_KEY) return respond(req, { ok: false, error: "Calsie decision service is not configured." }, 503);

  try {
    const parsed = await req.json().catch(() => ({}));
    const body = parsed && typeof parsed === "object" ? parsed : {};
    const campaignId = typeof body.campaign_id === "string" ? body.campaign_id : "";
    const jobId = Number(body.source_job_id);
    const decision = body.decision;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(campaignId)
        || !Number.isSafeInteger(jobId) || jobId <= 0 || !["approved", "skipped"].includes(decision)) {
      return respond(req, { ok: false, error: "Invalid agent decision." }, 400);
    }

    const authResponse = await fetch(`${MAIN_URL}/auth/v1/user`, {
      headers: { authorization: `Bearer ${token}`, apikey: MAIN_ANON_KEY },
    });
    if (!authResponse.ok) return respond(req, { ok: false, error: "Your Calsie session is not valid." }, 401);
    const user = await authResponse.json();
    if (typeof user?.id !== "string") return respond(req, { ok: false, error: "Your Calsie session is not valid." }, 401);

    const validationResponse = await fetch(JOBS_FEED_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ action: "validate", campaign_id: campaignId, source_job_id: jobId }),
    });
    const validated = await validationResponse.json().catch(() => ({}));
    if (!validationResponse.ok || validated.ok !== true) {
      return respond(req, { ok: false, error: validated.error || "Could not validate this job for your agent." }, validationResponse.status >= 400 && validationResponse.status < 500 ? validationResponse.status : 502);
    }
    if (validated.campaign_id !== campaignId || validated.source_job_id !== jobId || !TABLES.has(validated.source_table)) {
      return respond(req, { ok: false, error: "The job category could not be verified." }, 502);
    }

    const db = createClient(MAIN_URL, MAIN_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const saved = await db.from("calsie_agent_job_decisions").upsert({
      user_id: user.id, campaign_id: campaignId, source_table: validated.source_table,
      source_job_id: jobId, decision, job_snapshot: validated.snapshot || {},
      reviewed_at: new Date().toISOString(),
    }, { onConflict: "campaign_id,source_table,source_job_id" }).select("user_id,campaign_id").single();
    if (saved.error || saved.data?.user_id !== user.id || saved.data?.campaign_id !== campaignId) {
      return respond(req, { ok: false, error: "Could not save your decision." }, 502);
    }
    return respond(req, { ok: true, decision, campaign_id: campaignId, source_job_id: jobId });
  } catch {
    return respond(req, { ok: false, error: "Decision service is temporarily unavailable." }, 502);
  }
});
