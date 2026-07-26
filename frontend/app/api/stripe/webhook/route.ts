import { NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://bnshgtrqbfuphhhdgccs.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";

function getStripe() {
  return STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;
}

type SubscriptionPayload = {
  user_id: string | null;
  email: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_checkout_session_id?: string | null;
  stripe_payment_intent_id?: string | null;
  status: string;
  plan_name: string;
  price_amount: number;
  currency: string;
  current_period_end?: string | null;
  template_id?: string | null;
  postcode?: string | null;
  checkout_metadata?: Record<string, unknown>;
  updated_at: string;
};

function integerMetadata(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function cleanPostcode(value: string | undefined) {
  const postcode = String(value || "").trim();
  return /^\d{4}$/.test(postcode) ? postcode : null;
}

function checkoutIsFulfilled(session: Stripe.Checkout.Session) {
  return session.payment_status === "paid" || session.payment_status === "no_payment_required";
}

async function upsertSubscription(payload: SubscriptionPayload) {
  if (!payload.user_id || !SUPABASE_SERVICE_ROLE_KEY) return;

  const response = await fetch(`${SUPABASE_URL}/rest/v1/applix_subscriptions?on_conflict=user_id`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`Could not save Stripe payment status${details ? `: ${details.slice(0, 240)}` : "."}`);
  }
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

async function saveCheckoutSession(session: Stripe.Checkout.Session, forcedStatus?: string) {
  const userId = session.metadata?.user_id || session.client_reference_id || null;
  const email = session.customer_details?.email || session.customer_email || session.metadata?.email || null;
  const subscriptionId = getStripeObjectId(session.subscription);
  const paymentIntentId = getStripeObjectId(session.payment_intent);
  const templateId = session.metadata?.template_id || null;
  const postcode = cleanPostcode(session.metadata?.postcode);
  const planName = session.metadata?.template_name || session.metadata?.plan_name || "Applix campaign";
  const listedPrice = integerMetadata(session.metadata?.price_amount, Number(session.amount_subtotal || session.amount_total || 0));
  const paidAmount = Number(session.amount_total ?? listedPrice);
  const currency = (session.metadata?.currency || session.currency || "aud").toLowerCase();

  let subscription: Stripe.Subscription | null = null;
  const stripe = getStripe();
  if (stripe && subscriptionId) {
    subscription = await stripe.subscriptions.retrieve(subscriptionId);
  }

  const status = forcedStatus || (checkoutIsFulfilled(session) ? "active" : session.payment_status || "checkout_completed");

  await upsertSubscription({
    user_id: userId,
    email,
    stripe_customer_id: getStripeObjectId(session.customer),
    stripe_subscription_id: subscriptionId,
    stripe_checkout_session_id: session.id,
    stripe_payment_intent_id: paymentIntentId,
    status,
    plan_name: planName,
    price_amount: paidAmount,
    currency,
    current_period_end: subscription ? getPeriodEnd(subscription) : null,
    template_id: templateId,
    postcode,
    checkout_metadata: {
      checkout_mode: session.mode,
      checkout_status: session.status,
      payment_status: session.payment_status,
      template_slug: session.metadata?.template_slug || null,
      price_label: session.metadata?.price_label || null,
      pending_intent_id: session.metadata?.pending_intent_id || null,
      return_panel: session.metadata?.return_panel || null,
      return_path: session.metadata?.return_path || null,
      originating_path: session.metadata?.originating_path || null,
      intended_action: session.metadata?.intended_action || null,
      expected_price_amount: listedPrice,
      amount_subtotal: session.amount_subtotal,
      amount_discount: session.total_details?.amount_discount ?? 0,
      amount_total: session.amount_total,
      no_payment_required: session.payment_status === "no_payment_required",
    },
    updated_at: new Date().toISOString(),
  });
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.user_id || null;
  const email = subscription.metadata?.email || null;
  const templateId = subscription.metadata?.template_id || null;
  const postcode = cleanPostcode(subscription.metadata?.postcode);

  await upsertSubscription({
    user_id: userId,
    email,
    stripe_customer_id: getStripeObjectId(subscription.customer),
    stripe_subscription_id: subscription.id,
    status: subscription.status,
    plan_name: subscription.metadata?.template_name || subscription.metadata?.plan_name || "Applix Pro",
    price_amount: integerMetadata(subscription.metadata?.price_amount, 2000),
    currency: (subscription.metadata?.currency || subscription.currency || "aud").toLowerCase(),
    current_period_end: getPeriodEnd(subscription),
    template_id: templateId,
    postcode,
    checkout_metadata: {
      checkout_mode: "subscription",
      template_slug: subscription.metadata?.template_slug || null,
    },
    updated_at: new Date().toISOString(),
  });
}

export async function POST(req: Request) {
  try {
    const stripe = getStripe();
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

    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      await saveCheckoutSession(event.data.object as Stripe.Checkout.Session);
    }

    if (event.type === "checkout.session.async_payment_failed") {
      await saveCheckoutSession(event.data.object as Stripe.Checkout.Session, "payment_failed");
    }

    if (event.type === "checkout.session.expired") {
      await saveCheckoutSession(event.data.object as Stripe.Checkout.Session, "expired");
    }

    if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
    }

    return NextResponse.json({ ok: true, received: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Webhook failed." }, { status: 400 });
  }
}
