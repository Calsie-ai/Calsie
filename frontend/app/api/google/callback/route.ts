import { NextRequest, NextResponse } from "next/server";
import { gmailConfig, gmailUser, transition } from "../../../../lib/gmailServer";
import { hasSendScope, matchesState, nonceHash, seal, unseal } from "../../../../lib/gmailSecurity";

export const runtime = "nodejs";
type BrowserBinding = { attemptId: string; nonce: string; userId: string; accessToken: string; expiresAt: number };
export async function GET(req: NextRequest) {
  let config: ReturnType<typeof gmailConfig>;
  try { config = gmailConfig(); } catch {
    return NextResponse.json({ error: "Gmail connection is unavailable." }, { status: 503 });
  }
  const finish = (reason?: string) => {
    const url = new URL("/dashboard?panel=gmail", config.origin);
    url.searchParams.set("gmail", reason ? "error" : "connected");
    if (reason) url.searchParams.set("reason", reason);
    const response = NextResponse.redirect(url, 303);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.cookies.set(config.cookieName, "", { httpOnly: true, secure: config.secure, sameSite: "lax", path: "/", maxAge: 0 });
    return response;
  };
  let binding: BrowserBinding | undefined;
  let claimed = false;
  let failureCode = "GMAIL_INVALID_STATE";
  try {
    binding = unseal<BrowserBinding>(req.cookies.get(config.cookieName)?.value || "", config.key, "oauth-browser");
    if (!matchesState(req.nextUrl.searchParams.get("state"), binding.nonce)) return finish("invalid_state");
    if (binding.expiresAt <= Date.now()) return finish("expired_state");
    const user = await gmailUser(binding.accessToken);
    if (user.id !== binding.userId) return finish("account_mismatch");
    const attempt = await transition("claim", user.id, { attempt_id: binding.attemptId, nonce_hash: nonceHash(binding.nonce) });
    if (!attempt.ok) return finish("invalid_state");
    claimed = true;
    if (req.nextUrl.searchParams.has("error")) {
      await transition("fail", user.id, { attempt_id: binding.attemptId, error_code: "GMAIL_ACCESS_DENIED" });
      return finish("access_denied");
    }
    const code = req.nextUrl.searchParams.get("code");
    if (!code || code.length > 4096) throw new Error("GMAIL_CODE_MISSING");
    failureCode = "GMAIL_EXCHANGE_FAILED";
    const exchange = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: config.redirectUri, grant_type: "authorization_code" }),
      signal: AbortSignal.timeout(15000), cache: "no-store" });
    const tokens = await exchange.json();
    if (!exchange.ok || !tokens.access_token || !tokens.refresh_token || !hasSendScope(tokens.scope) || tokens.token_type?.toLowerCase() !== "bearer") throw new Error(failureCode);
    const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${tokens.access_token}` }, signal: AbortSignal.timeout(10000), cache: "no-store" });
    const profile = await profileResponse.json();
    if (!profileResponse.ok || typeof profile.email !== "string" || profile.email_verified !== true || typeof profile.sub !== "string") throw new Error(failureCode);
    failureCode = "GMAIL_STORAGE_FAILED";
    // Tokens are bound to the local user; Google email may be a dedicated account different from login.
    const saved = await transition("complete", user.id, { attempt_id: binding.attemptId, gmail_email: profile.email, google_subject: profile.sub,
      scope: tokens.scope, token_ciphertext: seal({ access_token: tokens.access_token, refresh_token: tokens.refresh_token,
        expires_at: Date.now() + Number(tokens.expires_in || 3600) * 1000 }, config.key, `gmail-tokens:${user.id}`) });
    if (!saved.ok) throw new Error(failureCode);
    return finish();
  } catch {
    if (claimed && binding) {
      await transition("fail", binding.userId, { attempt_id: binding.attemptId, error_code: failureCode }).catch(() => {});
      // Discard failed/abandoned credentials locally. Google revokes a whole grant,
      // so revoking this token here could break a newer successful authorization.
    }
    return finish(claimed ? (failureCode === "GMAIL_STORAGE_FAILED" ? "storage_failed" : "exchange_failed") : "invalid_state");
  }
}
