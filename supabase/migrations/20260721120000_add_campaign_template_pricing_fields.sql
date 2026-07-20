alter table public.campaign_templates
  add column if not exists price_amount integer not null default 4900 check (price_amount >= 0),
  add column if not exists compare_at_price_amount integer check (compare_at_price_amount is null or compare_at_price_amount >= 0),
  add column if not exists currency text not null default 'aud' check (currency ~ '^[a-z]{3}$'),
  add column if not exists price_label text not null default 'one-time',
  add column if not exists pricing_features text[] not null default array[]::text[],
  add column if not exists payment_required boolean not null default true;

update public.campaign_templates
set compare_at_price_amount = coalesce(compare_at_price_amount, 9200),
    price_amount = case when slug = 'support-worker' then 4900 else price_amount end,
    pricing_features = case
      when cardinality(pricing_features) = 0 then array[
        '2-minute guided setup',
        format('Up to %s approved applications per day', daily_email_limit),
        format('One approved application every %s hour', hourly_email_limit),
        format('Up to %s applications over %s days', total_cap, campaign_days),
        'AI-tailored resume drafts',
        'AI-written application emails',
        'Approval required before sending',
        'Application tracking dashboard'
      ]
      else pricing_features
    end;
