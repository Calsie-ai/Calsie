import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { verificationStatusForPurchase } from "../lib/paymentVerification.ts";

const paymentStatusSource = readFileSync(
  new URL("../app/api/stripe/payment-status/route.ts", import.meta.url),
  "utf8",
);

test("paid purchase is confirmed", () => {
  assert.equal(verificationStatusForPurchase("paid", "paid"), "confirmed");
});

test("partially refunded purchase preserves successful payment confirmation", () => {
  assert.equal(verificationStatusForPurchase("partially_refunded", "paid"), "confirmed");
});

test("fully refunded purchase preserves successful payment confirmation", () => {
  assert.equal(verificationStatusForPurchase("fully_refunded", "paid"), "confirmed");
});

test("payment failed purchase is failed", () => {
  assert.equal(verificationStatusForPurchase("payment_failed", "unpaid"), "failed");
});

test("expired purchase is expired", () => {
  assert.equal(verificationStatusForPurchase("expired", "unpaid"), "expired");
});

test("zero-cost no-payment-required purchase is confirmed", () => {
  assert.equal(
    verificationStatusForPurchase("paid", "no_payment_required"),
    "confirmed",
  );
});

test("refund after an earlier successful return remains confirmed", () => {
  assert.equal(verificationStatusForPurchase("paid", "paid"), "confirmed");
  assert.equal(
    verificationStatusForPurchase("partially_refunded", "paid"),
    "confirmed",
  );
});

test("refreshed payment-return URL after full refund remains confirmed", () => {
  assert.equal(
    verificationStatusForPurchase("fully_refunded", "paid"),
    "confirmed",
  );
  assert.match(paymentStatusSource, /verificationStatusForPurchase\(/);
  assert.doesNotMatch(paymentStatusSource, /charges\.retrieve|charge\.refunded|amount_refunded/);
});
