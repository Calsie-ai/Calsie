import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type Row = Record<string, any>;

type ResumeAttachment = {
  fileName: string;
  contentType: string;
  base64: string;
};

const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
const DEFAULT_FROM_NAME = "Applix Candidate";

function env(name: string) {
  return Deno.env.get(name) ?? "";
}

function txt(value: unknown, fallback = "") {
  if (value === undefined || value === null) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function normalizeEmail(value: unknown) {
  return txt(value).toLowerCase();
}

const SUPABASE_URL = env("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY =
  env("SUPABASE_SERVICE_ROLE_KEY") ||
  env("SERVICE_ROLE_KEY") ||
  env("APPLIX_SERVICE_ROLE_KEY");

const GOOGLE_CLIENT_ID = env("GOOGLE_CLIENT_ID");
const GOOGLE_CLIENT_SECRET = env("GOOGLE_CLIENT_SECRET");
const CRON_SECRET = env("CRON_SECRET") || env("APPLIX_CRON_SECRET");

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers":
    "authorization, x-client-info, apikey, content-type, x-applix-cron-secret, x-cron-secret",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      ...corsHeaders,
      "content-type": "application/json",
    },
  });
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(value);
}

function looksLikeEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function safeHeader(value: string, fallback: string) {
  return txt(value, fallback).replace(/[\r\n]+/g, " ").trim() || fallback;
}

