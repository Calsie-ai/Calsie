import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  expectedStripeLivemode,
  isSupportedStripeEventType,
  projectionStatusForPurchase,
  purchaseIdentityMismatch,
  retryDelaySeconds,
  shouldApplyTransition,
  transitionForStripeSnapshot,
} from "../lib/stripeWebhookState.ts";

const migrationSource = readFileSync(
  new URL("../../supabase/migrations/20260726173707_stripe_webhook_hardening.sql", import.meta.url),
  "utf8",
);
const preflightMigrationSource = readFileSync(
  new URL("../../supabase/migrations/20260726173706_stage6_backfill_preflight.sql", import.meta.url),
  "utf8",
);
const readinessMigrationSource = readFileSync(
  new URL("../../supabase/migrations/20260726190000_stage6_deployment_readiness.sql", import.meta.url),
  "utf8",
);
const integrationTestSource = readFileSync(
  new URL("../../supabase/tests/stripe_webhook_hardening.sql", import.meta.url),
  "utf8",
);
const webhookSource = readFileSync(
  new URL("../app/api/stripe/webhook/route.ts", import.meta.url),
  "utf8",
);
const reconcileSource = readFileSync(
  new URL("../app/api/stripe/reconcile/route.ts", import.meta.url),
  "utf8",
);
const processorSource = readFileSync(
  new URL("../lib/server/stripeWebhookProcessor.ts", import.meta.url),
  "utf8",
);
const storeSource = readFileSync(
  new URL("../lib/server/stripeWebhookStore.ts", import.meta.url),
  "utf8",
);
const createCheckoutSource = readFileSync(
  new URL("../app/api/stripe/create-checkout/route.ts", import.meta.url),
  "utf8",
);
const paymentStatusSource = readFileSync(
  new URL("../app/api/stripe/payment-status/route.ts", import.meta.url),
  "utf8",
);

const paidSnapshot = {
  actualAmount: 1999,
  amountRefunded: 0,
  checkoutStatus: "complete",
  eventType: "checkout.session.completed",
  hasPaymentIntent: true,
  paymentIntentStatus: "succeeded",
  paymentStatus: "paid",
};

const identity = {
  checkoutSessionId: "cs_test_exact",
  currency: "aud",
  expectedAmount: 2000,
  livemode: false,
  pendingIntentId: "intent:12345678",
  postcode: "2141",
  templateId: "template-id",
  userId: "user-id",
};

test("1. same event is protected by a unique Stripe event ID", () => {
  assert.match(migrationSource, /stripe_event_id text not null unique/);
});

test("2. concurrent duplicate registration uses one atomic INSERT", () => {
  assert.match(migrationSource, /insert into public\.stripe_webhook_events[\s\S]*on conflict \(stripe_event_id\) do nothing/);
  assert.doesNotMatch(processorSource, /select[\s\S]*if missing[\s\S]*insert/i);
});

test("3. a unique conflict returns an unclaimed duplicate", () => {
  assert.match(migrationSource, /select false, coalesce\(v_status, 'received'\), coalesce\(v_attempt_count, 0\)/);
  assert.match(processorSource, /if \(!registration\.claimed\) return "duplicate"/);
});

test("4. different events for one Session remain separate ledger rows", () => {
  assert.doesNotMatch(migrationSource, /unique\s*\(checkout_session_id\)/i);
  assert.match(migrationSource, /stripe_event_id text not null unique/);
});

test("5. event precedence outranks Stripe creation time", () => {
  const paid = transitionForStripeSnapshot(paidSnapshot)!;
  assert.equal(shouldApplyTransition(20, 0, paid), true);
  assert.equal(shouldApplyTransition(40, 100, paid), false);
});

