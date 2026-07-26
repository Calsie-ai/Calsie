import "server-only";

import Stripe from "stripe";
import {
  expectedStripeLivemode,
  isSupportedStripeEventType,
  retryDelaySeconds,
  transitionForStripeSnapshot,
} from "../stripeWebhookState";
import {
  finalizeStripeEvent,
  finishStripeEvent,
  registerStripeEvent,
  StripeDatabaseError,
} from "./stripeWebhookStore";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const STRIPE_EXPECTED_LIVEMODE = process.env.STRIPE_EXPECTED_LIVEMODE;

export type StripeProcessingOutcome =
  | "duplicate"
  | "ignored"
  | "permanently_rejected"
  | "processed"
  | "retryable_failed"
  | "stale";

type StripeReferences = {
  chargeId: string | null;
  checkoutSessionId: string | null;
  objectId: string | null;
  paymentIntentId: string | null;
  refundId: string | null;
};

type ResolvedStripePurchase = {
  actualAmount: number;
  amountRefunded: number;
  chargeId: string | null;
  checkoutSessionId: string;
  currency: string;
  expectedAmount: number;
  paymentIntentId: string | null;
  paymentIntentStatus: string | null;
  paymentStatus: string;
  pendingIntentId: string;
  postcode: string;
  refundId: string | null;
  safeMetadata: Record<string, unknown>;
  sessionStatus: string | null;
  templateId: string;
  userId: string;
};

function objectId(value: string | { id?: string } | null | undefined) {
  return typeof value === "string" ? value : value?.id || null;
}

function eventObject(event: Stripe.Event) {
  return event.data.object as unknown as Record<string, unknown>;
}

function safeEventReferences(event: Stripe.Event): StripeReferences {
  const object = eventObject(event);
  const objectIdValue = typeof object.id === "string" ? object.id : null;
  const checkoutSessionId = event.type.startsWith("checkout.session.")
    ? objectIdValue
    : null;
  const paymentIntentId = event.type.startsWith("payment_intent.")
    ? objectIdValue
    : objectId(object.payment_intent as string | { id?: string } | null);
  const chargeId = event.type === "charge.refunded" ? objectIdValue : null;

  return {
    chargeId,
    checkoutSessionId,
    objectId: objectIdValue,
    paymentIntentId,
    refundId: null,
  };
}

function eventSafeMetadata(event: Stripe.Event) {
  const object = eventObject(event);
  return {
    api_version: event.api_version || null,
    object_kind: typeof object.object === "string" ? object.object : null,
  };
}

function requireString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function eventMatchesRetrievedObject(
  event: Stripe.Event,
  session: Stripe.Checkout.Session,
  paymentIntent: Stripe.PaymentIntent | null,
  charge: Stripe.Charge | null,
) {
  const object = eventObject(event);
  if (event.type.startsWith("checkout.session.")) {
    return (
      object.id === session.id
      && object.amount_total === session.amount_total
      && object.currency === session.currency
    );
  }
  if (event.type.startsWith("payment_intent.")) {
    return (
      paymentIntent
      && object.id === paymentIntent.id
      && object.amount === paymentIntent.amount
      && object.currency === paymentIntent.currency
    );
  }
  if (event.type === "charge.refunded") {
    return (
      charge
      && object.id === charge.id
      && object.amount === charge.amount
      && object.currency === charge.currency
      && objectId(object.payment_intent as string | { id?: string } | null)
        === objectId(charge.payment_intent)
    );
  }
  return false;
}

async function sessionForPaymentIntent(
  stripe: Stripe,
  paymentIntentId: string,
) {
  const sessions = await stripe.checkout.sessions.list({
    payment_intent: paymentIntentId,
    limit: 2,
  });
  if (sessions.data.length !== 1) return null;
  return stripe.checkout.sessions.retrieve(sessions.data[0].id);
}

