import { NextResponse } from "next/server";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://bnshgtrqbfuphhhdgccs.supabase.co";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

type Body = { access_token?: string; purchase_id?: string };

async function currentUser(accessToken: string) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${accessToken}`, apikey: SUPABASE_ANON_KEY },
    cache: "no-store",
  });
  if (!response.ok) return null;
  return response.json().catch(() => null) as Promise<{ id?: string } | null>;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Body;
  const accessToken = body.access_token?.trim() || "";
  const purchaseId = body.purchase_id?.trim() || "";
  if (!accessToken || !purchaseId) {
    return NextResponse.json({ ok: false, error: "Authentication and purchase are required." }, { status: 400 });
  }
  if (!SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ ok: false, error: "Campaign activation is unavailable." }, { status: 500 });
  }

  const user = await currentUser(accessToken);
  if (!user?.id) return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });

  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/applix_activate_purchased_template_campaign`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_user_id: user.id, p_purchase_id: purchaseId }),
    cache: "no-store",
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || typeof result !== "string") {
    return NextResponse.json({ ok: false, error: "Could not activate the purchased campaign." }, { status: 409 });
  }

  return NextResponse.json({ ok: true, campaign_id: result, purchase_id: purchaseId });
}