test("6. an older checkout cannot replace a newer projection", () => {
  assert.match(migrationSource, /stripe_checkout_created_at timestamptz not null/);
  assert.match(migrationSource, /current_checkout_created_at[\s\S]*< excluded\.current_checkout_created_at/);
  assert.match(migrationSource, /current_purchase_sequence[\s\S]*< excluded\.current_purchase_sequence/);
  assert.match(migrationSource, /current_purchase_id = v_purchase\.id[\s\S]*current_purchase_sequence = v_purchase\.purchase_sequence/);
});

test("7. duplicate completed transitions are no-ops", () => {
  const paid = transitionForStripeSnapshot(paidSnapshot)!;
  assert.equal(shouldApplyTransition(30, 0, paid), false);
});

test("8. a paid Session requires a succeeded PaymentIntent", () => {
  assert.equal(transitionForStripeSnapshot(paidSnapshot)?.purchaseStatus, "paid");
  assert.notEqual(transitionForStripeSnapshot({
    ...paidSnapshot,
    paymentIntentStatus: "processing",
  })?.purchaseStatus, "paid");
});

test("9. zero-cost no-payment-required is valid without a PaymentIntent", () => {
  const transition = transitionForStripeSnapshot({
    actualAmount: 0,
    amountRefunded: 0,
    checkoutStatus: "complete",
    eventType: "checkout.session.completed",
    hasPaymentIntent: false,
    paymentIntentStatus: null,
    paymentStatus: "no_payment_required",
  });
  assert.equal(transition?.purchaseStatus, "paid");
  assert.equal(transition?.paymentStatus, "no_payment_required");
});

test("10. no-payment-required rejects a non-zero total", () => {
  assert.equal(transitionForStripeSnapshot({
    actualAmount: 1,
    amountRefunded: 0,
    checkoutStatus: "complete",
    eventType: "checkout.session.completed",
    hasPaymentIntent: false,
    paymentIntentStatus: null,
    paymentStatus: "no_payment_required",
  })?.purchaseStatus, "pending");
});

test("11. invalid signatures receive a generic 400", () => {
  assert.match(webhookSource, /constructEvent\(body, signature, STRIPE_WEBHOOK_SECRET\)/);
  assert.match(webhookSource, /response\("invalid_signature", 400\)/);
});

test("12. expected test mode is derived safely", () => {
  assert.equal(expectedStripeLivemode("false", ["sk", "live", "unused"].join("_")), false);
  assert.equal(expectedStripeLivemode(undefined, ["sk", "test", "example"].join("_")), false);
});

test("13. expected live mode is derived safely", () => {
  assert.equal(expectedStripeLivemode("true", ["sk", "test", "unused"].join("_")), true);
  assert.equal(expectedStripeLivemode(undefined, ["rk", "live", "example"].join("_")), true);
});

test("14. ambiguous keys require explicit mode configuration", () => {
  assert.equal(expectedStripeLivemode(undefined, ["whsec", "not", "a", "key"].join("_")), null);
});

test("15. persisted user mismatch is rejected", () => {
  assert.equal(purchaseIdentityMismatch(identity, { ...identity, userId: "other" }), "ownership_mismatch");
});

test("16. persisted pending intent mismatch is rejected", () => {
  assert.equal(purchaseIdentityMismatch(identity, { ...identity, pendingIntentId: "intent:87654321" }), "pending_intent_mismatch");
});

test("17. persisted template mismatch is rejected", () => {
  assert.equal(purchaseIdentityMismatch(identity, { ...identity, templateId: "other" }), "template_mismatch");
});

test("18. persisted postcode mismatch is rejected", () => {
  assert.equal(purchaseIdentityMismatch(identity, { ...identity, postcode: "2000" }), "postcode_mismatch");
});

test("19. persisted expected amount mismatch is rejected", () => {
  assert.equal(purchaseIdentityMismatch(identity, { ...identity, expectedAmount: 1999 }), "amount_mismatch");
});

test("20. persisted currency mismatch is rejected", () => {
  assert.equal(purchaseIdentityMismatch(identity, { ...identity, currency: "usd" }), "currency_mismatch");
});

