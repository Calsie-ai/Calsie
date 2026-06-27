import { NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://bnshgtrqbfuphhhdgccs.supabase.co";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID || "";
const STRIPE_CURRENCY = (process.env.STRIPE_CURRENCY || "aud").toLowerCase();
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://calsie.com.au");

const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;

type CheckoutBody = {
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

async function upsertPendingSubscription(userId: string, email: string | null, customerId: string, sessionId: string) {
  if (!SUPABASE_SERVICE_ROLE_KEY) return;

  await fetch(`${SUPABASE_URL}/rest/v1/applix_subscriptions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify({
      user_id: userId,
      email,
      stripe_customer_id: customerId,
      stripe_checkout_session_id: sessionId,
      status: "checkout_started",
      plan_name: "Applix Pro",
      price_amount: 2000,
      currency: STRIPE_CURRENCY,
      updated_at: new Date().toISOString(),
    }),
  });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as CheckoutBody;
    const accessToken = body.access_token;

    if (!accessToken) {
      return NextResponse.json({ ok: false, error: "Missing access token." }, { status: 401 });
    }

    if (!stripe || !STRIPE_SECRET_KEY) {
      return NextResponse.json({ ok: false, error: "Missing STRIPE_SECRET_KEY in Vercel." }, { status: 500 });
    }

    if (!SUPABASE_ANON_KEY) {
      return NextResponse.json({ ok: false, error: "Missing NEXT_PUBLIC_SUPABASE_ANON_KEY." }, { status: 500 });
    }

    const currentUser = await getCurrentUser(accessToken);
    if (!currentUser?.id) {
      return NextResponse.json({ ok: false, error: "Could not verify user." }, { status: 401 });
    }

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = STRIPE_PRICE_ID
      ? [{ price: STRIPE_PRICE_ID, quantity: 1 }]
      : [{
          price_data: {
            currency: STRIPE_CURRENCY,
            unit_amount: 2000,
            recurring: { interval: "month" },
            product_data: {
              name: "Applix Pro",
              description: "100 opportunity knocks per day for 10 days with Applix tracking.",
            },
          },
          quantity: 1,
        }];

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: currentUser.email || undefined,
      line_items: lineItems,
      success_url: `${APP_URL}/dashboard?payment=success`,
      cancel_url: `${APP_URL}/dashboard?payment=cancelled`,
      metadata: {
        user_id: currentUser.id,
        email: currentUser.email || "",
        plan_name: "Applix Pro",
      },
      subscription_data: {
        metadata: {
          user_id: currentUser.id,
          email: currentUser.email || "",
          plan_name: "Applix Pro",
        },
      },
      allow_promotion_codes: true,
    });

    await upsertPendingSubscription(currentUser.id, currentUser.email || null, String(session.customer || ""), session.id);

    return NextResponse.json({ ok: true, checkout_url: session.url });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not create checkout." }, { status: 500 });
  }
}
