import { NextResponse } from "next/server";
import { createHmac, randomUUID } from "node:crypto";
import { safeInternalPath } from "../../../../lib/navigation";
import { resolveAppOrigin } from "../../../../lib/serverOrigin";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://bnshgtrqbfuphhhdgccs.supabase.co";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const INTENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,191}$/;

type ConnectGmailBody = {
  access_token?: string;
  pending_intent_id?: string;
  provider?: string;
  return_path?: string;
};

async function getCurrentUser(accessToken: string) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: SUPABASE_ANON_KEY,
    },
    cache: "no-store",
  });
  if (!response.ok) return null;
  return response.json().catch(() => null) as Promise<{ id?: string; email?: string } | null>;
}

function createReturnToken(payload: Record<string, unknown>) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", SUPABASE_SERVICE_ROLE_KEY)
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${signature}`;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as ConnectGmailBody;
    const accessToken = body.access_token?.trim() || "";
    const returnPath = safeInternalPath(body.return_path, "/dashboard?panel=gmail");
    const pendingIntentId = body.pending_intent_id?.trim() || "";

    if (!accessToken) {
      return NextResponse.json({ ok: false, error: "Authentication required. Please sign in again." }, { status: 401 });
    }
    if (!SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ ok: false, error: "Gmail connection is unavailable." }, { status: 500 });
    }
    if (
      body.provider !== "google"
      || returnPath !== body.return_path
      || returnPath !== "/dashboard?panel=gmail"
      || (pendingIntentId && !INTENT_ID_PATTERN.test(pendingIntentId))
    ) {
      return NextResponse.json({ ok: false, error: "The Gmail return state is invalid." }, { status: 400 });
    }

    const currentUser = await getCurrentUser(accessToken);
    if (!currentUser?.id || !currentUser.email) {
      return NextResponse.json({ ok: false, error: "Authentication required. Please sign in again." }, { status: 401 });
    }

    const returnToken = createReturnToken({
      expires_at: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
      nonce: randomUUID(),
      pending_intent_id: pendingIntentId || null,
      return_to: `${resolveAppOrigin()}${returnPath}`,
      user_id: currentUser.id,
    });

    const response = await fetch(`${SUPABASE_URL}/functions/v1/connect-gmail`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        return_token: returnToken,
      }),
      signal: req.signal,
    });

    const data = await response.json().catch(() => ({})) as {
      authorization_url?: string;
      ok?: boolean;
    };
    if (!response.ok || !data.authorization_url) {
      return NextResponse.json({ ok: false, error: "Could not start Gmail connection." }, { status: response.status || 502 });
    }

    return NextResponse.json({
      ok: true,
      authorization_url: data.authorization_url,
    });
  } catch {
    return NextResponse.json({ ok: false, error: "Could not start Gmail connection." }, { status: 500 });
  }
}
