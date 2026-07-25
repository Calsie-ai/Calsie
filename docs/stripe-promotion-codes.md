# Stripe promotion codes for template checkout

The checkout route already creates a Stripe-hosted Checkout Session with `allow_promotion_codes: true`. Promotion codes must be created in Stripe rather than hard-coded into the frontend.

## Environment split

Use Stripe test mode for preview/development and Stripe live mode for production.

### Vercel Preview and Development

- `STRIPE_SECRET_KEY=sk_test_...`
- `STRIPE_WEBHOOK_SECRET=whsec_...` from the test-mode webhook endpoint
- Create the test-only promotion code `Tester100Discount`

### Vercel Production

- `STRIPE_SECRET_KEY=sk_live_...`
- `STRIPE_WEBHOOK_SECRET=whsec_...` from the live-mode webhook endpoint
- Create the customer promotion code `EARLYACCESS`

Never create `Tester100Discount` in live mode.

## Tester100Discount

Create this while Stripe is in test mode:

1. Create a coupon with 100% off.
2. Set duration to once.
3. Create a promotion code on that coupon with code `Tester100Discount`.
4. Add a low maximum redemption count and an expiry date.

A 100% discount creates a no-cost Checkout order. The webhook treats Stripe's `no_payment_required` status as active.

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

Store the signing secret as `STRIPE_WEBHOOK_SECRET` in the corresponding Vercel environment.
