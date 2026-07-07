import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type Row = Record<string, any>;

const DEFAULT_MAX_ATTEMPTS = 3;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  Deno.env.get("SERVICE_ROLE_KEY") ||
  Deno.env.get("APPLIX_SERVICE_ROLE_KEY") ||
  "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") || Deno.env.get("APPLIX_CRON_SECRET") || "";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers":
    "authorization, x-client-info, apikey, content-type, x-applix-cron-secret, x-cron-secret, cron-secret",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

function txt(value: unknown, fallback = "") {
  if (value === undefined || value === null) return fallback;
  const clean = String(value).trim();
  return clean || fallback;
}

function normalizeEmail(value: unknown) {
  return txt(value).toLowerCase();
}

function looksLikeEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(value);
}

function bearerToken(req: Request) {
  const authHeader = req.headers.get("authorization") || "";
  return authHeader.replace(/^Bearer\s+/i, "").trim();
}

function isInternalAuthorized(req: Request) {
  const token = bearerToken(req);
  const xApplixCronSecret = req.headers.get("x-applix-cron-secret") || "";
  const xCronSecret = req.headers.get("x-cron-secret") || "";
  const plainCronSecret = req.headers.get("cron-secret") || "";

  if (SUPABASE_SERVICE_ROLE_KEY && token === SUPABASE_SERVICE_ROLE_KEY) return true;

  return Boolean(
    CRON_SECRET &&
      (token === CRON_SECRET ||
        xApplixCronSecret === CRON_SECRET ||
        xCronSecret === CRON_SECRET ||
        plainCronSecret === CRON_SECRET)
  );
}

