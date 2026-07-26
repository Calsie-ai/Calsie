begin;

-- Stage 6 registered new Checkouts with the catalogue price in expected_amount.
-- For pre-Stage-6 successful rows, applix_subscriptions.price_amount may instead
-- hold Stripe's discounted amount_total. Restore the immutable expected amount
-- from the safe checkout metadata when that value is valid.
alter table public.applix_purchases
  disable trigger applix_purchases_preserve_identity;

update public.applix_purchases purchases
set
  expected_amount = (subscriptions.checkout_metadata->>'expected_price_amount')::integer,
  safe_metadata = purchases.safe_metadata || jsonb_build_object(
    'expected_amount_backfilled_from_checkout_metadata',
    true
  ),
  updated_at = now()
from public.applix_subscriptions subscriptions
where purchases.safe_metadata->>'migration_source' = 'applix_subscriptions'
  and subscriptions.stripe_checkout_session_id = purchases.stripe_checkout_session_id
  and subscriptions.checkout_metadata->>'expected_price_amount' ~ '^[0-9]{1,10}$'
  and (subscriptions.checkout_metadata->>'expected_price_amount')::bigint
      <= 2147483647
  and (subscriptions.checkout_metadata->>'expected_price_amount')::integer
      >= coalesce(purchases.actual_amount, 0)
  and purchases.expected_amount
      <> (subscriptions.checkout_metadata->>'expected_price_amount')::integer;

alter table public.applix_purchases
  enable trigger applix_purchases_preserve_identity;

comment on column public.applix_purchases.expected_amount is
  'Immutable pre-discount Checkout subtotal in minor currency units; legacy discounted rows are repaired from validated checkout metadata.';

commit;
