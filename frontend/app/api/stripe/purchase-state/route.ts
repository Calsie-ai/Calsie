import { NextResponse } from "next/server";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://bnshgtrqbfuphhhdgccs.supabase.co";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

type Body = { access_token?: string; template_id?: string };
type Purchase = {
  id: string;
  purchase_status: string;
  payment_status: string;
  template_id: string;
};
type Campaign = { id: string; source_purchase_id: string | null };

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
  const templateId = body.template_id?.trim() || "";
  if (!accessToken || !templateId) {
    return NextResponse.json({ ok: false, error: "Authentication and template are required." }, { status: 400 });
  }
  if (!SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ ok: false, error: "Purchase state is unavailable." }, { status: 500 });
  }

  const user = await currentUser(accessToken);
  if (!user?.id) return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });

  const purchaseQuery = new URLSearchParams({
    user_id: `eq.${user.id}`,
    template_id: `eq.${templateId}`,
    select: "id,purchase_status,payment_status,template_id",
    order: "purchase_sequence.desc",
    limit: "1",
  });
  const purchaseResponse = await fetch(`${SUPABASE_URL}/rest/v1/applix_purchases?${purchaseQuery}`, {
    headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, apikey: SUPABASE_SERVICE_ROLE_KEY },
    cache: "no-store",
  });
  const purchases = await purchaseResponse.json().catch(() => []);
  if (!purchaseResponse.ok) return NextResponse.json({ ok: false, error: "Could not load purchase state." }, { status: 500 });
  const purchase = (Array.isArray(purchases) ? purchases[0] : null) as Purchase | null;

  if (!purchase) return NextResponse.json({ ok: true, state: "not_purchased", template_id: templateId });

  if (purchase.purchase_status === "checkout_started" || purchase.purchase_status === "pending") {
    return NextResponse.json({ ok: true, state: "processing", template_id: templateId, purchase_id: purchase.id });
  }
  if (purchase.purchase_status === "payment_failed" || purchase.purchase_status === "expired") {
    return NextResponse.json({ ok: true, state: "failed_or_expired", template_id: templateId, purchase_id: purchase.id });
  }
  if (!['paid', 'partially_refunded'].includes(purchase.purchase_status)) {
    return NextResponse.json({ ok: true, state: "failed_or_expired", template_id: templateId, purchase_id: purchase.id });
  }

  const campaignQuery = new URLSearchParams({
    user_id: `eq.${user.id}`,
    source_purchase_id: `eq.${purchase.id}`,
    select: "id,source_purchase_id",
    limit: "1",
  });
  const campaignResponse = await fetch(`${SUPABASE_URL}/rest/v1/campaigns?${campaignQuery}`, {
    headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, apikey: SUPABASE_SERVICE_ROLE_KEY },
    cache: "no-store",
  });
  const campaigns = await campaignResponse.json().catch(() => []);
  if (!campaignResponse.ok) return NextResponse.json({ ok: false, error: "Could not load campaign state." }, { status: 500 });
  const campaign = (Array.isArray(campaigns) ? campaigns[0] : null) as Campaign | null;

  return NextResponse.json({
    ok: true,
    state: campaign ? "purchased_campaign_ready" : "purchased_campaign_missing",
    template_id: templateId,
    purchase_id: purchase.id,
    campaign_id: campaign?.id || null,
  });
}
