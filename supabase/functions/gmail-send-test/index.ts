import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type Row = Record<string, any>;

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

function base64Url(input: string) {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function makeRawEmail(from: string, to: string, subject: string, body: string) {
  const safeSubject = subject.replace(/[\r\n]+/g, " ").trim() || "Applix test email";
  const message = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${safeSubject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    body,
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

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return json({ ok: false, error: "Use POST" }, 405);

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return json({ ok: false, error: "Missing Gmail server configuration" }, 500);
    }

    const input = await req.json().catch(() => ({}));
    const userIdentifier = txt(input.user_identifier || input.user_id || input.sender_user_identifier);
    const to = txt(input.to || input.recipient_email, TEST_RECIPIENT_EMAIL).toLowerCase();
    const subject = txt(input.subject || input.email_subject, "Applix test email");
    const body = txt(input.body || input.text || input.email_body, "This is a test email from Applix.");

    if (!userIdentifier) return json({ ok: false, error: "user_identifier is required" }, 400);
    if (to !== TEST_RECIPIENT_EMAIL) {
      return json({ ok: false, error: "Test sender is locked to hostsajan@gmail.com only", requested_to: to }, 403);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const authResult = await supabase
      .from("user_email_authorizations")
      .select("user_identifier,provider,provider_email,access_token_encrypted,refresh_token_encrypted,expires_at,status")
      .eq("user_identifier", userIdentifier)
      .eq("provider", "google")
      .eq("status", "connected")
      .maybeSingle();

    if (authResult.error) return json({ ok: false, error: authResult.error.message }, 500);
    const auth = authResult.data as Row | null;
    if (!auth) return json({ ok: false, error: "No connected Gmail authorization found for this user_identifier" }, 404);

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
          .eq("user_identifier", userIdentifier)
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
        .eq("user_identifier", userIdentifier)
        .eq("provider", "google");
    }

    if (!accessToken) return json({ ok: false, error: "Missing Gmail access token. Reconnect Gmail." }, 401);

    const fromEmail = txt(auth.provider_email, TEST_RECIPIENT_EMAIL);
    const raw = makeRawEmail(fromEmail, TEST_RECIPIENT_EMAIL, subject, body);

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
      return json({ ok: false, error: "Gmail send failed", status: sendResponse.status, details: sendData }, sendResponse.status);
    }

    return json({
      ok: true,
      function: "gmail-send-test",
      test_mode: true,
      from: fromEmail,
      to: TEST_RECIPIENT_EMAIL,
      subject,
      gmail_message_id: sendData.id || null,
      gmail_thread_id: sendData.threadId || null,
    });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