test("21. exact persisted identity is accepted", () => {
  assert.equal(purchaseIdentityMismatch(identity, { ...identity }), null);
});

test("22. payment failure has explicit precedence", () => {
  const failed = transitionForStripeSnapshot({
    ...paidSnapshot,
    eventType: "payment_intent.payment_failed",
    paymentIntentStatus: "requires_payment_method",
    paymentStatus: "unpaid",
  });
  assert.deepEqual(failed, {
    amountRefunded: 0,
    paymentStatus: "unpaid",
    precedence: 20,
    purchaseStatus: "payment_failed",
    refundStatus: "none",
  });
});

test("23. a success can supersede a failure", () => {
  assert.equal(shouldApplyTransition(20, 0, transitionForStripeSnapshot(paidSnapshot)!), true);
});

test("24. a stale failure cannot supersede success", () => {
  const failed = transitionForStripeSnapshot({
    ...paidSnapshot,
    eventType: "checkout.session.async_payment_failed",
  })!;
  assert.equal(shouldApplyTransition(30, 0, failed), false);
});

test("25. partial refund is represented explicitly", () => {
  const refund = transitionForStripeSnapshot({
    ...paidSnapshot,
    actualAmount: 2000,
    amountRefunded: 500,
    eventType: "charge.refunded",
  });
  assert.equal(refund?.purchaseStatus, "partially_refunded");
  assert.equal(refund?.precedence, 40);
});

test("26. full refund is represented explicitly", () => {
  const refund = transitionForStripeSnapshot({
    ...paidSnapshot,
    actualAmount: 2000,
    amountRefunded: 2000,
    eventType: "charge.refunded",
  });
  assert.equal(refund?.purchaseStatus, "fully_refunded");
  assert.equal(refund?.precedence, 50);
});

test("27. duplicate refund amount is a no-op", () => {
  const refund = transitionForStripeSnapshot({
    ...paidSnapshot,
    actualAmount: 2000,
    amountRefunded: 500,
    eventType: "charge.refunded",
  })!;
  assert.equal(shouldApplyTransition(40, 500, refund), false);
});

test("28. a larger aggregate partial refund advances the same precedence", () => {
  const refund = transitionForStripeSnapshot({
    ...paidSnapshot,
    actualAmount: 2000,
    amountRefunded: 800,
    eventType: "charge.refunded",
  })!;
  assert.equal(shouldApplyTransition(40, 500, refund), true);
});

test("29. refund amount cannot exceed the purchase amount", () => {
  assert.equal(transitionForStripeSnapshot({
    ...paidSnapshot,
    actualAmount: 2000,
    amountRefunded: 2001,
    eventType: "charge.refunded",
  }), null);
});

test("30. missing Checkout resolution is permanently rejected safely", () => {
  assert.match(processorSource, /if \(!purchase\)[\s\S]*"permanently_rejected"[\s\S]*"invalid_object"/);
});

test("31. unsupported valid events are ignored", () => {
  assert.equal(isSupportedStripeEventType("customer.subscription.updated"), false);
  assert.match(processorSource, /"ignored"[\s\S]*"unsupported_event_type"/);
});

test("32. only current one-time Checkout event types are supported", () => {
  assert.equal(isSupportedStripeEventType("checkout.session.expired"), true);
  assert.equal(isSupportedStripeEventType("payment_intent.succeeded"), true);
  assert.equal(isSupportedStripeEventType("charge.refunded"), true);
  assert.equal(isSupportedStripeEventType("refund.created"), false);
});

