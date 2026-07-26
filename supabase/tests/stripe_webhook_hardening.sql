-- Run only against a disposable Supabase branch after applying the Stage 6 migration.
-- The transaction proves unique receipt, atomic recovery claims, and the guarded
-- current projection, then rolls every fixture and state change back.
begin;

do $stage6_database_test$
declare
  v_user_id uuid;
  v_template_id uuid;
  v_amount integer;
  v_currency text;
  v_first record;
  v_duplicate record;
  v_claimed record;
  v_purchase_a record;
  v_projection record;
begin
  select id
    into v_user_id
    from auth.users
   order by created_at
   limit 1;

  select id, price_amount, lower(currency)
    into v_template_id, v_amount, v_currency
    from public.campaign_templates
   where is_active = true
     and payment_required = true
     and price_amount >= 0
   order by created_at
   limit 1;

  if v_user_id is null or v_template_id is null then
    raise exception 'Stage 6 database test requires one test user and one paid active template';
  end if;

  perform *
    from public.applix_register_checkout_purchase(
      v_user_id,
      null,
      null,
      'cs_test_Stage6CheckoutA123456',
      now() - interval '1 minute',
      'stage6:intent:A123456',
      v_template_id,
      '2141',
      v_amount,
      v_currency,
      'Stage 6 test',
      false,
      '{"test_fixture":"checkout_a"}'::jsonb
    );

  perform *
    from public.applix_register_checkout_purchase(
      v_user_id,
      null,
      null,
      'cs_test_Stage6CheckoutB123456',
      now(),
      'stage6:intent:B123456',
      v_template_id,
      '2141',
      v_amount,
      v_currency,
      'Stage 6 test',
      false,
      '{"test_fixture":"checkout_b"}'::jsonb
    );

  select *
    into v_projection
    from public.applix_subscriptions
   where user_id = v_user_id;

  if v_projection.stripe_checkout_session_id <> 'cs_test_Stage6CheckoutB123456' then
    raise exception 'newer checkout did not become the current projection';
  end if;

  select *
    into v_first
    from public.applix_register_stripe_event(
      'evt_Stage6Atomic123456',
      'checkout.session.completed',
      now(),
      false,
      'cs_test_Stage6CheckoutA123456',
      'cs_test_Stage6CheckoutA123456',
      'pi_Stage6Atomic123456',
      null,
      null,
      repeat('a', 64),
      '{"test_fixture":true}'::jsonb
    );

  select *
    into v_duplicate
    from public.applix_register_stripe_event(
      'evt_Stage6Atomic123456',
      'checkout.session.completed',
      now(),
      false,
      'cs_test_Stage6CheckoutA123456',
      'cs_test_Stage6CheckoutA123456',
      'pi_Stage6Atomic123456',
      null,
      null,
      repeat('a', 64),
      '{"test_fixture":true}'::jsonb
    );

  if v_first.claimed is not true or v_duplicate.claimed is not false then
    raise exception 'unique event registration did not produce exactly one owner';
  end if;

  perform public.applix_finish_stripe_event(
    'evt_Stage6Atomic123456',
    'retryable_failed',
    'temporary_database_failure',
    'test retry',
    now() - interval '1 second'
  );

  select claimed.*
    into v_claimed
    from public.applix_claim_stripe_events(25, 300) claimed
   where claimed.stripe_event_id = 'evt_Stage6Atomic123456';

  if v_claimed.stripe_event_id is null
    or v_claimed.processing_status <> 'processing'
    or v_claimed.processing_attempt_count <> 2
  then
    raise exception 'eligible event was not atomically reclaimed';
  end if;

  perform public.applix_finalize_stripe_event(
    'evt_Stage6Atomic123456',
    'cs_test_Stage6CheckoutA123456',
    'pi_Stage6Atomic123456',
    null,
    null,
    v_user_id,
    'stage6:intent:A123456',
    v_template_id,
    '2141',
    v_amount,
    v_amount,
    v_currency,
    'paid',
    'paid',
    'none',
    0,
    30,
    now(),
    '{"test_fixture":"paid_a"}'::jsonb
  );

  select *
    into v_purchase_a
    from public.applix_purchases
   where stripe_checkout_session_id = 'cs_test_Stage6CheckoutA123456';

  select *
    into v_projection
    from public.applix_subscriptions
   where user_id = v_user_id;

  if v_purchase_a.purchase_status <> 'paid' then
    raise exception 'historical checkout did not receive its valid state';
  end if;

  if v_projection.stripe_checkout_session_id <> 'cs_test_Stage6CheckoutB123456'
    or v_projection.current_purchase_id = v_purchase_a.id
  then
    raise exception 'older checkout overwrote the newer current projection';
  end if;
end;
$stage6_database_test$;

rollback;
