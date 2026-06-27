import { NextResponse } from "next/server";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://bnshgtrqbfuphhhdgccs.supabase.co";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

type StatusBody = {
  access_token?: string;
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

function isActiveStatus(status?: string | null) {
  return status === "active" || status === "trialing";
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as StatusBody;
    const accessToken = body.access_token;

    if (!accessToken) {
      return NextResponse.json({ ok: false, error: "Missing access token." }, { status: 401 });
    }

    if (!SUPABASE_ANON_KEY) {
      return NextResponse.json({ ok: false, error: "Missing NEXT_PUBLIC_SUPABASE_ANON_KEY." }, { status: 500 });
    }

    const currentUser = await getCurrentUser(accessToken);
    if (!currentUser?.id) {
      return NextResponse.json({ ok: false, error: "Could not verify user." }, { status: 401 });
    }

    const response = await fetch(`${SUPABASE_URL}/rest/v1/applix_subscriptions?user_id=eq.${encodeURIComponent(currentUser.id)}&select=*`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: SUPABASE_ANON_KEY,
      },
      cache: "no-store",
    });

    const rows = await response.json().catch(() => []);
    if (!response.ok) {
      return NextResponse.json({ ok: false, error: "Could not load payment status.", details: rows }, { status: response.status });
    }

    const subscription = Array.isArray(rows) ? rows[0] : null;
    return NextResponse.json({
      ok: true,
      paid: isActiveStatus(subscription?.status),
      status: subscription?.status || "inactive",
      subscription: subscription || null,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not check payment status." }, { status: 500 });
  }
}