function safeFileName(value: string, fallback = "resume.pdf") {
  const cleaned = txt(value, fallback).replace(/[\r\n\\/]+/g, " ").trim();
  return cleaned || fallback;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function base64Url(input: string) {
  const bytes = new TextEncoder().encode(input);
  return bytesToBase64(bytes)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function wrapBase64(value: string) {
  return value.replace(/.{1,76}/g, "$&\r\n").trim();
}

function bearerToken(req: Request) {
  const authHeader = req.headers.get("authorization") || "";
  return authHeader.replace(/^Bearer\s+/i, "").trim();
}

function isInternalAuthorized(req: Request) {
  const token = bearerToken(req);
  const applixCronHeader = req.headers.get("x-applix-cron-secret") || "";
  const cronHeader = req.headers.get("x-cron-secret") || "";

  if (SUPABASE_SERVICE_ROLE_KEY && token === SUPABASE_SERVICE_ROLE_KEY) return true;
  if (CRON_SECRET && (token === CRON_SECRET || applixCronHeader === CRON_SECRET || cronHeader === CRON_SECRET)) return true;

  return false;
}

function makeRawEmail(
  fromEmail: string,
  to: string,
  subject: string,
  body: string,
  attachment?: ResumeAttachment | null,
  fromName = DEFAULT_FROM_NAME
) {
  const safeSubject = safeHeader(subject, "Application");
  const safeFromEmail = safeHeader(fromEmail, fromEmail);
  const safeFromName = safeHeader(fromName, DEFAULT_FROM_NAME);
  const safeTo = safeHeader(to, to);
  const fromHeader = `${safeFromName} <${safeFromEmail}>`;

  if (!attachment) {
    const message = [
      `From: ${fromHeader}`,
      `To: ${safeTo}`,
      `Subject: ${safeSubject}`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "",
      body,
    ].join("\r\n");

    return base64Url(message);
  }

  const boundary = `applix_${crypto.randomUUID()}`;
  const fileName = safeFileName(attachment.fileName);
  const contentType = safeHeader(attachment.contentType, "application/octet-stream");

  const message = [
    `From: ${fromHeader}`,
    `To: ${safeTo}`,
    `Subject: ${safeSubject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 7bit",
    "",
    body,
    "",
    `--${boundary}`,
    `Content-Type: ${contentType}; name="${fileName}"`,
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename="${fileName}"`,
    "",
    wrapBase64(attachment.base64),
    "",
    `--${boundary}--`,
    "",
  ].join("\r\n");

  return base64Url(message);
}

async function refreshAccessToken(refreshToken: string) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

async function findResumeByProfileId(supabase: ReturnType<typeof createClient>, profileId: string) {
  if (!isUuid(profileId)) return { data: null, error: null };

  return await supabase
    .from("resume_profiles")
    .select("profile_id,email,resume_file_path,resume_file_name,resume_file_type,updated_at")
    .eq("profile_id", profileId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
}

async function findResumeFromCampaignSource(
  supabase: ReturnType<typeof createClient>,
  campaignId: string,
  senderIdentifier: string,
  resumeProfileId: string
) {
  if (!isUuid(campaignId)) return { data: null, error: null };

  let query = supabase
    .from("campaign_resume_sources")
    .select("id,campaign_id,user_identifier,resume_profile_id,profile_id,created_at,updated_at")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false })
    .limit(5);

  const sourceResult = await query;
  if (sourceResult.error) return { data: null, error: sourceResult.error };

  const rows = (sourceResult.data || []) as Row[];
  const preferred = rows.find((row) => {
    const rowUser = txt(row.user_identifier).toLowerCase();
    return !senderIdentifier || rowUser === senderIdentifier.toLowerCase();
  }) || rows[0];

  if (!preferred) return { data: null, error: null };

  const candidateIds = [
    txt(preferred.profile_id),
    txt(preferred.resume_profile_id),
    resumeProfileId,
  ].filter(Boolean);

  for (const candidateId of candidateIds) {
    const result = await findResumeByProfileId(supabase, candidateId);
    if (result.error || result.data?.resume_file_path) return result;
  }

  return { data: null, error: null };
}

async function findResumeProfile(
  supabase: ReturnType<typeof createClient>,
  resumeProfileId: string,
  senderIdentifier: string,
  campaignId: string
) {
  const byCampaign = await findResumeFromCampaignSource(
    supabase,
    campaignId,
    senderIdentifier,
    resumeProfileId
  );
  if (byCampaign.error || byCampaign.data?.resume_file_path) return byCampaign;

  if (isUuid(resumeProfileId)) {
    const byResumeProfileId = await findResumeByProfileId(supabase, resumeProfileId);
    if (byResumeProfileId.error || byResumeProfileId.data?.resume_file_path) return byResumeProfileId;

    const sourceByResumeId = await supabase
      .from("campaign_resume_sources")
      .select("profile_id,resume_profile_id,created_at")
      .eq("resume_profile_id", resumeProfileId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sourceByResumeId.error) return { data: null, error: sourceByResumeId.error };

    const linkedProfileId = txt((sourceByResumeId.data as Row | null)?.profile_id);
    if (linkedProfileId) {
      const linked = await findResumeByProfileId(supabase, linkedProfileId);
      if (linked.error || linked.data?.resume_file_path) return linked;
    }
  }

  if (isUuid(senderIdentifier)) {
    const bySenderUuid = await findResumeByProfileId(supabase, senderIdentifier);
    if (bySenderUuid.error || bySenderUuid.data?.resume_file_path) return bySenderUuid;
  }

  if (looksLikeEmail(senderIdentifier)) {
    const byEmail = await supabase
      .from("resume_profiles")
      .select("profile_id,email,resume_file_path,resume_file_name,resume_file_type,updated_at")
      .ilike("email", senderIdentifier)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (byEmail.error || byEmail.data?.resume_file_path) return byEmail;
  }

  return { data: null, error: null };
}

async function getResumeAttachment(
  supabase: ReturnType<typeof createClient>,
  resumeProfileId: string,
  senderIdentifier: string,
  campaignId: string
): Promise<{
  attachment: ResumeAttachment | null;
  error: string | null;
  profile_id: string | null;
  file_path: string | null;
}> {
  const profileResult = await findResumeProfile(
    supabase,
    resumeProfileId,
    senderIdentifier,
    campaignId
  );

  if (profileResult.error) {
    return {
      attachment: null,
      error: profileResult.error.message,
      profile_id: null,
      file_path: null,
    };
  }

  const profile = profileResult.data as Row | null;
  const filePath = txt(profile?.resume_file_path);

  if (!filePath) {
    return {
      attachment: null,
      error: "No matching saved resume file path found.",
      profile_id: txt(profile?.profile_id) || null,
      file_path: null,
    };
  }

  const downloadResult = await supabase.storage.from("resumes").download(filePath);

  if (downloadResult.error) {
    return {
      attachment: null,
      error: downloadResult.error.message,
      profile_id: txt(profile?.profile_id) || null,
      file_path: filePath,
    };
  }

  const blob = downloadResult.data;
  const bytes = new Uint8Array(await blob.arrayBuffer());

  if (bytes.length > MAX_ATTACHMENT_BYTES) {
    return {
      attachment: null,
      error: `Resume attachment is too large. Max allowed is ${MAX_ATTACHMENT_BYTES} bytes.`,
      profile_id: txt(profile?.profile_id) || null,
      file_path: filePath,
    };
  }

  const fileName = safeFileName(
    txt(profile?.resume_file_name) || filePath.split("/").pop() || "resume.pdf"
  );

  const contentType =
    txt(profile?.resume_file_type) || blob.type || "application/octet-stream";

  return {
    attachment: {
      fileName,
      contentType,
      base64: bytesToBase64(bytes),
    },
    error: null,
    profile_id: txt(profile?.profile_id) || null,
    file_path: filePath,
  };
}

async function loadQueueContext(supabase: ReturnType<typeof createClient>, queueId: string) {
  if (!isUuid(queueId)) return { data: null, error: null };

  return await supabase
    .from("outreach_queue")
    .select("id,campaign_id,user_identifier,recipient_email,subject,email_body,send_attempts")
    .eq("id", queueId)
    .maybeSingle();
}

async function resolveNotificationUserId(supabase: ReturnType<typeof createClient>, candidate: string, campaignId: string) {
  if (isUuid(candidate)) return candidate;
  if (!isUuid(campaignId)) return "";
  const owner = await supabase.from("campaigns").select("user_id").eq("id", campaignId).maybeSingle();
  return isUuid(owner.data?.user_id) ? owner.data.user_id : "";
}

async function notifyCampaignBlocked(supabase: ReturnType<typeof createClient>, identity: string, campaignId: string, reason: string) {
  const userId = await resolveNotificationUserId(supabase, identity, campaignId);
  if (!userId) return;
  await supabase.from("user_notifications").upsert({
    user_id: userId,
    campaign_id: isUuid(campaignId) ? campaignId : null,
    type: "campaign_blocked",
    category: "attention",
    priority: "action_required",
    title: "Campaign needs Gmail attention",
    message: "Calsie could not send an approved application. Reconnect Gmail to continue.",
    action_url: "/dashboard?panel=gmail",
    action_label: "Reconnect Gmail",
    entity_type: "campaign",
    entity_id: isUuid(campaignId) ? campaignId : null,
    dedupe_key: `campaign-blocked:gmail:${campaignId || "unknown"}`,
    status: "unread",
    read_at: null,
    archived_at: null,
    resolved_at: null,
    updated_at: new Date().toISOString(),
    metadata: { reason },
  }, { onConflict: "user_id,dedupe_key" });
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response("ok", { status: 200, headers: corsHeaders });
    }

    if (req.method !== "POST") {
      return json({ ok: false, error: "Use POST." }, 405);
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return json({
        ok: false,
        error: "Missing Gmail server configuration.",
        required_env: ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
      }, 500);
    }

    if (!isInternalAuthorized(req)) {
      return json({ ok: false, error: "Unauthorized Gmail send request." }, 401);
    }

    const input = await req.json().catch(() => ({}));
    const queueId = txt(input.queue_id || input.outreach_queue_id || input.id);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const queueResult = await loadQueueContext(supabase, queueId);
    if (queueResult.error) return json({ ok: false, error: queueResult.error.message }, 500);
    const queue = queueResult.data as Row | null;

    const senderIdentifier = txt(
      input.user_identifier ||
        input.sender_user_identifier ||
        input.sender_email ||
        queue?.user_identifier
    );

    const resumeProfileId = txt(
      input.resume_profile_id ||
        input.profile_id ||
        input.user_id ||
        input.candidate_user_id
    );

    const campaignId = txt(input.campaign_id || queue?.campaign_id);
    const to = normalizeEmail(input.to || input.recipient_email || queue?.recipient_email);
    const subject = txt(input.subject || input.email_subject || queue?.subject, "Application");
    const body = txt(input.body || input.text || input.email_body || queue?.email_body, "");
    const fromName = txt(input.from_name || input.sender_name || input.candidate_name, DEFAULT_FROM_NAME);

    if (!senderIdentifier) {
      return json({ ok: false, error: "user_identifier is required." }, 400);
    }

    if (!to || !looksLikeEmail(to)) {
      return json({ ok: false, error: "Valid recipient email is required.", requested_to: to }, 400);
    }

    if (!subject) {
      return json({ ok: false, error: "Email subject is required." }, 400);
    }

    if (!body) {
      return json({ ok: false, error: "Email body is required." }, 400);
    }

    const authResult = await supabase
      .from("user_email_authorizations")
      .select("user_identifier,provider,provider_email,access_token_encrypted,refresh_token_encrypted,expires_at,status")
      .eq("user_identifier", senderIdentifier)
      .eq("provider", "google")
      .eq("status", "connected")
      .maybeSingle();

    if (authResult.error) return json({ ok: false, error: authResult.error.message }, 500);

    const auth = authResult.data as Row | null;
    if (!auth) {
      await notifyCampaignBlocked(supabase, senderIdentifier, campaignId, "gmail_not_connected");
      return json({
        ok: false,
        error: "No connected Gmail authorization found for this user_identifier.",
        user_identifier: senderIdentifier,
      }, 404);
    }

    let accessToken = txt(auth.access_token_encrypted);
    const refreshToken = txt(auth.refresh_token_encrypted);
    const expiresAt = auth.expires_at ? new Date(String(auth.expires_at)) : null;
    const expiresSoon = !expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() - Date.now() < 120000;

    if (expiresSoon) {
      if (!refreshToken) {
        await notifyCampaignBlocked(supabase, senderIdentifier, campaignId, "missing_refresh_token");
        return json({ ok: false, error: "Missing Gmail refresh token. Reconnect Gmail." }, 401);
      }

      const refreshed = await refreshAccessToken(refreshToken);
      if (!refreshed.ok) {
        await supabase
          .from("user_email_authorizations")
          .update({ status: "error", last_error: JSON.stringify(refreshed.data).slice(0, 500) })
          .eq("user_identifier", senderIdentifier)
          .eq("provider", "google");

        await notifyCampaignBlocked(supabase, senderIdentifier, campaignId, "token_refresh_failed");

        return json({
          ok: false,
          error: "Could not refresh Gmail access token.",
          status: refreshed.status,
          details: refreshed.data,
        }, 401);
      }

      accessToken = txt(refreshed.data.access_token);
      const newExpiresAt = refreshed.data.expires_in
        ? new Date(Date.now() + Number(refreshed.data.expires_in) * 1000).toISOString()
        : null;

      await supabase
        .from("user_email_authorizations")
        .update({ access_token_encrypted: accessToken, expires_at: newExpiresAt, status: "connected", last_error: null })
        .eq("user_identifier", senderIdentifier)
        .eq("provider", "google");
    }

    if (!accessToken) {
      return json({ ok: false, error: "Missing Gmail access token. Reconnect Gmail." }, 401);
    }

    const resumeResult = await getResumeAttachment(
      supabase,
      resumeProfileId,
      senderIdentifier,
      campaignId
    );

    const fromEmail = normalizeEmail(auth.provider_email);
    if (!fromEmail || !looksLikeEmail(fromEmail)) {
      return json({ ok: false, error: "Connected Gmail account does not have a valid provider_email." }, 400);
    }

    const raw = makeRawEmail(fromEmail, to, subject, body, resumeResult.attachment, fromName);

    const sendResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ raw }),
    });

    const sendData = await sendResponse.json().catch(() => ({}));

    if (!sendResponse.ok) {
      if (queueId) {
        await supabase
          .from("outreach_queue")
          .update({
            status: "send_failed",
            last_error: JSON.stringify(sendData).slice(0, 500),
            send_attempts: Number(queue?.send_attempts || 0) + 1,
            updated_at: new Date().toISOString(),
          })
          .eq("id", queueId);
      }

      return json({
        ok: false,
        error: "Gmail send failed.",
        status: sendResponse.status,
        details: sendData,
        attachment_error: resumeResult.error,
      }, sendResponse.status);
    }

    if (queueId) {
      await supabase
        .from("outreach_queue")
        .update({
          status: "sent",
          review_status: "approved",
          provider_message_id: sendData.id || null,
          sent_from: fromEmail,
          send_attempts: Number(queue?.send_attempts || 0) + 1,
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", queueId);
    }

    const notificationUserId = await resolveNotificationUserId(supabase, resumeProfileId || senderIdentifier, campaignId);
    if (notificationUserId) {
      await supabase.from("user_notifications").insert({
        user_id: notificationUserId,
        campaign_id: isUuid(campaignId) ? campaignId : null,
        type: "application_sent",
        category: "applications",
        priority: "update",
        title: "Application sent",
        message: `Gmail confirmed your approved application was sent to ${to}.`,
        action_url: "/dashboard?panel=tracker",
        action_label: "View application",
        entity_type: "outreach_queue",
        entity_id: isUuid(queueId) ? queueId : null,
        dedupe_key: `application-sent:${queueId || sendData.id}`,
        metadata: { queue_id: queueId || null, provider_message_id: sendData.id || null },
      });
    }

    return json({
      ok: true,
      function: "gmail-send",
      test_mode: false,
      queue_id: queueId || null,
      campaign_id: campaignId || null,
      from: fromEmail,
      from_name: fromName,
      to,
      subject,
      attachment_added: Boolean(resumeResult.attachment),
      attachment_name: resumeResult.attachment?.fileName || null,
      attachment_error: resumeResult.error,
      resume_profile_id: resumeResult.profile_id,
      resume_file_path: resumeResult.file_path,
      gmail_message_id: sendData.id || null,
      gmail_thread_id: sendData.threadId || null,
    });
  } catch (error) {
    return json({
      ok: false,
      function: "gmail-send",
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});
