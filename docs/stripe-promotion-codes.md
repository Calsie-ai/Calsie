# Stripe promotion codes for template checkout

The checkout route creates a Stripe-hosted Checkout Session with `allow_promotion_codes: true`. Promotion codes must be created and controlled in Stripe rather than hard-coded into frontend code.

## Environment split

Use Stripe test mode for preview/development and Stripe live mode for production.

### Vercel Preview and Development

- `STRIPE_SECRET_KEY=sk_test_...`
- `STRIPE_WEBHOOK_SECRET=whsec_...` from the test-mode webhook endpoint
- Create the test-only promotion code `Tester100Discount`

### Vercel Production

- `STRIPE_SECRET_KEY=sk_live_...`
- `STRIPE_WEBHOOK_SECRET=whsec_...` from the live-mode webhook endpoint
- Create only explicitly approved customer promotion codes such as `EARLYACCESS`

`Tester100Discount` must never exist in live mode. Disable or archive it immediately if it is discovered in the live Stripe account.

## Tester100Discount

Create this only while Stripe is in test mode:

1. Create a coupon with 100% off.
2. Set duration to once.
3. Create a promotion code on that coupon with code `Tester100Discount`.
4. Add a low maximum redemption count and an expiry date.

A 100% discount creates a zero-cost Checkout order. Depending on Stripe's API behaviour and account configuration, the completed Session can report either `payment_status=paid` or `payment_status=no_payment_required` while `amount_total=0` and no PaymentIntent exists. Applix accepts either value only when the Session is complete, the total is exactly zero, no PaymentIntent exists, and all persisted purchase identity checks pass.

For production staff/testing access, use a controlled server-side entitlement or an explicitly approved live promotion. Do not hard-code tester email addresses, user IDs, or promotion codes in browser code.

## EARLYACCESS

The current childcare template price is A$79.00. To charge exactly A$19.99:

1. Create an amount-off coupon for A$59.01 AUD.
2. Set duration to once.
3. Create a promotion code on that coupon with code `EARLYACCESS`.
4. Optionally restrict it to first-time customers, add a redemption limit, and set an expiry date.

A$79.00 - A$59.01 = A$19.99.

If the normal template price changes, update this coupon so the final total remains A$19.99.

## Webhook

Create separate test and live webhook endpoints pointing to:

`https://calsie.com.au/api/stripe/webhook`

Subscribe to:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`
- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `charge.refunded`

Store the signing secret as `STRIPE_WEBHOOK_SECRET` in the corresponding Vercel environment.
