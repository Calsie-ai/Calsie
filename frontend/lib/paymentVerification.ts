import type { PaymentVerificationStatus } from "./externalReturn";

const CONFIRMED_PURCHASE_STATUSES = new Set([
  "paid",
  "partially_refunded",
  "fully_refunded",
]);

const FAILED_PURCHASE_STATUSES = new Set([
  "cancelled",
  "payment_failed",
]);

export function verificationStatusForPurchase(
  purchaseStatus: string | null | undefined,
  paymentStatus: string | null | undefined,
): PaymentVerificationStatus {
  if (purchaseStatus === "expired") return "expired";
  if (FAILED_PURCHASE_STATUSES.has(String(purchaseStatus || ""))) return "failed";
  if (purchaseStatus === "checkout_started" || purchaseStatus === "pending") return "pending";

  if (CONFIRMED_PURCHASE_STATUSES.has(String(purchaseStatus || ""))) {
    return paymentStatus === "paid" || paymentStatus === "no_payment_required"
      ? "confirmed"
      : "mismatch";
  }

  return "mismatch";
}
