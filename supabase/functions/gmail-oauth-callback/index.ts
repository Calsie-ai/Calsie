import { createClient } from "@supabase/supabase-js";

const env = (name: string) => Deno.env.get(name) ?? "";
const SUPABASE_URL = env("SUPABASE_URL");
const SERVICE_KEY = env("SUPABASE_SERVICE_ROLE_KEY") || env("SERVICE_ROLE_KEY") || env("APPLIX_SERVICE_ROLE_KEY");
const GOOGLE_CLIENT_ID = env("GOOGLE_CLIENT_ID");
const GOOGLE_CLIENT_SECRET = env("GOOGLE_CLIENT_SECRET");
const GOOGLE_REDIRECT_URI = env("GOOGLE_REDIRECT_URI") || `${SUPABASE_URL}/functions/v1/gmail-oauth-callback`;
const APP_URL = env("APP_URL");

type GmailFailureReason =
  | "access_denied"
  | "invalid_state"
  | "expired_state"
  | "account_mismatch"
  | "exchange_failed"
  | "storage_failed"
  | "unknown";

type StatePayload = {
  created_at: string;
  expires_at: string;
  had_active_connection: boolean;
  nonce: string;
  pending_intent_id?: string | null;
  return_to: string;
  user_id: string;
  user_identifier: string;
};

function html(message: string, status = 200) {
  return new Response(
    `<!doctype html><html><body style="font-family:system-ui;padding:32px"><h2>${message}</h2><p>You can close this tab and return to Calsie.</p></body></html>`,
    { status, headers: { "content-type": "text/html" } },
  );
}

function decodeB64url(input: string) {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((input.length + 3) % 4);
  return atob(padded);
}

async function signingKey() {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SERVICE_KEY),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
}

async function parseState(raw: string) {
  try {
    const [payload, signature] = raw.split(".");
    if (!payload || !signature) return { payload: null, reason: "invalid_state" as const };
    const valid = await crypto.subtle.verify(
      "HMAC",
      await signingKey(),
      Uint8Array.from(decodeB64url(signature), (character) => character.charCodeAt(0)),
      new TextEncoder().encode(payload),
    );
    if (!valid) return { payload: null, reason: "invalid_state" as const };
    const parsed = JSON.parse(decodeB64url(payload)) as StatePayload;
    if (
      !parsed.user_id
      || !parsed.user_identifier
      || !parsed.return_to
      || !parsed.created_at
      || !parsed.expires_at
      || !parsed.nonce
    ) {
      return { payload: null, reason: "invalid_state" as const };
    }
    if (Date.parse(parsed.expires_at) <= Date.now()) {
      return { payload: parsed, reason: "expired_state" as const };
    }
    return { payload: parsed, reason: null };
  } catch {
    return { payload: null, reason: "invalid_state" as const };
  }
}

function cleanReturnTo(value: string) {
  try {
    const destination = new URL(value);
    if (destination.protocol !== "https:" && !(destination.protocol === "http:" && destination.hostname === "localhost")) {
      return null;
    }
    if (destination.pathname !== "/dashboard" || destination.searchParams.get("panel") !== "gmail") {
      return null;
    }
    destination.search = "?panel=gmail";
    destination.hash = "";
    return destination;
  } catch {
    return null;
  }
}

function fallbackReturnTo() {
  try {
    return cleanReturnTo(new URL("/dashboard?panel=gmail", APP_URL).toString());
  } catch {
    return null;
  }
}

function redirectResult(
  returnTo: string | undefined,
  result: { gmail: "connected" } | { gmail: "error"; reason: GmailFailureReason },
) {
  const destination = returnTo ? cleanReturnTo(returnTo) : fallbackReturnTo();
  if (!destination) return null;
  destination.searchParams.set("gmail", result.gmail);
  if (result.gmail === "error") destination.searchParams.set("reason", result.reason);
  return Response.redirect(destination.toString(), 302);
}

async function googleJson(url: string, token: string) {
  const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  return { ok: response.ok, data: await response.json().catch(() => ({})) };
}

