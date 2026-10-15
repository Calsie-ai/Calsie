// Server routes only. Never import into a client component.
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { assertJobsProject, encryptionKey } from "./gmailSecurity";

export function gmailConfig() {
  assertJobsProject(process.env.GMAIL_SUPABASE_URL);
  const serviceKey = process.env.GMAIL_SUPABASE_SERVICE_ROLE_KEY;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!serviceKey || !clientId || !clientSecret || !redirectUri) throw new Error("GMAIL_CONFIGURATION");
  const redirect = new URL(redirectUri);
  if ((redirect.protocol !== "https:" && !(redirect.protocol === "http:" && redirect.hostname === "localhost"))
    || redirect.pathname !== "/api/google/callback" || redirect.search || redirect.hash || redirect.username || redirect.password) throw new Error("GMAIL_CONFIGURATION");
  return { url: process.env.GMAIL_SUPABASE_URL!, serviceKey, clientId, clientSecret, redirectUri, origin: redirect.origin,
    cookieName: redirect.protocol === "https:" ? "__Host-calsie-gmail" : "calsie-gmail-local", secure: redirect.protocol === "https:",
    key: encryptionKey(process.env.GMAIL_TOKEN_ENCRYPTION_KEY) };
}
export function gmailDb() {
  const config = gmailConfig();
  return createClient(config.url, config.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}
export async function gmailUser(accessToken: string) {
  if (!accessToken || accessToken.length > 8000) throw new Error("GMAIL_AUTH_REQUIRED");
  const { data, error } = await gmailDb().auth.getUser(accessToken);
  if (error || !data.user) throw new Error("GMAIL_AUTH_REQUIRED");
  // getUser verifies the JWT. Check the corresponding session still exists as logout
  // revokes the refresh session before the access JWT itself expires.
  let sessionId: string | undefined;
  try { sessionId = JSON.parse(Buffer.from(accessToken.split(".")[1], "base64url").toString()).session_id; } catch {}
  if (!sessionId || !/^[a-f0-9-]{36}$/i.test(sessionId)) throw new Error("GMAIL_AUTH_REQUIRED");
  const active = await transition("session_active", data.user.id, { session_id: sessionId });
  if (!active.ok) throw new Error("GMAIL_AUTH_REQUIRED");
  return data.user;
}
export function bearer(req: Request) {
  const header = req.headers.get("authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7) : "";
}
export function requireOrigin(req: Request) {
  if (req.headers.get("origin") !== gmailConfig().origin || new URL(req.url).origin !== gmailConfig().origin) throw new Error("GMAIL_ORIGIN_REJECTED");
}
export async function transition(action: string, userId: string, data: Record<string, unknown> = {}) {
  const { data: result, error } = await gmailDb().rpc("calsie_gmail_transition", { p_action: action, p_user_id: userId, p_data: data });
  if (error) throw new Error("GMAIL_STORAGE_FAILED");
  return result as Record<string, any>;
}
export function gmailFailure(error: unknown) {
  const code = error instanceof Error && /^GMAIL_[A-Z_]+$/.test(error.message) ? error.message : "GMAIL_UNAVAILABLE";
  const traceId = randomUUID();
  // No raw provider errors, tokens, authorization codes, or user details in logs.
  console.error("Gmail request failed", { code, traceId });
  const status = code === "GMAIL_AUTH_REQUIRED" ? 401 : code === "GMAIL_ORIGIN_REJECTED" ? 403 : 503;
  return NextResponse.json({ ok: false, code, trace_id: traceId, error: status === 401 ? "Your session expired. Sign in again." : "Gmail connection is unavailable. Please try again later." }, { status, headers: { "Cache-Control": "no-store" } });
}
