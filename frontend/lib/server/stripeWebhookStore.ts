import "server-only";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL
  || "https://bnshgtrqbfuphhhdgccs.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export class StripeDatabaseError extends Error {
  constructor() {
    super("stripe_database_unavailable");
    this.name = "StripeDatabaseError";
  }
}

export type RegisteredEvent = {
  attempt_count: number;
  claimed: boolean;
  event_status: string;
};

export type ClaimedLedgerEvent = {
  event_type: string;
  livemode: boolean;
  processing_attempt_count: number;
  stripe_event_id: string;
};

export type RegisterEventInput = {
  chargeId: string | null;
  checkoutSessionId: string | null;
  eventType: string;
  livemode: boolean;
  objectId: string | null;
  payloadHash: string;
  paymentIntentId: string | null;
  refundId: string | null;
  safeMetadata: Record<string, unknown>;
  stripeCreatedAt: string;
  stripeEventId: string;
};

export type FinalizeEventInput = {
  actualAmount: number;
  amountRefunded: number;
  chargeId: string | null;
  checkoutSessionId: string;
  currency: string;
  eventPrecedence: number;
  expectedAmount: number;
  paymentIntentId: string | null;
  paymentStatus: "unpaid" | "paid" | "no_payment_required";
  pendingIntentId: string;
  postcode: string;
  purchaseStatus: string;
  refundId: string | null;
  refundStatus: "none" | "partial" | "full";
  safeMetadata: Record<string, unknown>;
  stripeCreatedAt: string;
  stripeEventId: string;
  templateId: string;
  userId: string;
};

function adminHeaders() {
  if (!SUPABASE_SERVICE_ROLE_KEY) throw new StripeDatabaseError();
  return {
    "Content-Type": "application/json",
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  };
}

async function rpc<T>(functionName: string, body: Record<string, unknown>): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${functionName}`, {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new StripeDatabaseError();
  }

  if (!response.ok) {
    throw new StripeDatabaseError();
  }

  try {
    return await response.json() as T;
  } catch {
    throw new StripeDatabaseError();
  }
}

export function stripeDatabaseIsConfigured() {
  return Boolean(SUPABASE_SERVICE_ROLE_KEY);
}

export async function registerCheckoutPurchase(input: {
  checkoutCreatedAt: string;
  checkoutSessionId: string;
  currency: string;
  customerId: string | null;
  email: string | null;
  expectedAmount: number;
  livemode: boolean;
  pendingIntentId: string;
  planName: string;
  postcode: string;
  safeMetadata: Record<string, unknown>;
  templateId: string;
  userId: string;
}) {
  const rows = await rpc<Array<{
    purchase_id: string;
    purchase_sequence: number;
    registered: boolean;
  }>>("applix_register_checkout_purchase", {
    p_user_id: input.userId,
    p_email: input.email,
    p_customer_id: input.customerId,
    p_checkout_session_id: input.checkoutSessionId,
    p_stripe_checkout_created_at: input.checkoutCreatedAt,
    p_pending_intent_id: input.pendingIntentId,
    p_template_id: input.templateId,
    p_postcode: input.postcode,
    p_expected_amount: input.expectedAmount,
    p_currency: input.currency,
    p_plan_name: input.planName,
    p_livemode: input.livemode,
    p_safe_metadata: input.safeMetadata,
  });
  if (!Array.isArray(rows) || !rows[0]?.purchase_id) {
    throw new StripeDatabaseError();
  }
  return rows[0];
}

export async function registerStripeEvent(input: RegisterEventInput) {
  const rows = await rpc<RegisteredEvent[]>("applix_register_stripe_event", {
    p_stripe_event_id: input.stripeEventId,
    p_event_type: input.eventType,
    p_stripe_created_at: input.stripeCreatedAt,
    p_livemode: input.livemode,
    p_stripe_object_id: input.objectId,
    p_checkout_session_id: input.checkoutSessionId,
    p_payment_intent_id: input.paymentIntentId,
    p_charge_id: input.chargeId,
    p_refund_id: input.refundId,
    p_payload_hash: input.payloadHash,
    p_safe_metadata: input.safeMetadata,
  });
  if (
    !Array.isArray(rows)
    || typeof rows[0]?.claimed !== "boolean"
    || !Number.isInteger(rows[0]?.attempt_count)
  ) {
    throw new StripeDatabaseError();
  }
  return rows[0];
}

export async function finishStripeEvent(
  stripeEventId: string,
  processingStatus: "processed" | "ignored" | "stale" | "retryable_failed" | "permanently_rejected",
  failureCode: string | null,
  safeFailureMessage: string | null,
  nextRetryAt: string | null = null,
) {
  return rpc<string>("applix_finish_stripe_event", {
    p_stripe_event_id: stripeEventId,
    p_processing_status: processingStatus,
    p_failure_code: failureCode,
    p_safe_failure_message: safeFailureMessage,
    p_next_retry_at: nextRetryAt,
  });
}

export async function finalizeStripeEvent(input: FinalizeEventInput) {
  return rpc<string>("applix_finalize_stripe_event", {
    p_stripe_event_id: input.stripeEventId,
    p_checkout_session_id: input.checkoutSessionId,
    p_payment_intent_id: input.paymentIntentId,
    p_charge_id: input.chargeId,
    p_refund_id: input.refundId,
    p_user_id: input.userId,
    p_pending_intent_id: input.pendingIntentId,
    p_template_id: input.templateId,
    p_postcode: input.postcode,
    p_expected_amount: input.expectedAmount,
    p_actual_amount: input.actualAmount,
    p_currency: input.currency,
    p_payment_status: input.paymentStatus,
    p_purchase_status: input.purchaseStatus,
    p_refund_status: input.refundStatus,
    p_amount_refunded: input.amountRefunded,
    p_event_precedence: input.eventPrecedence,
    p_stripe_created_at: input.stripeCreatedAt,
    p_safe_metadata: input.safeMetadata,
  });
}

export async function claimStripeEvents(batchSize: number) {
  const rows = await rpc<ClaimedLedgerEvent[]>("applix_claim_stripe_events", {
    p_batch_size: Math.min(Math.max(Math.trunc(batchSize), 1), 25),
    p_stale_after_seconds: 300,
  });
  return Array.isArray(rows) ? rows : [];
}

export async function rejectExhaustedStripeEvents() {
  return rpc<number>("applix_reject_exhausted_stripe_events", {});
}
