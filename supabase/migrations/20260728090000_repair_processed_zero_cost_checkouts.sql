begin;

-- Forward-only repair for completed 100%-discount Checkout Sessions that Stripe
-- reported as payment_status=paid, amount_total=0 and no PaymentIntent. The Stage 6
-- state machine previously left those exact purchases pending. This update requires
-- processed webhook evidence and exact immutable identity agreement.

alter table public.applix_purchases
  disable trigger applix_purchases_preserve_identity;

with eligible as (
  select distinct on (p.id)
    p.id as purchase_id,
    p.user_id,
    p.stripe_checkout_session_id,
    p.purchase_sequence,
    p.stripe_checkout_created_at,
    p.template_id,
    p.pending_intent_id,
    p.postcode,
    p.expected_amount,
    p.currency,
    e.stripe_event_id,
    e.stripe_created_at,
    e.safe_metadata->>'payment_status' as stripe_payment_status
  from public.applix_purchases p
  join public.stripe_webhook_events e
    on e.checkout_session_id = p.stripe_checkout_session_id
   and e.user_id = p.user_id
   and e.pending_intent_id = p.pending_intent_id
   and e.template_id = p.template_id
   and e.livemode = p.livemode
  where e.processing_status = 'processed'
    and e.event_type = 'checkout.session.completed'
    and e.safe_metadata->>'checkout_status' = 'complete'
    and e.safe_metadata->>'payment_status' in ('paid', 'no_payment_required')
    and e.safe_metadata->>'amount_subtotal' ~ '^[0-9]{1,10}$'
    and e.safe_metadata->>'amount_total' = '0'
    and e.safe_metadata->>'amount_discount' ~ '^[0-9]{1,10}$'
    and (e.safe_metadata->>'amount_subtotal')::integer = p.expected_amount
    and (e.safe_metadata->>'amount_discount')::integer = p.expected_amount
    and p.actual_amount = 0
    and p.purchase_status in ('checkout_started', 'pending')
    and p.payment_status in ('unpaid', 'pending')
    and p.refund_status = 'none'
    and p.amount_refunded = 0
    and p.stripe_payment_intent_id is null
    and p.postcode ~ '^\d{4}$'
    and p.currency ~ '^[a-z]{3}$'
    and not exists (
      select 1
      from public.applix_purchases successful
      where successful.user_id = p.user_id
        and successful.template_id = p.template_id
        and successful.id <> p.id
        and successful.purchase_status in ('paid', 'partially_refunded')
        and successful.stripe_checkout_session_id <> p.stripe_checkout_session_id
    )
  order by p.id, e.stripe_created_at desc, e.received_at desc
), repaired as (
  update public.applix_purchases p
  set
    purchase_status = 'paid',
    payment_status = eligible.stripe_payment_status,
    actual_amount = 0,
    latest_event_precedence = 30,
    latest_stripe_event_id = eligible.stripe_event_id,
    latest_stripe_event_created_at = eligible.stripe_created_at,
    safe_metadata = p.safe_metadata || jsonb_build_object(
      'zero_cost_paid_repair', true,
      'zero_cost_paid_repair_migration', '20260728090000'
    ),
    updated_at = now()
  from eligible
  where p.id = eligible.purchase_id
    and p.purchase_status in ('checkout_started', 'pending')
    and p.payment_status in ('unpaid', 'pending')
  returning p.id, p.user_id, p.purchase_sequence, p.stripe_checkout_created_at
)
update public.applix_subscriptions s
set
  status = 'active',
  payment_status = p.payment_status,
  price_amount = 0,
  current_purchase_id = p.id,
  current_purchase_sequence = p.purchase_sequence,
  current_checkout_created_at = p.stripe_checkout_created_at,
  latest_stripe_event_id = p.latest_stripe_event_id,
  latest_stripe_event_created_at = p.latest_stripe_event_created_at,
  latest_event_precedence = 30,
  updated_at = now()
from public.applix_purchases p
join repaired r on r.id = p.id
where s.user_id = p.user_id
  and (
    s.current_purchase_id = p.id
    or s.current_purchase_id is null
    or s.current_checkout_created_at < p.stripe_checkout_created_at
    or (
      s.current_checkout_created_at = p.stripe_checkout_created_at
      and coalesce(s.current_purchase_sequence, 0) <= p.purchase_sequence
    )
  );

alter table public.applix_purchases
  enable trigger applix_purchases_preserve_identity;

comment on table public.applix_purchases is
  'Immutable one-time Stripe Checkout purchases. Migration 20260728090000 repairs only processed, exactly matched zero-cost paid Sessions previously left pending.';

commit;
