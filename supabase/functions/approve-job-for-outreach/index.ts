import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type Row = Record<string, any>;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const VERSION = "approve_job_for_outreach_v7_approval_only";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

function log(step: string, payload: Row = {}) {
  console.log(JSON.stringify({ function: "approve-job-for-outreach", version: VERSION, step, ...payload }));
}

function text(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const clean = String(value).trim();
  return clean ? clean : null;
}

function readBearerToken(req: Request) {
  const authorization = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

async function fetchOwnedJob(supabase: ReturnType<typeof createClient>, jobId: string, userId: string) {
  const { data, error } = await supabase
    .from("jobs")
    .select("id,user_id,status,user_decision,reviewed_at,extracted_email,email_extraction_status,campaign_id")
    .eq("id", jobId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as Row | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    log("request:start", { method: req.method });

    if (req.method !== "POST") return json({ ok: false, function: "approve-job-for-outreach", version: VERSION, error: "Use POST" }, 405);
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      log("config:missing");
      return json({ ok: false, function: "approve-job-for-outreach", version: VERSION, error: "Missing Supabase service role configuration" }, 500);
    }

    const token = readBearerToken(req);
    if (!token) {
      log("auth:missing-token");
      return json({ ok: false, function: "approve-job-for-outreach", version: VERSION, error: "Missing bearer token" }, 401);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData.user) {
      log("auth:invalid", { error: authError?.message || null });
      return json({ ok: false, function: "approve-job-for-outreach", version: VERSION, error: "Invalid login session" }, 401);
    }

    const input = await req.json().catch(() => ({}));
    const jobId = text(input.job_id);
    log("request:parsed", { job_id: jobId });

    if (!jobId) return json({ ok: false, function: "approve-job-for-outreach", version: VERSION, error: "job_id is required" }, 400);

    const ownedJob = await fetchOwnedJob(supabase, jobId, authData.user.id);
    if (!ownedJob) {
      log("job:not-found", { job_id: jobId });
      return json({ ok: false, function: "approve-job-for-outreach", version: VERSION, error: "Job not found" }, 404);
    }

    const reviewedAt = new Date().toISOString();
    const { data: updatedJob, error: approvalError } = await supabase
      .from("jobs")
      .update({
        status: "approved",
        user_decision: "approved",
        reviewed_at: reviewedAt,
      })
      .eq("id", jobId)
      .eq("user_id", authData.user.id)
      .select("id,status,user_decision,reviewed_at,extracted_email,email_extraction_status,campaign_id")
      .maybeSingle();

    if (approvalError) throw new Error(approvalError.message);

    log("job:approved", { job_id: jobId, reviewed_at: reviewedAt });

    return json({
      ok: true,
      function: "approve-job-for-outreach",
      version: VERSION,
      job_id: jobId,
      campaign_id: updatedJob?.campaign_id || ownedJob.campaign_id || null,
      approval_status: "approved",
      job_status: updatedJob?.status || "approved",
      user_decision: updatedJob?.user_decision || "approved",
      reviewed_at: updatedJob?.reviewed_at || reviewedAt,
      email_status: updatedJob?.extracted_email ? "found" : updatedJob?.email_extraction_status || ownedJob.email_extraction_status || null,
      draft_status: "not_created",
      queue_id: null,
      send_triggered: false,
      send_result: null,
      send_error: null,
      outscraper_refresh_result: null,
      outscraper_refresh_error: null,
      next_step: "Run enrich-job-emails and generate-job-outreach-drafts from the final approval action before queueing approved outreach.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log("pipeline:fatal-error", { error: message });
    return json({
      ok: false,
      function: "approve-job-for-outreach",
      version: VERSION,
      error: message,
    }, 500);
  }
});
