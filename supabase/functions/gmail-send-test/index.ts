import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type Row = Record<string, any>;

type ResumeAttachment = {
  fileName: string;
  contentType: string;
  base64: string;
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "";
const TEST_RECIPIENT_EMAIL = "hostsajan@gmail.com";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function txt(value: unknown, fallback = "") {
  if (value === undefined || value === null) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
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
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function wrapBase64(value: string) {
  return value.replace(/.{1,76}/g, "$&\r\n").trim();
}

function makeRawEmail(from: string, to: string, subject: string, body: string, attachment?: ResumeAttachment | null) {
  const safeSubject = safeHeader(subject, "Applix test email");
  const safeFrom = safeHeader(from, TEST_RECIPIENT_EMAIL);
  const safeTo = safeHeader(to, TEST_RECIPIENT_EMAIL);

  if (!attachment) {
    const message = [
      `From: ${safeFrom}`,
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
    `From: ${safeFrom}`,
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

async function findResumeProfile(supabase: ReturnType<typeof createClient>, resumeProfileId: string, senderIdentifier: string) {
  if (isUuid(resumeProfileId)) {
    const byProfileId = await supabase
      .from("resume_profiles")
      .select("profile_id,email,resume_file_path,resume_file_name,resume_file_type,updated_at")
      .eq("profile_id", resumeProfileId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (byProfileId.data?.resume_file_path || byProfileId.error) return byProfileId;
  }

  if (isUuid(senderIdentifier)) {
    const bySenderUuid = await supabase
      .from("resume_profiles")
      .select("profile_id,email,resume_file_path,resume_file_name,resume_file_type,updated_at")
      .eq("profile_id", senderIdentifier)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (bySenderUuid.data?.resume_file_path || bySenderUuid.error) return bySenderUuid;
  }

  const byEmail = await supabase
    .from("resume_profiles")
    .select("profile_id,email,resume_file_path,resume_file_name,resume_file_type,updated_at")
    .eq("email", senderIdentifier)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (byEmail.data?.resume_file_path || byEmail.error) return byEmail;

  return await supabase
    .from("resume_profiles")
    .select("profile_id,email,resume_file_path,resume_file_name,resume_file_type,updated_at")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
}

async function getResumeAttachment(
  supabase: ReturnType<typeof createClient>,
  resumeProfileId: string,
  senderIdentifier: string,
): Promise<{ attachment: ResumeAttachment | null; error: string | null; profile_id: string | null; file_path: string | null }> {
  const profileResult = await findResumeProfile(supabase, resumeProfileId, senderIdentifier);
  if (profileResult.error) return { attachment: null, error: profileResult.error.message, profile_id: null, file_path: null };

  const profile = profileResult.data as Row | null;
  const filePath = txt(profile?.resume_file_path);
  if (!filePath) return { attachment: null, error: "No saved resume file path found.", profile_id: txt(profile?.profile_id) || null, file_path: null };

  const downloadResult = await supabase.storage.from("resumes").download(filePath);
  if (downloadResult.error) return { attachment: null, error: downloadResult.error.message, profile_id: txt(profile?.profile_id) || null, file_path: filePath };

  const blob = downloadResult.data;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const fileName = safeFileName(txt(profile?.resume_file_name) || filePath.split("/").pop() || "resume.pdf");
  const contentType = txt(profile?.resume_file_type) || blob.type || "application/octet-stream";

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

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return json({ ok: false, error: "Use POST" }, 405);

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return json({ ok: false, error: "Missing Gmail server configuration" }, 500);
    }

    const input = await req.json().catch(() => ({}));
    const senderIdentifier = txt(input.user_identifier || input.sender_user_identifier || input.sender_email);
    const resumeProfileId = txt(input.resume_profile_id || input.profile_id || input.user_id || input.candidate_user_id);
    const to = txt(input.to || input.recipient_email, TEST_RECIPIENT_EMAIL).toLowerCase();
    const subject = txt(input.subject || input.email_subject, "Applix test email");
    const body = txt(
      input.body || input.text || input.email_body,
      "Hi,\n\nI hope you are well. I am reaching out through Applix with interest in this opportunity. I have attached my resume for your review and would appreciate the chance to be considered.\n\nKind regards,\nApplix Candidate"
    );

    if (!senderIdentifier) return json({ ok: false, error: "user_identifier is required" }, 400);
    if (to !== TEST_RECIPIENT_EMAIL) {
      return json({ ok: false, error: "Test sender is locked to hostsajan@gmail.com only", requested_to: to }, 403);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const authResult = await supabase
      .from("user_email_authorizations")
      .select("user_identifier,provider,provider_email,access_token_encrypted,refresh_token_encrypted,expires_at,status")
      .eq("user_identifier", senderIdentifier)
      .eq("provider", "google")
      .eq("status", "connected")
      .maybeSingle();

    if (authResult.error) return json({ ok: false, error: authResult.error.message }, 500);
    const auth = authResult.data as Row | null;
    if (!auth) return json({ ok: false, error: "No connected Gmail authorization found for this user_identifier", user_identifier: senderIdentifier }, 404);

    let accessToken = txt(auth.access_token_encrypted);
    const refreshToken = txt(auth.refresh_token_encrypted);
    const expiresAt = auth.expires_at ? new Date(String(auth.expires_at)) : null;
    const expiresSoon = !expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() - Date.now() < 120000;

    if (expiresSoon) {
      if (!refreshToken) return json({ ok: false, error: "Missing Gmail refresh token. Reconnect Gmail." }, 401);
      const refreshed = await refreshAccessToken(refreshToken);
      if (!refreshed.ok) {
        await supabase
          .from("user_email_authorizations")
          .update({ status: "error", last_error: JSON.stringify(refreshed.data).slice(0, 500) })
          .eq("user_identifier", senderIdentifier)
          .eq("provider", "google");
        return json({ ok: false, error: "Could not refresh Gmail access token", details: refreshed.data }, 401);
      }

      accessToken = txt(refreshed.data.access_token);
      const newExpiresAt = refreshed.data.expires_in ? new Date(Date.now() + Number(refreshed.data.expires_in) * 1000).toISOString() : null;
      await supabase
        .from("user_email_authorizations")
        .update({
          access_token_encrypted: accessToken,
          expires_at: newExpiresAt,
          status: "connected",
          last_error: null,
        })
        .eq("user_identifier", senderIdentifier)
        .eq("provider", "google");
    }

    if (!accessToken) return json({ ok: false, error: "Missing Gmail access token. Reconnect Gmail." }, 401);

    const resumeResult = await getResumeAttachment(supabase, resumeProfileId, senderIdentifier);
    const fromEmail = txt(auth.provider_email, TEST_RECIPIENT_EMAIL);
    const raw = makeRawEmail(fromEmail, TEST_RECIPIENT_EMAIL, subject, body, resumeResult.attachment);

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
      return json({ ok: false, error: "Gmail send failed", status: sendResponse.status, details: sendData, resume_error: resumeResult.error }, sendResponse.status);
    }

    return json({
      ok: true,
      function: "gmail-send-test",
      test_mode: true,
      from: fromEmail,
      to: TEST_RECIPIENT_EMAIL,
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
    return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
