import { createClient } from "@supabase/supabase-js";

const PROJECT_URL = "https://bnshgtrqbfuphhhdgccs.supabase.co";
const env = (name: string) => Deno.env.get(name) ?? "";

function firstSecretKey() {
  const direct = env("SUPABASE_SERVICE_ROLE_KEY") || env("SERVICE_ROLE_KEY") || env("APPLIX_SERVICE_ROLE_KEY");
  if (direct) return direct;
  const modern = env("SUPABASE_SECRET_KEYS");
  if (!modern) return "";
  try {
    const parsed = JSON.parse(modern);
    if (Array.isArray(parsed)) return parsed[0]?.secret_key || parsed[0]?.key || parsed[0] || "";
    if (typeof parsed === "object") return parsed.secret_key || parsed.key || Object.values(parsed)[0] as string || "";
  } catch {
    return modern;
  }
  return "";
}

const SUPABASE_URL = env("SUPABASE_URL") || PROJECT_URL;
const SERVICE_KEY = firstSecretKey();
const GOOGLE_CLIENT_ID = env("GOOGLE_CLIENT_ID");
const GOOGLE_REDIRECT_URI = env("GOOGLE_REDIRECT_URI") || `${PROJECT_URL}/functions/v1/gmail-oauth-callback`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function b64urlBytes(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function b64urlText(input: string) {
  return b64urlBytes(new TextEncoder().encode(input));
}

function decodeB64url(input: string) {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((input.length + 3) % 4);
  return atob(padded);
}

async function importSigningKey() {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SERVICE_KEY),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function sign(payload: string) {
  const key = await importSigningKey();
  return b64urlBytes(new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)),
  ));
}

async function verifyEnvelope(raw: unknown) {
  if (typeof raw !== "string") return null;
  try {
    const [payload, signature] = raw.split(".");
    if (!payload || !signature) return null;
    const key = await importSigningKey();
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      Uint8Array.from(decodeB64url(signature), (character) => character.charCodeAt(0)),
      new TextEncoder().encode(payload),
    );
    if (!valid) return null;
    const parsed = JSON.parse(decodeB64url(payload));
    if (!parsed.expires_at || Date.parse(parsed.expires_at) <= Date.now()) return null;
    return parsed as {
      pending_intent_id?: string | null;
      return_to: string;
      user_id: string;
    };
  } catch {
    return null;
  }
}

function safeSignedReturnTo(value: unknown) {
  try {
    const candidate = new URL(String(value || ""));
    if (candidate.protocol !== "https:" && !(candidate.protocol === "http:" && candidate.hostname === "localhost")) {
      return null;
    }
    if (candidate.pathname !== "/dashboard" || candidate.searchParams.get("panel") !== "gmail") {
      return null;
    }
    candidate.search = "?panel=gmail";
    candidate.hash = "";
    return candidate.toString();
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "Use POST" }, 405);
  if (!SUPABASE_URL || !SERVICE_KEY || !GOOGLE_CLIENT_ID) {
    return json({ ok: false, error: "Missing OAuth configuration" }, 500);
  }

  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ ok: false, error: "Authentication required" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const user = userData?.user;
  if (userError || !user?.email) return json({ ok: false, error: "Invalid session" }, 401);

  const body = await req.json().catch(() => ({}));
  const envelope = await verifyEnvelope(body.return_token);
  const returnTo = safeSignedReturnTo(envelope?.return_to);
  if (!envelope || envelope.user_id !== user.id || !returnTo) {
    return json({ ok: false, error: "Invalid return state" }, 400);
  }

  const userIdentifier = user.email.trim().toLowerCase();
  const { data: existing, error: readError } = await admin
    .from("user_email_authorizations")
    .select("status,provider_email,connected_at")
    .eq("user_identifier", userIdentifier)
    .eq("provider", "google")
    .maybeSingle();
  if (readError) return json({ ok: false, error: "Could not read Gmail connection" }, 500);

  const hadActiveConnection = (
    existing?.status === "connected"
    && existing.provider_email?.trim().toLowerCase() === userIdentifier
  );
  if (!hadActiveConnection) {
    const { error: pendingError } = await admin.from("user_email_authorizations").upsert({
      user_identifier: userIdentifier,
      provider: "google",
      status: "pending",
      last_error: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_identifier,provider" });
    if (pendingError) return json({ ok: false, error: "Could not prepare Gmail connection" }, 500);
  }

  const statePayload = {
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    had_active_connection: hadActiveConnection,
    nonce: crypto.randomUUID(),
    pending_intent_id: envelope.pending_intent_id || null,
    return_to: returnTo,
    user_id: user.id,
    user_identifier: userIdentifier,
  };
  const payload = b64urlText(JSON.stringify(statePayload));
  const state = `${payload}.${await sign(payload)}`;

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", GOOGLE_CLIENT_ID);
  url.searchParams.set("redirect_uri", GOOGLE_REDIRECT_URI);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", [
    "https://www.googleapis.com/auth/gmail.send",
    "openid",
    "email",
    "profile",
  ].join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "select_account consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("login_hint", userIdentifier);
  url.searchParams.set("state", state);

  return json({ ok: true, authorization_url: url.toString() });
});