async function resolveStripePurchase(
  stripe: Stripe,
  event: Stripe.Event,
): Promise<ResolvedStripePurchase | null> {
  const references = safeEventReferences(event);
  let session: Stripe.Checkout.Session | null = null;
  let paymentIntent: Stripe.PaymentIntent | null = null;
  let charge: Stripe.Charge | null = null;

  if (references.checkoutSessionId) {
    session = await stripe.checkout.sessions.retrieve(references.checkoutSessionId);
    const paymentIntentId = objectId(session.payment_intent);
    if (paymentIntentId) {
      paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    }
  } else if (event.type.startsWith("payment_intent.") && references.paymentIntentId) {
    paymentIntent = await stripe.paymentIntents.retrieve(references.paymentIntentId);
    session = await sessionForPaymentIntent(stripe, paymentIntent.id);
  } else if (event.type === "charge.refunded" && references.chargeId) {
    charge = await stripe.charges.retrieve(references.chargeId);
    const paymentIntentId = objectId(charge.payment_intent);
    if (paymentIntentId) {
      paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      session = await sessionForPaymentIntent(stripe, paymentIntentId);
    }
  }

  if (!session || session.mode !== "payment") return null;
  if (!eventMatchesRetrievedObject(event, session, paymentIntent, charge)) return null;

  const metadataUserId = requireString(session.metadata?.user_id);
  const clientReferenceId = requireString(session.client_reference_id);
  const pendingIntentId = requireString(session.metadata?.pending_intent_id);
  const templateId = requireString(session.metadata?.template_id);
  const postcode = requireString(session.metadata?.postcode);
  const currency = requireString(session.currency)?.toLowerCase() || null;
  const expectedAmount = session.amount_subtotal;
  const actualAmount = session.amount_total;
  const paymentIntentId = objectId(session.payment_intent);

  if (
    !metadataUserId
    || !clientReferenceId
    || metadataUserId !== clientReferenceId
    || !pendingIntentId
    || !templateId
    || !postcode
    || !currency
    || !Number.isInteger(expectedAmount)
    || !Number.isInteger(actualAmount)
    || expectedAmount === null
    || actualAmount === null
    || expectedAmount < 0
    || actualAmount < 0
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(metadataUserId)
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(templateId)
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,191}$/.test(pendingIntentId)
    || !/^\d{4}$/.test(postcode)
    || !/^[a-z]{3}$/.test(currency)
  ) {
    return null;
  }

  if (paymentIntentId !== (paymentIntent?.id || null)) {
    return null;
  }
  if (
    paymentIntent
    && (
      paymentIntent.currency.toLowerCase() !== currency
      || paymentIntent.amount !== actualAmount
      || (
        paymentIntent.status === "succeeded"
        && paymentIntent.amount_received !== actualAmount
      )
    )
  ) {
    return null;
  }
  if (
    charge
    && (
      charge.amount !== actualAmount
      || charge.currency.toLowerCase() !== currency
      || objectId(paymentIntent?.latest_charge) !== charge.id
    )
  ) {
    return null;
  }
  if (
    session.payment_status === "no_payment_required"
    && (paymentIntentId !== null || actualAmount !== 0)
  ) {
    return null;
  }

  const refundId = charge?.refunds?.data
    .filter((refund) => refund.status !== "failed" && refund.status !== "canceled")
    .sort((left, right) => right.created - left.created)[0]?.id || null;
  const amountRefunded = charge?.amount_refunded || 0;

  return {
    actualAmount,
    amountRefunded,
    chargeId: charge?.id || objectId(paymentIntent?.latest_charge),
    checkoutSessionId: session.id,
    currency,
    expectedAmount,
    paymentIntentId,
    paymentIntentStatus: paymentIntent?.status || null,
    paymentStatus: session.payment_status,
    pendingIntentId,
    postcode,
    refundId,
    safeMetadata: {
      amount_discount: session.total_details?.amount_discount ?? 0,
      amount_subtotal: expectedAmount,
      amount_total: actualAmount,
      checkout_status: session.status,
      payment_status: session.payment_status,
      stripe_mode: session.mode,
    },
    sessionStatus: session.status,
    templateId,
    userId: metadataUserId,
  };
}

function retryAt(attemptCount: number) {
  return new Date(Date.now() + retryDelaySeconds(attemptCount) * 1000).toISOString();
}

async function markRetryable(eventId: string, attemptCount: number, code: string) {
  return finishStripeEvent(
    eventId,
    "retryable_failed",
    code,
    "Temporary processing failure; safe reconciliation is scheduled.",
    retryAt(attemptCount),
  );
}

export function getStripeServerClient() {
  return STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;
}

export function configuredStripeLivemode() {
  return expectedStripeLivemode(STRIPE_EXPECTED_LIVEMODE, STRIPE_SECRET_KEY);
}

