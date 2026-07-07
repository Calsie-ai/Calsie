import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type Row = Record<string, any>;

type PipelineEmailStatus = "found" | "not_found" | "failed";
type PipelineDraftStatus = "created" | "not_created";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
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

async function invokeFunction(name: string, payload: Row) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  const textBody = await response.text().catch(() => "");
  let body: Row = {};
  try {
    body = textBody ? JSON.parse(textBody) : {};
  } catch {
    body = { raw: textBody };
  }

  if (!response.ok || body.ok === false) {
    throw new Error(`${name} failed: ${text(body.error || textBody || response.statusText) || "Unknown function error"}`);
  }

  return body;
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

async function setJobStatus(supabase: ReturnType<typeof createClient>, jobId: string, userId: string, status: string) {
  const { error } = await supabase
    .from("jobs")
    .update({ status })
    .eq("id", jobId)
    .eq("user_id", userId);

  if (error) throw new Error(error.message);
}

async function normalizeExistingEmail(supabase: ReturnType<typeof createClient>, jobId: string, userId: string) {
  const { error } = await supabase
    .from("jobs")
    .update({
      apply_method: "email",
      email_extraction_status: "found",
      email_extraction_source: "existing_extracted_email",
      email_extraction_error: null,
      email_extraction_attempted_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .eq("user_id", userId);

  if (error) throw new Error(error.message);
}

async function fetchQueueRow(supabase: ReturnType<typeof createClient>, jobId: string) {
  const { data, error } = await supabase
    .from("outreach_queue")
    .select("id,status,review_status,send_window,scheduled_send_at")
    .eq("job_id", jobId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as Row | null;
}

async function upsertQueueState(supabase: ReturnType<typeof createClient>, queueId: string) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("outreach_queue")
    .update({
      status: "queued",
      review_status: "approved",
      send_window: "automatic",
      scheduled_send_at: now,
      updated_at: now,
    })
    .eq("id", queueId);

  if (error) throw new Error(error.message);
}

function emailStatusFor(job: Row): PipelineEmailStatus {
  const extractionStatus = text(job.email_extraction_status)?.toLowerCase();
  if (text(job.extracted_email)) return "found";
  if (["not_found", "email_not_found", "needs_email"].includes(extractionStatus || "")) return "not_found";
  if (extractionStatus === "failed") return "failed";
  return "not_found";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "POST") return json({ ok: false, error: "Use POST" }, 405);
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return json({ ok: false, error: "Missing Supabase service role configuration" }, 500);
    }

    const token = readBearerToken(req);
    if (!token) return json({ ok: false, error: "Missing bearer token" }, 401);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData.user) {
      return json({ ok: false, error: "Invalid login session" }, 401);
    }

    const input = await req.json().catch(() => ({}));
    const jobId = text(input.job_id);
    if (!jobId) return json({ ok: false, error: "job_id is required" }, 400);

    const ownedJob = await fetchOwnedJob(supabase, jobId, authData.user.id);
    if (!ownedJob) return json({ ok: false, error: "Job not found" }, 404);

    const reviewedAt = new Date().toISOString();
    const { error: approvalError } = await supabase
      .from("jobs")
      .update({
        status: "approved",
        user_decision: "approved",
        reviewed_at: reviewedAt,
      })
      .eq("id", jobId)
      .eq("user_id", authData.user.id);

    if (approvalError) throw new Error(approvalError.message);

    let emailStatus: PipelineEmailStatus = "failed";
    let draftStatus: PipelineDraftStatus = "not_created";
    let queueId: string | null = null;

    try {
      await invokeFunction("enrich-job-emails", {
        job_id: jobId,
        only_approved: true,
        limit: 1,
      });
    } catch (error) {
      await setJobStatus(supabase, jobId, authData.user.id, "failed");
      return json({
        ok: true,
        job_id: jobId,
        approval_status: "approved",
        email_status: "failed",
        draft_status: "not_created",
        queue_id: null,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const enrichedJob = await fetchOwnedJob(supabase, jobId, authData.user.id);
    if (!enrichedJob) throw new Error("Approved job disappeared after enrichment");

    emailStatus = emailStatusFor(enrichedJob);

    if (emailStatus === "found") {
      await normalizeExistingEmail(supabase, jobId, authData.user.id);
    }

    if (emailStatus === "not_found") {
      await setJobStatus(supabase, jobId, authData.user.id, "needs_email");
      return json({
        ok: true,
        job_id: jobId,
        approval_status: "approved",
        email_status: "not_found",
        draft_status: "not_created",
        queue_id: null,
      });
    }

    if (emailStatus === "failed") {
      await setJobStatus(supabase, jobId, authData.user.id, "failed");
      return json({
        ok: true,
        job_id: jobId,
        approval_status: "approved",
        email_status: "failed",
        draft_status: "not_created",
        queue_id: null,
      });
    }

    try {
      await invokeFunction("generate-job-outreach-drafts", {
        job_id: jobId,
        only_approved: true,
        limit: 1,
        send_immediately: true,
      });
    } catch (error) {
      await setJobStatus(supabase, jobId, authData.user.id, "failed");
      return json({
        ok: true,
        job_id: jobId,
        approval_status: "approved",
        email_status: "found",
        draft_status: "not_created",
        queue_id: null,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const queueRow = await fetchQueueRow(supabase, jobId);
    if (!queueRow?.id) {
      await setJobStatus(supabase, jobId, authData.user.id, "failed");
      return json({
        ok: true,
        job_id: jobId,
        approval_status: "approved",
        email_status: "found",
        draft_status: "not_created",
        queue_id: null,
      });
    }

    await upsertQueueState(supabase, queueRow.id);
    await setJobStatus(supabase, jobId, authData.user.id, "queued");

    queueId = queueRow.id;
    draftStatus = "created";

    try {
      await invokeFunction("send-queued-outreach", { queue_id: queueId });
    } catch {
      // Keep approval and queue creation intact even when the sender needs to retry later.
    }

    return json({
      ok: true,
      job_id: jobId,
      approval_status: "approved",
      email_status,
      draft_status: draftStatus,
      queue_id: queueId,
    });
  } catch (error) {
    return json({
      ok: false,
      function: "approve-job-for-outreach",
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});