test("33. temporary Stripe retrieval failure is retryable", () => {
  assert.match(processorSource, /catch \{[\s\S]*markRetryable\(event\.id, attemptCount, "stripe_retrieval_failed"\)/);
});

test("34. temporary database failure is retryable", () => {
  assert.match(processorSource, /error instanceof StripeDatabaseError/);
  assert.match(processorSource, /"temporary_database_failure"/);
  assert.match(webhookSource, /response\("retryable_failure", 500\)/);
});

test("35. ledger success followed by projection failure remains recoverable", () => {
  assert.ok(
    processorSource.indexOf("registerStripeEvent({")
      < processorSource.lastIndexOf("return processClaimedStripeEvent("),
  );
  assert.match(migrationSource, /'retryable_failed'/);
});

test("36. retries use bounded exponential backoff", () => {
  assert.equal(retryDelaySeconds(1), 60);
  assert.equal(retryDelaySeconds(3), 240);
  assert.equal(retryDelaySeconds(8), 3600);
  assert.equal(retryDelaySeconds(99), 3600);
});

test("37. reconciliation claims only failed or abandoned processing rows", () => {
  assert.match(migrationSource, /processing_status = 'retryable_failed'[\s\S]*processing_status = 'processing'/);
  assert.match(migrationSource, /for update skip locked/);
});

test("38. reconciliation batch size is capped", () => {
  assert.match(reconcileSource, /Math\.min\(Math\.max\(Math\.trunc\(requestedBatchSize\), 1\), 25\)/);
  assert.match(migrationSource, /limit least\(greatest\(p_batch_size, 1\), 25\)/);
});

test("39. permanently invalid events are never selected for reconciliation", () => {
  const claimFunction = migrationSource.slice(
    migrationSource.indexOf("create or replace function public.applix_claim_stripe_events"),
    migrationSource.indexOf("create or replace function public.applix_reject_exhausted_stripe_events"),
  );
  assert.doesNotMatch(claimFunction, /permanently_rejected/);
});

test("40. stuck processing events are recoverable after a bounded timeout", () => {
  assert.match(migrationSource, /processing_started_at[\s\S]*make_interval\(secs => greatest\(p_stale_after_seconds, 60\)\)/);
});

test("41. reconciliation has an explicit off switch", () => {
  assert.match(reconcileSource, /STRIPE_RECONCILIATION_ENABLED === "true"/);
  assert.match(reconcileSource, /response\.json\(\{ ok: false, error: "not_found" \}, \{ status: 404 \}\)/i);
});

test("42. reconciliation uses timing-safe bearer authentication", () => {
  assert.match(reconcileSource, /timingSafeEqual/);
  assert.match(reconcileSource, /STRIPE_RECONCILIATION_SECRET/);
  assert.doesNotMatch(reconcileSource, /NEXT_PUBLIC_STRIPE_RECONCILIATION/);
});

test("43. webhook and reconciliation share one processor", () => {
  assert.match(webhookSource, /receiveStripeEvent/);
  assert.match(reconcileSource, /processClaimedStripeEventById/);
  assert.match(processorSource, /processClaimedStripeEvent\(/);
});

test("44. event body size is guarded before and after reading", () => {
  assert.match(webhookSource, /content-length/);
  assert.match(webhookSource, /Buffer\.byteLength\(body, "utf8"\)/);
  assert.match(webhookSource, /MAX_WEBHOOK_BODY_BYTES/);
});

test("45. raw body is used for official SDK signature verification", () => {
  assert.ok(webhookSource.indexOf("await req.text()") < webhookSource.indexOf("constructEvent(body, signature"));
  assert.doesNotMatch(webhookSource, /await req\.json\(\)/);
});

test("46. no complete Stripe payload or secret is logged", () => {
  assert.doesNotMatch(webhookSource + processorSource + storeSource, /console\.(log|error|warn)/);
  assert.doesNotMatch(migrationSource, /raw_payload|payment_method|client_secret/);
});

test("47. internal tables have RLS and no frontend-role grants", () => {
  assert.match(migrationSource, /alter table public\.applix_purchases enable row level security/);
  assert.match(migrationSource, /alter table public\.stripe_webhook_events enable row level security/);
  assert.match(migrationSource, /revoke all on table public\.applix_purchases from anon, authenticated/);
  assert.match(migrationSource, /revoke all on table public\.stripe_webhook_events from anon, authenticated/);
  assert.match(migrationSource, /revoke delete, truncate on table public\.stripe_webhook_events from service_role/);
});

test("48. atomic RPCs are security-invoker and service-role-only", () => {
  assert.doesNotMatch(migrationSource, /security definer/i);
  assert.match(migrationSource, /security invoker/g);
  assert.match(migrationSource, /revoke execute[\s\S]*from public, anon, authenticated/);
  assert.match(migrationSource, /grant execute[\s\S]*to service_role/);
});

test("49. checkout identity is persisted before returning its URL", () => {
  assert.ok(
    createCheckoutSource.indexOf("await registerCheckoutPurchase({")
      < createCheckoutSource.indexOf("checkout_url: session.url"),
  );
  assert.match(createCheckoutSource, /checkoutSessionId: session\.id/);
});

test("50. failed purchase registration expires the unpaid Checkout Session", () => {
  const registration = createCheckoutSource.indexOf("await registerCheckoutPurchase({");
  const expiration = createCheckoutSource.indexOf("await stripe.checkout.sessions.expire(session.id)");
  const checkoutUrl = createCheckoutSource.indexOf("checkout_url: session.url");
  assert.ok(registration < expiration);
  assert.ok(expiration < checkoutUrl);
  assert.match(createCheckoutSource, /if \(session\.status !== "open"\)/);
});

test("51. payment verification reads the immutable Session row", () => {
  assert.match(paymentStatusSource, /rest\/v1\/applix_purchases/);
  assert.match(paymentStatusSource, /stripe_checkout_session_id: `eq\.\$\{checkoutSessionId\}`/);
  assert.match(paymentStatusSource, /persistedExpectedAmount === stripeExpectedAmount/);
  assert.match(paymentStatusSource, /persistedActualAmount === stripeAmount/);
});

test("52. projection statuses remain compatible with existing campaign gates", () => {
  assert.equal(projectionStatusForPurchase("paid"), "active");
  assert.equal(projectionStatusForPurchase("fully_refunded"), "refunded");
});

test("53. incompatible legacy rows are made ineligible before Stage 6", () => {
  assert.match(preflightMigrationSource, /20260726173706|Stage 6/i);
  assert.match(preflightMigrationSource, /invalid_checkout_session_id/);
  assert.match(preflightMigrationSource, /invalid_currency/);
  assert.match(preflightMigrationSource, /invalid_amount/);
  assert.match(preflightMigrationSource, /checkout_metadata - 'pending_intent_id'/);
});

test("54. ambiguous legacy identities are skipped rather than mis-projected", () => {
  assert.match(preflightMigrationSource, /duplicate_checkout_session_id/);
  assert.match(preflightMigrationSource, /duplicate_payment_intent_id/);
  assert.match(preflightMigrationSource, /having count\(\*\) > 1/g);
  assert.match(preflightMigrationSource, /stage6_backfill_skip_reason/);
});

test("55. discounted and zero-cost legacy expected amounts are repaired safely", () => {
  assert.match(readinessMigrationSource, /expected_price_amount/);
  assert.match(readinessMigrationSource, />= coalesce\(purchases\.actual_amount, 0\)/);
  assert.match(readinessMigrationSource, /expected_amount_backfilled_from_checkout_metadata/);
});

test("56. integration SQL calls the exact smallint RPC signature", () => {
  assert.match(integrationTestSource, /30::smallint/);
});

test("57. reconciliation does not require its secret while disabled", () => {
  assert.ok(
    reconcileSource.indexOf("if (!RECONCILIATION_ENABLED)")
      < reconcileSource.indexOf("if (!authorized(req))"),
  );
});
