import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { bearer, gmailConfig, gmailFailure, gmailUser, requireOrigin, transition } from "../../../../lib/gmailServer";
import { unseal } from "../../../../lib/gmailSecurity";

export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    requireOrigin(req);
    const user = await gmailUser(bearer(req));
    const traceId = randomUUID();
    // Clear credentials and cancel all attempts atomically BEFORE contacting Google.
    const result = await transition("disconnect", user.id, { trace_id: traceId });
    if (result.revocation_pending || result.revocation_unknown) {
      return NextResponse.json({ ok: true, connected: false, revocation_confirmed: false,
        message: result.revocation_pending ? "Gmail disconnected. Google revocation is still finishing." : "Gmail disconnected from Calsie. Remove Calsie access in your Google Account settings before reconnecting." }, { headers: { "Cache-Control": "no-store" } });
    }
    let revoked = !result.token_ciphertext;
    if (result.token_ciphertext) {
      try {
        const tokens = unseal<{ refresh_token: string }>(result.token_ciphertext, gmailConfig().key, `gmail-tokens:${user.id}`);
        const response = await fetch("https://oauth2.googleapis.com/revoke", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token: tokens.refresh_token }), signal: AbortSignal.timeout(10000) });
        // invalid_token means the grant has already been revoked.
        const body = await response.json().catch(() => ({}));
        revoked = response.ok || (response.status === 400 && body.error === "invalid_token");
      } catch { revoked = false; }
    }
    await transition("revocation_result", user.id, { trace_id: traceId, confirmed: revoked });
    return NextResponse.json({ ok: true, connected: false, revocation_confirmed: revoked,
      message: revoked ? "Gmail disconnected." : "Gmail disconnected from Calsie. Google revocation could not be confirmed; remove Calsie access in your Google Account settings." }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return gmailFailure(error); }
}
