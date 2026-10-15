import { randomBytes, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { bearer, gmailConfig, gmailFailure, gmailUser, requireOrigin, transition } from "../../../../lib/gmailServer";
import { GMAIL_SCOPES, GMAIL_STATE_TTL_SECONDS, nonceHash, seal } from "../../../../lib/gmailSecurity";
import { GMAIL_PRIVACY_POLICY_VERSION, GMAIL_CONNECTION_CONSENT_TEXT, GMAIL_DEDICATED_EMAIL_CONFIRMATION_TEXT } from "../../../dashboard/gmail-consent";

export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    requireOrigin(req);
    const accessToken = bearer(req);
    const user = await gmailUser(accessToken);
    const body = await req.json().catch(() => ({}));
    if (body.privacy_accepted !== true || body.dedicated_email_confirmed !== true || body.policy_version !== GMAIL_PRIVACY_POLICY_VERSION) {
      return NextResponse.json({ ok: false, error: "Read the privacy policy and confirm both consent checkboxes." }, { status: 400 });
    }
    const config = gmailConfig();
    const nonce = randomBytes(32).toString("base64url");
    const attemptId = randomUUID();
    const expiresAt = Date.now() + GMAIL_STATE_TTL_SECONDS * 1000;
    const binding = seal({ attemptId, nonce, userId: user.id, accessToken, expiresAt }, config.key, "oauth-browser");
    if (Buffer.byteLength(binding) > 3700) throw new Error("GMAIL_SESSION_TOO_LARGE");
    const started = await transition("begin", user.id, { attempt_id: attemptId, nonce_hash: nonceHash(nonce), expires_at: new Date(expiresAt).toISOString(),
      consent: { policy_version: GMAIL_PRIVACY_POLICY_VERSION, privacy_accepted: true, dedicated_email_confirmed: true,
        connection_text: GMAIL_CONNECTION_CONSENT_TEXT, dedicated_text: GMAIL_DEDICATED_EMAIL_CONFIRMATION_TEXT } });
    if (!started.ok) return NextResponse.json({ ok: false, code: "GMAIL_REVOCATION_PENDING", error: "Gmail disconnection is still finishing. Wait two minutes before reconnecting." }, { status: 409 });
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri, response_type: "code", access_type: "offline",
      prompt: "consent select_account", scope: GMAIL_SCOPES.join(" "), state: nonce, include_granted_scopes: "false" }).toString();
    const response = NextResponse.json({ ok: true, authorization_url: url.toString() }, { headers: { "Cache-Control": "no-store" } });
    response.cookies.set(config.cookieName, binding,
      { httpOnly: true, secure: config.secure, sameSite: "lax", path: "/", maxAge: GMAIL_STATE_TTL_SECONDS });
    return response;
  } catch (error) { return gmailFailure(error); }
}
