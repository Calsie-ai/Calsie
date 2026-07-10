import { NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://bnshgtrqbfuphhhdgccs.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";

const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;

type SubscriptionPayload = {
  user_id: string | null;
  email: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_checkout_session_id?: string | null;
  status: string;
  plan_name: string;
  price_amount: number;
  currency: string;
  current_period_end?: string | null;
  updated_at: string;
};

async function upsertSubscription(payload: SubscriptionPayload) {
  if (!payload.user_id || !SUPABASE_SERVICE_ROLE_KEY) return;

  await fetch(`${SUPABASE_URL}/rest/v1/applix_subscriptions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify(payload),
  });
}

function getPeriodEnd(subscription: Stripe.Subscription): string | null {
  const periodEnds = subscription.items.data
    .map((item) => item.current_period_end)
    .filter((value): value is number => typeof value === "number");

  if (periodEnds.length === 0) return null;

  return new Date(Math.max(...periodEnds) * 1000).toISOString();
}

function getStripeObjectId(value: string | { id?: string } | null) {
  return typeof value === "string" ? value : value?.id || null;
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.user_id || null;
  const email = session.customer_details?.email || session.customer_email || session.metadata?.email || null;
  const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id || null;

  let subscription: Stripe.Subscription | null = null;
  if (stripe && subscriptionId) {
    subscription = await stripe.subscriptions.retrieve(subscriptionId);
  }

  await upsertSubscription({
    user_id: userId,
    email,
    stripe_customer_id: getStripeObjectId(session.customer),
    stripe_subscription_id: subscriptionId,
    stripe_checkout_session_id: session.id,
    status: subscription?.status || "active",
    plan_name: "Applix Pro",
    price_amount: 2000,
    currency: subscription?.currency || "aud",
    current_period_end: subscription ? getPeriodEnd(subscription) : null,
    updated_at: new Date().toISOString(),
  });
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.user_id || null;
  const email = subscription.metadata?.email || null;

  await upsertSubscription({
    user_id: userId,
    email,
    stripe_customer_id: getStripeObjectId(subscription.customer),
    stripe_subscription_id: subscription.id,
    status: subscription.status,
    plan_name: "Applix Pro",
    price_amount: 2000,
    currency: subscription.currency || "aud",
    current_period_end: getPeriodEnd(subscription),
    updated_at: new Date().toISOString(),
  });
}

export async function POST(req: Request) {
  try {
    if (!stripe || !STRIPE_SECRET_KEY) {
      return NextResponse.json({ ok: false, error: "Missing STRIPE_SECRET_KEY." }, { status: 500 });
    }

    if (!STRIPE_WEBHOOK_SECRET) {
      return NextResponse.json({ ok: false, error: "Missing STRIPE_WEBHOOK_SECRET." }, { status: 500 });
    }

    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ ok: false, error: "Missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
    }

    const body = await req.text();
    const signature = req.headers.get("stripe-signature");

    if (!signature) {
      return NextResponse.json({ ok: false, error: "Missing Stripe signature." }, { status: 400 });
    }

    const event = stripe.webhooks.constructEvent(body, signature, STRIPE_WEBHOOK_SECRET);

    if (event.type === "checkout.session.completed") {
      await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
    }

    if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
    }

    return NextResponse.json({ ok: true, received: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Webhook failed." }, { status: 400 });
  }
}
