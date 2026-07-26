begin;

-- The merged Stage 6 migration backfills only rows with a valid pending intent.
-- Make destination-incompatible legacy identities ineligible before that
-- migration runs so one malformed or ambiguous row cannot abort the deployment.
-- Skipped subscriptions retain their existing projection and fail closed with
-- current_purchase_id left null after Stage 6.
with eligible as (
  select subscriptions.*
  from public.applix_subscriptions subscriptions
  where subscriptions.user_id is not null
    and subscriptions.stripe_checkout_session_id is not null
    and subscriptions.template_id is not null
    and subscriptions.postcode is not null
    and subscriptions.checkout_metadata->>'pending_intent_id'
        ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,191}$'
),
duplicate_sessions as (
  select stripe_checkout_session_id
  from eligible
  group by stripe_checkout_session_id
  having count(*) > 1
),
duplicate_payment_intents as (
  select stripe_payment_intent_id
  from eligible
  where stripe_payment_intent_id is not null
  group by stripe_payment_intent_id
  having count(*) > 1
),
unsafe as (
  select
    eligible.id,
    concat_ws(
      ',',
      case
        when eligible.stripe_checkout_session_id
          !~ '^cs_(test|live)_[A-Za-z0-9]+$'
        then 'invalid_checkout_session_id'
      end,
      case
        when lower(eligible.currency) !~ '^[a-z]{3}$'
        then 'invalid_currency'
      end,
      case
        when eligible.price_amount < 0
        then 'invalid_amount'
      end,
      case
        when duplicate_sessions.stripe_checkout_session_id is not null
        then 'duplicate_checkout_session_id'
      end,
      case
        when duplicate_payment_intents.stripe_payment_intent_id is not null
        then 'duplicate_payment_intent_id'
      end
    ) as skip_reason
  from eligible
  left join duplicate_sessions
    on duplicate_sessions.stripe_checkout_session_id
      = eligible.stripe_checkout_session_id
  left join duplicate_payment_intents
    on duplicate_payment_intents.stripe_payment_intent_id
      = eligible.stripe_payment_intent_id
)
update public.applix_subscriptions subscriptions
set
  checkout_metadata = (
    subscriptions.checkout_metadata - 'pending_intent_id'
  ) || jsonb_build_object(
    'stage6_backfill_skipped',
    true,
    'stage6_backfill_skip_reason',
    unsafe.skip_reason
  ),
  updated_at = now()
from unsafe
where subscriptions.id = unsafe.id
  and unsafe.skip_reason <> '';

commit;
