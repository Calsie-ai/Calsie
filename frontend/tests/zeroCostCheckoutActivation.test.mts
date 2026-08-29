import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { transitionForStripeSnapshot } from "../lib/stripeWebhookState.ts";

const paymentStatusSource = readFileSync(
  new URL("../app/api/stripe/payment-status/route.ts", import.meta.url),
  "utf8",
);
const createCheckoutSource = readFileSync(
  new URL("../app/api/stripe/create-checkout/route.ts", import.meta.url),
  "utf8",
);
const repairMigrationSource = readFileSync(
  new URL("../../supabase/migrations/20260728090000_repair_processed_zero_cost_checkouts.sql", import.meta.url),
  "utf8",
);

test("completed paid A$0 checkout without PaymentIntent is purchased", () => {
  assert.deepEqual(transitionForStripeSnapshot({
    actualAmount: 0,
    amountRefunded: 0,
    checkoutStatus: "complete",
    eventType: "checkout.session.completed",
    hasPaymentIntent: false,
    paymentIntentStatus: null,
    paymentStatus: "paid",
  }), {
    amountRefunded: 0,
    paymentStatus: "paid",
    precedence: 30,
    purchaseStatus: "paid",
    refundStatus: "none",
  });
});

test("completed no_payment_required A$0 checkout remains supported", () => {
  assert.equal(transitionForStripeSnapshot({
    actualAmount: 0,
    amountRefunded: 0,
    checkoutStatus: "complete",
    eventType: "checkout.session.completed",
    hasPaymentIntent: false,
    paymentIntentStatus: null,
    paymentStatus: "no_payment_required",
  })?.purchaseStatus, "paid");
});

test("non-zero paid checkout without PaymentIntent is not purchased", () => {
  assert.notEqual(transitionForStripeSnapshot({
    actualAmount: 7900,
    amountRefunded: 0,
    checkoutStatus: "complete",
    eventType: "checkout.session.completed",
    hasPaymentIntent: false,
    paymentIntentStatus: null,
    paymentStatus: "paid",
  })?.purchaseStatus, "paid");
});

test("unpaid or incomplete A$0 checkout is not purchased", () => {
  for (const snapshot of [
    { checkoutStatus: "complete", paymentStatus: "unpaid" },
    { checkoutStatus: "open", paymentStatus: "paid" },
  ]) {
    assert.notEqual(transitionForStripeSnapshot({
      actualAmount: 0,
      amountRefunded: 0,
      eventType: "checkout.session.completed",
      hasPaymentIntent: false,
      paymentIntentStatus: null,
      ...snapshot,
    })?.purchaseStatus, "paid");
  }
});

test("payment return accepts only completed zero-cost sessions without PaymentIntent", () => {
  assert.match(paymentStatusSource, /session\.status === "complete"[\s\S]*amountTotal === 0[\s\S]*!paymentIntentId/);
  assert.match(paymentStatusSource, /session\.payment_status === "paid" \|\| session\.payment_status === "no_payment_required"/);
  assert.match(paymentStatusSource, /if \(!paymentIntentId \|\| amountTotal <= 0\) return false/);
});

test("checkout route blocks an existing paid or partially refunded purchase", () => {
  assert.match(createCheckoutSource, /purchase_status: "in\.\(paid,partially_refunded\)"/);
  assert.match(createCheckoutSource, /status: "already_purchased"/);
  assert.ok(createCheckoutSource.indexOf("getExistingPurchase") < createCheckoutSource.indexOf("stripe.checkout.sessions.create"));
});

test("repair migration is narrow and idempotent", () => {
  assert.match(repairMigrationSource, /processing_status = 'processed'/);
  assert.match(repairMigrationSource, /event_type = 'checkout\.session\.completed'/);
  assert.match(repairMigrationSource, /amount_total/);
  assert.match(repairMigrationSource, /amount_discount/);
  assert.match(repairMigrationSource, /purchase_status in \('checkout_started', 'pending'\)/);
  assert.match(repairMigrationSource, /payment_status in \('unpaid', 'pending'\)/);
});
