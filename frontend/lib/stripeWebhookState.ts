export const SUPPORTED_STRIPE_EVENT_TYPES = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "charge.refunded",
] as const;

export type SupportedStripeEventType = typeof SUPPORTED_STRIPE_EVENT_TYPES[number];

export type PurchaseStatus =
  | "pending"
  | "payment_failed"
  | "paid"
  | "partially_refunded"
  | "fully_refunded"
  | "expired";

export type PurchaseTransition = {
  amountRefunded: number;
  paymentStatus: "unpaid" | "paid" | "no_payment_required";
  precedence: 10 | 20 | 30 | 40 | 50;
  purchaseStatus: PurchaseStatus;
  refundStatus: "none" | "partial" | "full";
};

/*
 * Purchase precedence (Stripe timestamps are audit data, not the ordering key):
 *   10 pending checkout
 *   20 payment failed or Session expired
 *   30 paid / no_payment_required
 *   40 partially refunded (same-level updates require a larger aggregate refund)
 *   50 fully refunded
 * Exact Session and persisted purchase identity must match before this is applied.
 */
export type StripePaymentSnapshot = {
  actualAmount: number;
  amountRefunded: number;
  checkoutStatus: string | null;
  eventType: string;
  hasPaymentIntent: boolean;
  paymentIntentStatus: string | null;
  paymentStatus: string | null;
};

export type PersistedPurchaseIdentity = {
  checkoutSessionId: string;
  currency: string;
  expectedAmount: number;
  livemode: boolean;
  pendingIntentId: string;
  postcode: string;
  templateId: string;
  userId: string;
};

export type ResolvedPurchaseIdentity = PersistedPurchaseIdentity;

const SUPPORTED_TYPE_SET = new Set<string>(SUPPORTED_STRIPE_EVENT_TYPES);

export function isSupportedStripeEventType(value: string): value is SupportedStripeEventType {
  return SUPPORTED_TYPE_SET.has(value);
}

export function expectedStripeLivemode(
  configured: string | undefined,
  secretKey: string,
): boolean | null {
  const normalized = configured?.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  if (/^(sk|rk)_live_/.test(secretKey)) return true;
  if (/^(sk|rk)_test_/.test(secretKey)) return false;
  return null;
}

export function purchaseIdentityMismatch(
  persisted: PersistedPurchaseIdentity,
  resolved: ResolvedPurchaseIdentity,
): string | null {
  if (persisted.livemode !== resolved.livemode) return "mode_mismatch";
  if (persisted.checkoutSessionId !== resolved.checkoutSessionId) return "invalid_object";
  if (persisted.userId !== resolved.userId) return "ownership_mismatch";
  if (persisted.pendingIntentId !== resolved.pendingIntentId) return "pending_intent_mismatch";
  if (persisted.templateId !== resolved.templateId) return "template_mismatch";
  if (persisted.postcode !== resolved.postcode) return "postcode_mismatch";
  if (persisted.expectedAmount !== resolved.expectedAmount) return "amount_mismatch";
  if (persisted.currency !== resolved.currency.toLowerCase()) return "currency_mismatch";
  return null;
}

export function transitionForStripeSnapshot(
  snapshot: StripePaymentSnapshot,
): PurchaseTransition | null {
  if (!isSupportedStripeEventType(snapshot.eventType)) return null;

  if (
    !Number.isInteger(snapshot.actualAmount)
    || snapshot.actualAmount < 0
    || !Number.isInteger(snapshot.amountRefunded)
    || snapshot.amountRefunded < 0
    || snapshot.amountRefunded > snapshot.actualAmount
  ) {
    return null;
  }

  if (snapshot.eventType === "charge.refunded") {
    if (!snapshot.hasPaymentIntent || snapshot.amountRefunded <= 0 || snapshot.actualAmount <= 0) {
      return null;
    }
    const fullyRefunded = snapshot.amountRefunded === snapshot.actualAmount;
    return {
      amountRefunded: snapshot.amountRefunded,
      paymentStatus: "paid",
      precedence: fullyRefunded ? 50 : 40,
      purchaseStatus: fullyRefunded ? "fully_refunded" : "partially_refunded",
      refundStatus: fullyRefunded ? "full" : "partial",
    };
  }

  if (snapshot.eventType === "checkout.session.expired") {
    return {
      amountRefunded: 0,
      paymentStatus: "unpaid",
      precedence: 20,
      purchaseStatus: "expired",
      refundStatus: "none",
    };
  }

  if (
    snapshot.eventType === "checkout.session.async_payment_failed"
    || snapshot.eventType === "payment_intent.payment_failed"
  ) {
    return {
      amountRefunded: 0,
      paymentStatus: "unpaid",
      precedence: 20,
      purchaseStatus: "payment_failed",
      refundStatus: "none",
    };
  }

  if (
    snapshot.paymentStatus === "no_payment_required"
    && !snapshot.hasPaymentIntent
    && snapshot.actualAmount === 0
    && snapshot.checkoutStatus === "complete"
  ) {
    return {
      amountRefunded: 0,
      paymentStatus: "no_payment_required",
      precedence: 30,
      purchaseStatus: "paid",
      refundStatus: "none",
    };
  }

  const paid = snapshot.paymentStatus === "paid";
  const paymentIntentSucceeded = snapshot.paymentIntentStatus === "succeeded";
  if (paid && snapshot.hasPaymentIntent && paymentIntentSucceeded) {
    return {
      amountRefunded: 0,
      paymentStatus: "paid",
      precedence: 30,
      purchaseStatus: "paid",
      refundStatus: "none",
    };
  }

  if (snapshot.eventType === "checkout.session.completed") {
    return {
      amountRefunded: 0,
      paymentStatus: "unpaid",
      precedence: 10,
      purchaseStatus: "pending",
      refundStatus: "none",
    };
  }

  return null;
}

export function shouldApplyTransition(
  currentPrecedence: number,
  currentAmountRefunded: number,
  incoming: PurchaseTransition,
) {
  return (
    incoming.precedence > currentPrecedence
    || (
      incoming.precedence === currentPrecedence
      && (incoming.purchaseStatus === "partially_refunded" || incoming.purchaseStatus === "fully_refunded")
      && incoming.amountRefunded > currentAmountRefunded
    )
  );
}

export function projectionStatusForPurchase(status: PurchaseStatus) {
  if (status === "paid") return "active";
  if (status === "partially_refunded") return "partially_refunded";
  if (status === "fully_refunded") return "refunded";
  if (status === "payment_failed") return "payment_failed";
  if (status === "expired") return "expired";
  return "checkout_completed";
}

export function retryDelaySeconds(attemptCount: number) {
  const boundedAttempt = Math.min(Math.max(Math.trunc(attemptCount), 1), 8);
  return Math.min(60 * (2 ** (boundedAttempt - 1)), 3600);
}
