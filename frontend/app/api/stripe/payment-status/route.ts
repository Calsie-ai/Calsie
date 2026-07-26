import { NextResponse } from "next/server";
import Stripe from "stripe";
import {
  isCheckoutSessionId,
  type PaymentVerificationResponse,
  type PaymentVerificationStatus,
} from "../../../../lib/externalReturn";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://bnshgtrqbfuphhhdgccs.supabase.co";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";

type StatusBody = {
  access_token?: string;
  checkout_session_id?: string;
  intent_id?: string;
  postcode?: string;
  template_id?: string;
};

type PurchaseRow = {
  checkout_metadata?: Record<string, unknown> | null;
  currency?: string | null;
  postcode?: string | null;
  price_amount?: number | null;
  status?: string | null;
  stripe_checkout_session_id?: string | null;
  template_id?: string | null;
  user_id?: string | null;
};

const INTENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,191}$/;
const TEMPLATE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const TERMINAL_FAILURE_STATUSES = new Set([
  "cancelled",
  "expired",
  "failed",
  "payment_failed",
  "refunded",
]);

function getStripe() {
  return STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;
}

function response(
  status: PaymentVerificationStatus,
  details: Omit<PaymentVerificationResponse, "ok" | "status"> = {},
  httpStatus = 200,
) {
  return NextResponse.json({
    ok: status === "confirmed",
    status,
    ...details,
  } satisfies PaymentVerificationResponse, { status: httpStatus });
}

async function getCurrentUser(accessToken: string) {
  const result = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: SUPABASE_ANON_KEY,
    },
    cache: "no-store",
  });

  if (!result.ok) return null;
  return result.json().catch(() => null) as Promise<{ id?: string; email?: string } | null>;
}

async function getPurchase(userId: string, checkoutSessionId: string) {
  const query = new URLSearchParams({
    user_id: `eq.${userId}`,
    stripe_checkout_session_id: `eq.${checkoutSessionId}`,
    select: "user_id,stripe_checkout_session_id,status,template_id,postcode,price_amount,currency,checkout_metadata",
    limit: "1",
  });
  const result = await fetch(`${SUPABASE_URL}/rest/v1/applix_subscriptions?${query.toString()}`, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    cache: "no-store",
  });
  const rows = await result.json().catch(() => []);
  if (!result.ok) throw new Error("purchase_lookup_failed");
  return (Array.isArray(rows) ? rows[0] : null) as PurchaseRow | null;
}

function objectId(value: string | { id?: string } | null) {
  return typeof value === "string" ? value : value?.id || null;
}

async function paymentIntentIsValid(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
) {
  if (session.payment_status === "no_payment_required") return true;

  const paymentIntentId = objectId(session.payment_intent);
  if (!paymentIntentId) return false;
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
  if (
    paymentIntent.status !== "succeeded"
    || paymentIntent.currency.toLowerCase() !== String(session.currency || "").toLowerCase()
    || paymentIntent.amount_received !== Number(session.amount_total ?? 0)
  ) {
    return false;
  }

  const chargeId = objectId(paymentIntent.latest_charge);
  if (!chargeId) return true;
  const charge = await stripe.charges.retrieve(chargeId);
  return !charge.refunded && charge.amount_refunded === 0;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as StatusBody;
    const accessToken = body.access_token?.trim() || "";
    const checkoutSessionId = body.checkout_session_id?.trim() || "";
    const intentId = body.intent_id?.trim() || "";
    const templateId = body.template_id?.trim() || "";
    const postcode = body.postcode?.trim() || "";

    if (!accessToken) {
      return NextResponse.json({ ok: false, status: "failed", error: "Authentication required." }, { status: 401 });
    }
    if (!isCheckoutSessionId(checkoutSessionId)) {
      return response("not_found", {}, 400);
    }
    if (!INTENT_ID_PATTERN.test(intentId) || !TEMPLATE_ID_PATTERN.test(templateId)) {
      return response("mismatch", {}, 400);
    }
    if (postcode && !/^\d{4}$/.test(postcode)) {
      return response("mismatch", {}, 400);
    }
    if (!SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY || !STRIPE_SECRET_KEY) {
      return NextResponse.json({ ok: false, status: "failed", error: "Payment verification is unavailable." }, { status: 500 });
    }

    const currentUser = await getCurrentUser(accessToken);
    if (!currentUser?.id) {
      return NextResponse.json({ ok: false, status: "failed", error: "Authentication required." }, { status: 401 });
    }

    const stripe = getStripe();
    if (!stripe) {
      return NextResponse.json({ ok: false, status: "failed", error: "Payment verification is unavailable." }, { status: 500 });
    }

    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.retrieve(checkoutSessionId);
    } catch {
      return response("not_found");
    }

    const sessionUserId = session.metadata?.user_id || session.client_reference_id;
    if (
      sessionUserId !== currentUser.id
      || session.mode !== "payment"
      || session.metadata?.pending_intent_id !== intentId
      || session.metadata?.template_id !== templateId
      || (postcode && session.metadata?.postcode !== postcode)
    ) {
      return response("mismatch");
    }

    if (session.status === "expired") {
      return response("expired", { checkoutSessionId });
    }
    if (
      session.status !== "complete"
      || (session.payment_status !== "paid" && session.payment_status !== "no_payment_required")
    ) {
      return response("pending", { checkoutSessionId });
    }

    const purchase = await getPurchase(currentUser.id, checkoutSessionId);
    if (!purchase) {
      return response("pending", { checkoutSessionId });
    }
    if (purchase.status && TERMINAL_FAILURE_STATUSES.has(purchase.status)) {
      const terminalStatus = purchase.status === "expired"
        ? "expired"
        : purchase.status === "cancelled"
          ? "cancelled"
          : "failed";
      return response(terminalStatus, { checkoutSessionId });
    }

    const persistedIntentId = String(purchase.checkout_metadata?.pending_intent_id || "");
    const persistedAmount = Number(purchase.price_amount);
    const persistedCurrency = String(purchase.currency || "").toLowerCase();
    const stripeAmount = Number(session.amount_total ?? 0);
    const stripeCurrency = String(session.currency || "").toLowerCase();
    const rowMatches = (
      purchase.user_id === currentUser.id
      && purchase.stripe_checkout_session_id === checkoutSessionId
      && purchase.template_id === templateId
      && (!postcode || purchase.postcode === postcode)
      && persistedIntentId === intentId
      && persistedAmount === stripeAmount
      && persistedCurrency === stripeCurrency
    );

    if (!rowMatches) {
      return response(purchase.status === "checkout_started" ? "pending" : "mismatch", {
        checkoutSessionId,
      });
    }
    if (purchase.status !== "active") {
      return response("pending", { checkoutSessionId });
    }

    if (!(await paymentIntentIsValid(stripe, session))) {
      return response("failed", { checkoutSessionId });
    }

    return response("confirmed", {
      checkoutSessionId,
      templateId,
      postcode: session.metadata?.postcode || purchase.postcode || undefined,
      paymentStatus: session.payment_status,
    });
  } catch {
    return NextResponse.json({
      ok: false,
      status: "failed",
      error: "Could not verify payment. Your campaign details were kept.",
    }, { status: 500 });
  }
}
