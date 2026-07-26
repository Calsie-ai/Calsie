import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  GMAIL_RETURN_PARAMS,
  IDLE_EXTERNAL_RETURN,
  PAYMENT_RETURN_PARAMS,
  STRIPE_CANCEL_PATH,
  STRIPE_SUCCESS_PATH,
  gmailReturnMessage,
  isCheckoutSessionId,
  isConfirmedPaymentStatus,
  isGmailErrorReason,
  parseExternalReturn,
  paymentVerificationKey,
  transitionExternalReturn,
} from "../lib/externalReturn.ts";
import { dashboardPanelPath, dashboardPathAfterProcessing } from "../lib/dashboardNavigation.ts";
import { safeInternalPath } from "../lib/navigation.ts";
import { resolveAppOrigin } from "../lib/serverOrigin.ts";

function params(path: string) {
  return new URL(path, "https://applix.invalid").searchParams;
}

function source(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const dashboardSource = source("../app/dashboard/DashboardWorkspace.tsx");
const paymentSource = source("../app/payment/page.tsx");
const createCheckoutSource = source("../app/api/stripe/create-checkout/route.ts");
const paymentStatusSource = source("../app/api/stripe/payment-status/route.ts");
const webhookSource = source("../app/api/stripe/webhook/route.ts");
const connectRouteSource = source("../app/api/applix/connect-gmail/route.ts");
const connectFunctionSource = source("../../supabase/functions/connect-gmail/index.ts");
const callbackFunctionSource = source("../../supabase/functions/gmail-oauth-callback/index.ts");

test("Stripe success URL returns to the templates panel with a Checkout Session placeholder", () => {
  assert.equal(STRIPE_SUCCESS_PATH, "/dashboard?panel=templates&payment=success&session_id={CHECKOUT_SESSION_ID}");
});

test("Stripe cancellation URL returns to the templates panel", () => {
  assert.equal(STRIPE_CANCEL_PATH, "/dashboard?panel=templates&payment=cancelled");
});

test("successful Stripe query parses only a valid Checkout Session ID", () => {
  assert.deepEqual(
    parseExternalReturn(params("/dashboard?payment=success&session_id=cs_test_12345678")),
    { kind: "stripe_success", sessionId: "cs_test_12345678", invalidSession: false },
  );
});

test("missing Stripe session ID is marked invalid", () => {
  assert.deepEqual(
    parseExternalReturn(params("/dashboard?payment=success")),
    { kind: "stripe_success", sessionId: null, invalidSession: true },
  );
});

test("forged Stripe session ID is rejected", () => {
  assert.equal(isCheckoutSessionId("pi_test_12345678"), false);
  assert.equal(isCheckoutSessionId("cs_test_bad/path"), false);
});

test("live and test Checkout Session IDs are accepted", () => {
  assert.equal(isCheckoutSessionId("cs_test_12345678"), true);
  assert.equal(isCheckoutSessionId("cs_live_abcdefgh"), true);
});

test("Stripe cancellation parses as an explicit return kind", () => {
  assert.deepEqual(
    parseExternalReturn(params("/dashboard?payment=cancelled")),
    { kind: "stripe_cancelled" },
  );
});

test("Gmail success parses as an explicit return kind", () => {
  assert.deepEqual(
    parseExternalReturn(params("/dashboard?gmail=connected")),
    { kind: "gmail_connected" },
  );
});

test("Gmail failure accepts only safe reason enums", () => {
  assert.equal(isGmailErrorReason("access_denied"), true);
  assert.equal(isGmailErrorReason("oauth error: user@example.com"), false);
  assert.deepEqual(
    parseExternalReturn(params("/dashboard?gmail=error&reason=user%40example.com")),
    { kind: "gmail_error", reason: "unknown" },
  );
});

test("safe Gmail messages contain no provider payload", () => {
  assert.match(gmailReturnMessage("access_denied"), /cancelled/i);
  assert.doesNotMatch(gmailReturnMessage("exchange_failed"), /@|token|code=/i);
});

test("the external return state machine documents departure through processing", () => {
  let state = transitionExternalReturn(IDLE_EXTERNAL_RETURN, { type: "depart", kind: "stripe_success", key: "intent" });
  assert.equal(state.phase, "departing");
  state = transitionExternalReturn(state, { type: "return", kind: "stripe_success", key: "session:intent" });
  assert.equal(state.phase, "returned");
  state = transitionExternalReturn(state, { type: "verify" });
  assert.equal(state.phase, "verifying");
  state = transitionExternalReturn(state, { type: "confirm" });
  assert.equal(state.phase, "confirmed");
  state = transitionExternalReturn(state, { type: "process" });
  assert.equal(state.phase, "processed");
});

test("the state machine models pending, cancellation, and failure separately", () => {
  const returned = transitionExternalReturn(IDLE_EXTERNAL_RETURN, { type: "return", kind: "stripe_success" });
  assert.equal(transitionExternalReturn(returned, { type: "pending" }).phase, "pending");
  assert.equal(transitionExternalReturn(returned, { type: "cancel" }).phase, "cancelled");
  assert.equal(transitionExternalReturn(returned, { type: "fail" }).phase, "failed");
});

test("verification key binds an exact session to an exact pending intent", () => {
  assert.equal(paymentVerificationKey("cs_test_12345678", "intent-12345678"), "cs_test_12345678:intent-12345678");
});

test("paid confirmation is accepted", () => {
  assert.equal(isConfirmedPaymentStatus({ ok: true, status: "confirmed", paymentStatus: "paid" }), true);
});

test("no-payment-required confirmation is accepted", () => {
  assert.equal(isConfirmedPaymentStatus({ ok: true, status: "confirmed", paymentStatus: "no_payment_required" }), true);
});

test("a query hint without confirmed server status is never accepted", () => {
  assert.equal(isConfirmedPaymentStatus({ ok: false, status: "pending" }), false);
  assert.equal(isConfirmedPaymentStatus({ ok: true, status: "mismatch", paymentStatus: "paid" }), false);
});

test("payment cleanup removes only payment return parameters", () => {
  const current = params("/dashboard?panel=templates&payment=success&session_id=cs_test_12345678&restoreIntent=1");
  assert.equal(
    dashboardPathAfterProcessing("templates", current, true, PAYMENT_RETURN_PARAMS),
    "/dashboard?panel=templates&restoreIntent=1",
  );
});

test("Gmail cleanup removes only Gmail return parameters", () => {
  const current = params("/dashboard?panel=gmail&gmail=error&reason=access_denied&restoreIntent=1");
  assert.equal(
    dashboardPathAfterProcessing("gmail", current, true, GMAIL_RETURN_PARAMS),
    "/dashboard?panel=gmail&restoreIntent=1",
  );
});

test("return routing deliberately selects the exact Stripe panel", () => {
  assert.equal(
    dashboardPanelPath("templates", params(STRIPE_SUCCESS_PATH.replace("{CHECKOUT_SESSION_ID}", "cs_test_12345678"))),
    "/dashboard?panel=templates&payment=success&session_id=cs_test_12345678",
  );
});

test("return routing deliberately selects the exact Gmail panel", () => {
  assert.equal(
    dashboardPanelPath("gmail", params("/dashboard?gmail=connected")),
    "/dashboard?panel=gmail&gmail=connected",
  );
});

test("preview origin resolution prefers the active Vercel preview", () => {
  assert.equal(resolveAppOrigin({
    VERCEL_ENV: "preview",
    VERCEL_URL: "stage-5-preview.vercel.app",
    APP_URL: "https://production.example",
  }), "https://stage-5-preview.vercel.app");
});

test("production origin resolution prefers the configured application URL", () => {
  assert.equal(resolveAppOrigin({
    VERCEL_ENV: "production",
    VERCEL_URL: "deployment.vercel.app",
    APP_URL: "https://app.example/path",
  }), "https://app.example");
});

test("unsafe origin schemes are ignored", () => {
  assert.equal(resolveAppOrigin({
    VERCEL_ENV: "preview",
    VERCEL_URL: "javascript:alert(1)",
    APP_URL: "http://localhost:3000",
  }), "http://localhost:3000");
});

test("external and malformed return paths fall back to a safe internal path", () => {
  const fallback = "/dashboard?panel=gmail";
  assert.equal(safeInternalPath("https://evil.example/callback", fallback), fallback);
  assert.equal(safeInternalPath("//evil.example/callback", fallback), fallback);
  assert.equal(safeInternalPath("javascript:alert(1)", fallback), fallback);
  assert.equal(safeInternalPath("data:text/html,hello", fallback), fallback);
  assert.equal(safeInternalPath("/%2f%2fevil.example", fallback), fallback);
});

test("checkout departure saves pending intent before creating Checkout", () => {
  assert.ok(paymentSource.indexOf("savePendingIntent({") < paymentSource.indexOf('fetch("/api/stripe/create-checkout"'));
});

test("checkout departure has a duplicate-request guard", () => {
  assert.match(paymentSource, /checkoutRequestRef\.current/);
  assert.match(paymentSource, /if \(!template \|\| checkoutRequestRef\.current\) return/);
  assert.match(createCheckoutSource, /idempotencyKey/);
  assert.match(createCheckoutSource, /currentUser\.id[\s\S]*intentId[\s\S]*template\.id[\s\S]*postcode/);
});

test("Checkout creation uses the fixed success and cancellation paths", () => {
  assert.match(createCheckoutSource, /success_url: `\$\{appOrigin\}\$\{STRIPE_SUCCESS_PATH\}`/);
  assert.match(createCheckoutSource, /cancel_url: `\$\{appOrigin\}\$\{STRIPE_CANCEL_PATH\}`/);
});

test("Checkout metadata binds pending intent and return workflow", () => {
  assert.match(createCheckoutSource, /pending_intent_id: intentId/);
  assert.match(createCheckoutSource, /return_path: returnPath/);
  assert.match(createCheckoutSource, /originating_path: originatingPath/);
});

test("payment verification retrieves the exact Checkout Session", () => {
  assert.match(paymentStatusSource, /stripe\.checkout\.sessions\.retrieve\(checkoutSessionId\)/);
  assert.match(paymentStatusSource, /stripe_checkout_session_id: `eq\.\$\{checkoutSessionId\}`/);
});

test("payment verification binds user, intent, template, and postcode", () => {
  assert.match(paymentStatusSource, /sessionUserId !== currentUser\.id/);
  assert.match(paymentStatusSource, /session\.metadata\?\.pending_intent_id !== intentId/);
  assert.match(paymentStatusSource, /session\.metadata\?\.template_id !== templateId/);
  assert.match(paymentStatusSource, /session\.metadata\?\.postcode !== postcode/);
});

test("paid verification checks PaymentIntent amount and currency", () => {
  assert.match(paymentStatusSource, /paymentIntent\.status !== "succeeded"/);
  assert.match(paymentStatusSource, /paymentIntent\.amount_received !== Number\(session\.amount_total \?\? 0\)/);
});

test("no-payment-required verification skips PaymentIntent retrieval", () => {
  assert.ok(
    paymentStatusSource.indexOf('if (session.payment_status === "no_payment_required") return true')
      < paymentStatusSource.indexOf("stripe.paymentIntents.retrieve"),
  );
});

test("webhook persists Stripe actual total rather than the catalogue price", () => {
  assert.match(webhookSource, /paidAmount = Number\(session\.amount_total \?\? listedPrice\)/);
  assert.match(webhookSource, /price_amount: paidAmount/);
});

test("dashboard consumes pending intent only inside confirmed payment handling", () => {
  assert.ok(dashboardSource.indexOf("isConfirmedPaymentStatus(result)") < dashboardSource.indexOf("consumePendingIntentAfterSuccess(intent.id)"));
  assert.match(dashboardSource, /result\.checkoutSessionId === externalReturn\.sessionId/);
});

test("pending payment keeps its query parameters and pending intent", () => {
  const pendingBlock = dashboardSource.slice(
    dashboardSource.indexOf('if (result.status === "pending")'),
    dashboardSource.indexOf('setExternalReturnState((state) => transitionExternalReturn(state, { type: "fail" }))'),
  );
  assert.doesNotMatch(pendingBlock, /consumePendingIntentAfterSuccess|router\.replace/);
  assert.match(pendingBlock, /phase: "pending"|type: "pending"/);
});

test("failed or mismatched payment does not consume the pending intent", () => {
  const confirmedIndex = dashboardSource.indexOf("consumePendingIntentAfterSuccess(intent.id)");
  const failedIndex = dashboardSource.indexOf('message: "Payment could not be confirmed');
  assert.ok(confirmedIndex > -1 && failedIndex > confirmedIndex);
  assert.equal(dashboardSource.indexOf("consumePendingIntentAfterSuccess(intent.id)", confirmedIndex + 1), -1);
});

test("cancellation restores state before cleaning its query hint", () => {
  const cancellationStart = dashboardSource.indexOf('if (externalReturn?.kind === "stripe_cancelled")');
  const cancellationEnd = dashboardSource.indexOf('if (externalReturn?.kind === "stripe_success")', cancellationStart);
  const cancellationBlock = dashboardSource.slice(cancellationStart, cancellationEnd);
  assert.ok(cancellationBlock.indexOf("applyRestoration()") < cancellationBlock.indexOf("dashboardPathAfterProcessing"));
  assert.doesNotMatch(cancellationBlock, /consumePendingIntentAfterSuccess/);
});

test("dashboard prevents duplicate refresh and Back/Forward verification", () => {
  assert.match(dashboardSource, /paymentCheckRef\.current === paymentCheckKey/);
  assert.match(dashboardSource, /gmailCheckRef\.current === gmailCheckKey/);
  assert.doesNotMatch(dashboardSource, /create-checkout/);
});

test("cancellation and failed payment expose a deliberate checkout continuation", () => {
  assert.match(dashboardSource, /externalReturnState\.phase === "cancelled"/);
  assert.match(dashboardSource, /Continue to checkout/);
  assert.match(dashboardSource, /router\.push\("\/payment\?restoreIntent=1"\)/);
});

test("Gmail initiation accepts only the exact safe return panel", () => {
  assert.match(connectRouteSource, /returnPath !== "\/dashboard\?panel=gmail"/);
  assert.doesNotMatch(connectRouteSource, /body\.return_to/);
});

test("Gmail OAuth state is random, signed, expiring, and user-bound", () => {
  assert.match(connectFunctionSource, /crypto\.randomUUID\(\)/);
  assert.match(connectFunctionSource, /await sign\(payload\)/);
  assert.match(connectFunctionSource, /expires_at/);
  assert.match(connectFunctionSource, /user_id: user\.id/);
});

test("Gmail callback validates state and the bound Supabase user", () => {
  assert.match(callbackFunctionSource, /parseState\(url\.searchParams\.get\("state"\)/);
  assert.match(callbackFunctionSource, /admin\.auth\.admin\.getUserById\(state\.user_id\)/);
  assert.match(callbackFunctionSource, /boundUser\.user\.email\.trim\(\)\.toLowerCase\(\) !== expectedEmail/);
});

test("Gmail callback success returns only the validated Gmail panel hint", () => {
  assert.match(callbackFunctionSource, /destination\.searchParams\.set\("gmail", result\.gmail\)/);
  assert.match(callbackFunctionSource, /destination\.pathname !== "\/dashboard"/);
  assert.match(callbackFunctionSource, /destination\.searchParams\.get\("panel"\) !== "gmail"/);
});

test("expired Gmail state returns only a safe reason enum", () => {
  assert.match(callbackFunctionSource, /reason: "expired_state"/);
  assert.doesNotMatch(callbackFunctionSource, /searchParams\.set\("email"/);
});

test("Gmail callback preserves an existing active connection on failure", () => {
  assert.match(callbackFunctionSource, /current\.data\?\.status === "connected"/);
  assert.match(callbackFunctionSource, /if \(hasActiveConnection\)/);
  assert.match(callbackFunctionSource, /\.update\(\{ last_error: reason/);
});

test("Gmail callback refresh is idempotent after a completed exchange", () => {
  assert.match(callbackFunctionSource, /connectedAt >= Date\.parse\(state\.created_at\)/);
  assert.match(callbackFunctionSource, /redirectResult\(state\.return_to, \{ gmail: "connected" \}\)/);
});

test("dashboard verifies Gmail database state instead of trusting the query", () => {
  assert.match(dashboardSource, /from\("user_email_authorizations"\)/);
  assert.match(dashboardSource, /result\.data\?\.status === "connected"/);
  assert.match(dashboardSource, /externalReturn\.kind === "gmail_connected" && connected/);
});

test("Gmail departure carries pending intent continuity without exposing it in the callback URL", () => {
  assert.match(dashboardSource, /pending_intent_id: savedIntent\?\.id \|\| null/);
  assert.match(connectRouteSource, /pending_intent_id: pendingIntentId \|\| null/);
  assert.doesNotMatch(callbackFunctionSource, /searchParams\.set\("pending_intent_id"/);
});