Deno.serve(async (req) => {
  if (!SUPABASE_URL || !SERVICE_KEY || !GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return html("Gmail connection is temporarily unavailable.", 500);
  }

  const url = new URL(req.url);
  const parsedState = await parseState(url.searchParams.get("state") || "");
  if (parsedState.reason) {
    return redirectResult(parsedState.payload?.return_to, {
      gmail: "error",
      reason: parsedState.reason,
    }) || html("This Gmail connection request is invalid or expired.", 400);
  }

  const state = parsedState.payload;
  if (!state) return html("This Gmail connection request is invalid.", 400);

  const expectedEmail = state.user_identifier.trim().toLowerCase();
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data: boundUser, error: boundUserError } = await admin.auth.admin.getUserById(state.user_id);
  if (
    boundUserError
    || !boundUser?.user?.email
    || boundUser.user.email.trim().toLowerCase() !== expectedEmail
  ) {
    return redirectResult(state.return_to, { gmail: "error", reason: "invalid_state" })
      || html("This Gmail connection request could not be verified.", 400);
  }

  async function readAuthorization() {
    return admin
      .from("user_email_authorizations")
      .select("status,provider_email,connected_at")
      .eq("user_identifier", expectedEmail)
      .eq("provider", "google")
      .maybeSingle();
  }

  async function markFailure(reason: GmailFailureReason) {
    const current = await readAuthorization();
    const hasActiveConnection = (
      current.data?.status === "connected"
      && current.data?.provider_email?.trim().toLowerCase() === expectedEmail
    );
    if (hasActiveConnection) {
      await admin
        .from("user_email_authorizations")
        .update({ last_error: reason, updated_at: new Date().toISOString() })
        .eq("user_identifier", expectedEmail)
        .eq("provider", "google");
      return;
    }
    await admin
      .from("user_email_authorizations")
      .upsert({
        user_identifier: expectedEmail,
        provider: "google",
        status: "error",
        last_error: reason,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_identifier,provider" });
  }

  const oauthError = url.searchParams.get("error");
  if (oauthError) {
    const reason: GmailFailureReason = oauthError === "access_denied" ? "access_denied" : "unknown";
    await markFailure(reason);
    return redirectResult(state.return_to, { gmail: "error", reason })
      || html("Gmail connection was not completed.", 400);
  }

  const code = url.searchParams.get("code");
  if (!code) {
    await markFailure("unknown");
    return redirectResult(state.return_to, { gmail: "error", reason: "unknown" })
      || html("Gmail connection was not completed.", 400);
  }

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: GOOGLE_REDIRECT_URI,
    }),
  });
  const tokens = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok) {
    const current = await readAuthorization();
    const connectedAt = current.data?.connected_at ? Date.parse(current.data.connected_at) : 0;
    const callbackAlreadyCompleted = (
      current.data?.status === "connected"
      && current.data?.provider_email?.trim().toLowerCase() === expectedEmail
      && connectedAt >= Date.parse(state.created_at)
    );
    if (callbackAlreadyCompleted) {
      return redirectResult(state.return_to, { gmail: "connected" })
        || html("Gmail is connected.");
    }
    await markFailure("exchange_failed");
    return redirectResult(state.return_to, { gmail: "error", reason: "exchange_failed" })
      || html("Gmail connection could not be completed.", 500);
  }

  const profileResponse = await googleJson(
    "https://www.googleapis.com/oauth2/v2/userinfo",
    String(tokens.access_token || ""),
  );
  const selectedEmail = String(profileResponse.data?.email || "").trim().toLowerCase();
  if (!profileResponse.ok || !selectedEmail) {
    await markFailure("exchange_failed");
    return redirectResult(state.return_to, { gmail: "error", reason: "exchange_failed" })
      || html("The selected Google account could not be verified.", 500);
  }
  if (selectedEmail !== expectedEmail) {
    await markFailure("account_mismatch");
    return redirectResult(state.return_to, { gmail: "error", reason: "account_mismatch" })
      || html("The selected Google account did not match.", 400);
  }

  const existing = await admin
    .from("user_email_authorizations")
    .select("refresh_token_encrypted,provider_email")
    .eq("user_identifier", expectedEmail)
    .eq("provider", "google")
    .maybeSingle();
  const previousRefresh = existing.data?.provider_email?.toLowerCase() === expectedEmail
    ? existing.data?.refresh_token_encrypted
    : null;
  const refreshToken = tokens.refresh_token || previousRefresh || null;
  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + Number(tokens.expires_in) * 1000).toISOString()
    : null;

  const result = await admin.from("user_email_authorizations").upsert({
    user_identifier: expectedEmail,
    provider: "google",
    provider_email: selectedEmail,
    provider_user_id: profileResponse.data?.id || null,
    access_token_encrypted: tokens.access_token || null,
    refresh_token_encrypted: refreshToken,
    scopes: String(tokens.scope || "").split(" ").filter(Boolean),
    token_type: tokens.token_type || null,
    expires_at: expiresAt,
    status: "connected",
    last_error: null,
    connected_at: new Date().toISOString(),
    revoked_at: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_identifier,provider" });

  if (result.error) {
    await markFailure("storage_failed");
    return redirectResult(state.return_to, { gmail: "error", reason: "storage_failed" })
      || html("Gmail authorization could not be saved.", 500);
  }

  await admin
    .from("user_notifications")
    .update({ resolved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("user_id", state.user_id)
    .eq("type", "campaign_blocked")
    .is("resolved_at", null);

  return redirectResult(state.return_to, { gmail: "connected" })
    || html("Gmail is connected.");
});