async function callGmailSend(payload: Row) {
  const response = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/gmail-send`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: SUPABASE_SERVICE_ROLE_KEY,
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));
  return { ok: response.ok && data?.ok !== false, status: response.status, data };
}

async function loadQueueRow(
  supabase: ReturnType<typeof createClient>,
  options: { queueId: string; campaignId: string; maxAttempts: number; nowIso: string }
) {
  const { queueId, campaignId, maxAttempts, nowIso } = options;

  let query = supabase
    .from("outreach_queue")
    .select(
      "id,campaign_id,user_identifier,recipient_email,subject,email_body,status,review_status,send_attempts,scheduled_send_at,provider_message_id,sent_from"
    )
    .eq("status", "queued")
    .eq("review_status", "approved")
    .lt("send_attempts", maxAttempts)
    .lte("scheduled_send_at", nowIso)
    .order("scheduled_send_at", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(1);

  if (queueId) query = query.eq("id", queueId);
  if (campaignId) query = query.eq("campaign_id", campaignId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data || [])[0] as Row | undefined;
}

async function markQueuedRowFailed(
  supabase: ReturnType<typeof createClient>,
  row: Row,
  errorMessage: string,
  nowIso: string,
  expectedStatus: "queued" | "sending" = "queued"
) {
  const { error } = await supabase
    .from("outreach_queue")
    .update({
      status: "send_failed",
      last_error: errorMessage.slice(0, 500),
      send_attempts: Number(row.send_attempts || 0) + 1,
      updated_at: nowIso,
    })
    .eq("id", row.id)
    .eq("status", expectedStatus);

  if (error) throw new Error(error.message);
}

async function claimQueueRow(supabase: ReturnType<typeof createClient>, rowId: string, nowIso: string) {
  const { data, error } = await supabase
    .from("outreach_queue")
    .update({
      status: "sending",
      last_error: null,
      updated_at: nowIso,
    })
    .eq("id", rowId)
    .eq("status", "queued")
    .eq("review_status", "approved")
    .select(
      "id,campaign_id,user_identifier,recipient_email,subject,email_body,status,review_status,send_attempts,scheduled_send_at,provider_message_id,sent_from"
    )
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as Row | null) || null;
}

async function fallbackMarkSent(
  supabase: ReturnType<typeof createClient>,
  row: Row,
  gmailResult: Row,
  nowIso: string
) {
  const providerMessageId = txt(gmailResult.gmail_message_id || gmailResult.id) || null;
  const sentFrom = txt(gmailResult.from || gmailResult.sent_from) || null;

  const { error } = await supabase
    .from("outreach_queue")
    .update({
      status: "sent",
      review_status: "approved",
      provider_message_id: providerMessageId,
      sent_from: sentFrom,
      send_attempts: Number(row.send_attempts || 0) + 1,
      last_error: null,
      updated_at: nowIso,
    })
    .eq("id", row.id)
    .eq("status", "sending");

  if (error) throw new Error(error.message);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") return json({ ok: false, error: "Use POST." }, 405);

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return json({ ok: false, error: "Missing send-queued-outreach configuration." }, 500);
    }

    if (!isInternalAuthorized(req)) {
      return json({ ok: false, error: "Unauthorized send-queued-outreach request." }, 401);
    }

    const input = await req.json().catch(() => ({}));
    const queueId = txt(input.queue_id || input.outreach_queue_id || input.id);
    const campaignId = txt(input.campaign_id);
    const senderIdentifier = txt(input.user_identifier || input.sender_user_identifier || input.sender_email);
    const fromName = txt(input.from_name || input.sender_name || input.candidate_name, "Applix Candidate");
    const maxAttempts = Math.max(1, Math.min(10, Number(input.max_attempts || DEFAULT_MAX_ATTEMPTS)));
    const nowIso = new Date().toISOString();

    if (queueId && !isUuid(queueId)) {
      return json({ ok: false, error: "queue_id must be a valid UUID.", queue_id: queueId }, 400);
    }

    if (campaignId && !isUuid(campaignId)) {
      return json({ ok: false, error: "campaign_id must be a valid UUID.", campaign_id: campaignId }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const queuedRow = await loadQueueRow(supabase, { queueId, campaignId, maxAttempts, nowIso });

    if (!queuedRow) {
      return json({
        ok: false,
        error: "No queued approved outreach row is due to send.",
        queue_id: queueId || null,
        campaign_id: campaignId || null,
      }, 404);
    }

    const to = normalizeEmail(queuedRow.recipient_email);
    const subject = txt(queuedRow.subject, "Application");
    const body = txt(queuedRow.email_body);
    const resolvedSenderIdentifier = txt(senderIdentifier || queuedRow.user_identifier);

    if (!resolvedSenderIdentifier) {
      await markQueuedRowFailed(supabase, queuedRow, "Missing sender user_identifier.", nowIso, "queued");
      return json({ ok: false, error: "Missing sender user_identifier.", queue_id: queuedRow.id }, 400);
    }

    if (!to || !looksLikeEmail(to)) {
      await markQueuedRowFailed(supabase, queuedRow, "Queued row does not have a valid recipient_email.", nowIso, "queued");
      return json({
        ok: false,
        error: "Queued row does not have a valid recipient_email.",
        queue_id: queuedRow.id,
        recipient_email: queuedRow.recipient_email || null,
      }, 400);
    }

    if (!body) {
      await markQueuedRowFailed(supabase, queuedRow, "Queued row does not have email_body.", nowIso, "queued");
      return json({ ok: false, error: "Queued row does not have email_body.", queue_id: queuedRow.id }, 400);
    }

    const claimedRow = await claimQueueRow(supabase, queuedRow.id, nowIso);
    if (!claimedRow) {
      return json({
        ok: false,
        error: "Queued row was already claimed or status changed.",
        queue_id: queuedRow.id,
      }, 409);
    }

    const gmailResult = await callGmailSend({
      queue_id: claimedRow.id,
      user_identifier: resolvedSenderIdentifier,
      campaign_id: claimedRow.campaign_id,
      to,
      subject,
      body,
      from_name: fromName,
      source: "send-queued-outreach",
    });

    if (!gmailResult.ok) {
      await markQueuedRowFailed(
        supabase,
        claimedRow,
        JSON.stringify(gmailResult.data || {}).slice(0, 500) || "gmail-send failed.",
        nowIso,
        "sending"
      );

      return json({
        ok: false,
        function: "send-queued-outreach",
        queue_id: claimedRow.id,
        error: "gmail-send failed.",
        gmail_send_status: gmailResult.status,
        gmail_send_response: gmailResult.data,
      }, gmailResult.status);
    }

    await fallbackMarkSent(supabase, claimedRow, gmailResult.data || {}, nowIso);

    return json({
      ok: true,
      function: "send-queued-outreach",
      queue_id: claimedRow.id,
      campaign_id: claimedRow.campaign_id,
      recipient_email: to,
      gmail_send_response: gmailResult.data,
    });
  } catch (error) {
    return json({
      ok: false,
      function: "send-queued-outreach",
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});