export async function processClaimedStripeEvent(
  stripe: Stripe,
  event: Stripe.Event,
  attemptCount: number,
): Promise<StripeProcessingOutcome> {
  const expectedLivemode = configuredStripeLivemode();
  if (expectedLivemode === null || event.livemode !== expectedLivemode) {
    await finishStripeEvent(
      event.id,
      "permanently_rejected",
      "mode_mismatch",
      "Stripe event mode does not match the configured environment.",
    );
    return "permanently_rejected";
  }

  if (!isSupportedStripeEventType(event.type)) {
    await finishStripeEvent(
      event.id,
      "ignored",
      "unsupported_event_type",
      "Valid Stripe event is not used by the one-time Checkout flow.",
    );
    return "ignored";
  }

  let purchase: ResolvedStripePurchase | null;
  try {
    purchase = await resolveStripePurchase(stripe, event);
  } catch {
    await markRetryable(event.id, attemptCount, "stripe_retrieval_failed");
    return "retryable_failed";
  }

  if (!purchase) {
    await finishStripeEvent(
      event.id,
      "permanently_rejected",
      "invalid_object",
      "Stripe objects could not be resolved to one exact Checkout purchase.",
    );
    return "permanently_rejected";
  }

  const transition = transitionForStripeSnapshot({
    actualAmount: purchase.actualAmount,
    amountRefunded: purchase.amountRefunded,
    checkoutStatus: purchase.sessionStatus,
    eventType: event.type,
    hasPaymentIntent: purchase.paymentIntentId !== null,
    paymentIntentStatus: purchase.paymentIntentStatus,
    paymentStatus: purchase.paymentStatus,
  });
  if (!transition) {
    await finishStripeEvent(
      event.id,
      "permanently_rejected",
      "invalid_object",
      "Stripe payment state is invalid for this event type.",
    );
    return "permanently_rejected";
  }

  try {
    const result = await finalizeStripeEvent({
      actualAmount: purchase.actualAmount,
      amountRefunded: transition.amountRefunded,
      chargeId: purchase.chargeId,
      checkoutSessionId: purchase.checkoutSessionId,
      currency: purchase.currency,
      eventPrecedence: transition.precedence,
      expectedAmount: purchase.expectedAmount,
      paymentIntentId: purchase.paymentIntentId,
      paymentStatus: transition.paymentStatus,
      pendingIntentId: purchase.pendingIntentId,
      postcode: purchase.postcode,
      purchaseStatus: transition.purchaseStatus,
      refundId: purchase.refundId,
      refundStatus: transition.refundStatus,
      safeMetadata: purchase.safeMetadata,
      stripeCreatedAt: new Date(event.created * 1000).toISOString(),
      stripeEventId: event.id,
      templateId: purchase.templateId,
      userId: purchase.userId,
    });
    if (result === "stale") return "stale";
    if (result === "retryable_failed") return "retryable_failed";
    if (result === "permanently_rejected") return "permanently_rejected";
    return "processed";
  } catch (error) {
    if (!(error instanceof StripeDatabaseError)) throw error;
    try {
      await markRetryable(event.id, attemptCount, "temporary_database_failure");
    } catch {
      throw new StripeDatabaseError();
    }
    return "retryable_failed";
  }
}

export async function processClaimedStripeEventById(
  stripe: Stripe,
  stripeEventId: string,
  attemptCount: number,
) {
  let event: Stripe.Event;
  try {
    event = await stripe.events.retrieve(stripeEventId);
  } catch {
    await markRetryable(stripeEventId, attemptCount, "stripe_retrieval_failed");
    return "retryable_failed" as const;
  }
  return processClaimedStripeEvent(stripe, event, attemptCount);
}

export async function receiveStripeEvent(
  stripe: Stripe,
  event: Stripe.Event,
  payloadHash: string,
): Promise<StripeProcessingOutcome> {
  const references = safeEventReferences(event);
  const registration = await registerStripeEvent({
    chargeId: references.chargeId,
    checkoutSessionId: references.checkoutSessionId,
    eventType: event.type,
    livemode: event.livemode,
    objectId: references.objectId,
    payloadHash,
    paymentIntentId: references.paymentIntentId,
    refundId: references.refundId,
    safeMetadata: eventSafeMetadata(event),
    stripeCreatedAt: new Date(event.created * 1000).toISOString(),
    stripeEventId: event.id,
  });

  if (!registration.claimed) return "duplicate";
  return processClaimedStripeEvent(stripe, event, registration.attempt_count);
}
