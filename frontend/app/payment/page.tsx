"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseClient } from "../../lib/supabaseClient";
import { inferAustralianPostcode } from "../../lib/australianPostcode";
import styles from "./payment.module.css";

type TemplateCheckout = {
  id: string;
  title: string;
  campaign_name: string;
  role: string;
  location: string;
  description: string;
  price_amount: number;
  compare_at_price_amount: number | null;
  currency: string;
  price_label: string;
  pricing_features: string[];
  payment_required: boolean;
};

type CheckoutResult = {
  ok?: boolean;
  checkout_url?: string | null;
  error?: string;
};

function money(amount: number, currency = "aud") {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: currency.toUpperCase(),
    maximumFractionDigits: amount % 100 === 0 ? 0 : 2,
  }).format(amount / 100);
}

function CheckoutContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const templateId = searchParams.get("template")?.trim() || "";
  const postcode = searchParams.get("postcode")?.trim() || "";
  const postcodeInfo = inferAustralianPostcode(postcode);
  const [template, setTemplate] = useState<TemplateCheckout | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void load();
  }, [templateId, postcode]);

  async function load() {
    setLoading(true);
    setMessage("");
    try {
      const supabase = getSupabaseClient();
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) {
        const next = `/payment?template=${encodeURIComponent(templateId)}&postcode=${encodeURIComponent(postcode)}`;
        router.replace(`/login?next=${encodeURIComponent(next)}`);
        return;
      }
      if (!templateId) {
        setMessage("Choose a template from Browse Templates before opening checkout.");
        return;
      }
      if (!postcodeInfo.valid) {
        setMessage("Return to the template and enter a valid Australian postcode before checkout.");
        return;
      }
      const { data, error } = await supabase
        .from("campaign_templates")
        .select("id,title,campaign_name,role,location,description,price_amount,compare_at_price_amount,currency,price_label,pricing_features,payment_required")
        .eq("id", templateId)
        .eq("is_active", true)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("This template is unavailable.");
      setTemplate(data as TemplateCheckout);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load checkout.");
    } finally {
      setLoading(false);
    }
  }

  async function openSecureCheckout() {
    if (!template || checkoutLoading) return;
    if (!postcodeInfo.valid) {
      setMessage("Return to the template and enter a valid Australian postcode before checkout.");
      return;
    }

    setCheckoutLoading(true);
    setMessage("");
    try {
      const supabase = getSupabaseClient();
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const accessToken = data.session?.access_token;
      if (!accessToken) {
        const next = `/payment?template=${encodeURIComponent(template.id)}&postcode=${encodeURIComponent(postcodeInfo.postcode)}`;
        router.replace(`/login?next=${encodeURIComponent(next)}`);
        return;
      }

      const response = await fetch("/api/stripe/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          access_token: accessToken,
          template_id: template.id,
          postcode: postcodeInfo.postcode,
        }),
      });
      const result = (await response.json().catch(() => ({}))) as CheckoutResult;
      if (!response.ok || !result.ok || !result.checkout_url) {
        throw new Error(result.error || "Could not create secure checkout.");
      }

      window.location.assign(result.checkout_url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create secure checkout.");
      setCheckoutLoading(false);
    }
  }

  const templateName = template?.campaign_name || template?.title || "Campaign checkout";

  return (
    <main className={`${styles.page} applix-landing`} id="top">
      <header className="applix-header">
        <div className="applix-container applix-header-inner">
          <a className="applix-brand" href="/" aria-label="Calsie Jobs home">
            <img src="/applix-logo.svg" alt="" />
            <span>Calsie | Jobs</span>
          </a>
          <nav className="applix-nav" aria-label="Checkout navigation">
            <a href="/dashboard">Dashboard</a>
            <a href="/support">Support</a>
          </nav>
          <div className="applix-actions">
            <a className="applix-button applix-button--subtle" href="/dashboard">Back to templates</a>
          </div>
        </div>
      </header>

      <section className={styles.shell} aria-labelledby="payment-title">
        <div className={styles.intro}>
          <div>
            <p className={styles.eyebrow}>Secure campaign checkout</p>
            <h1 id="payment-title">Review your campaign before payment.</h1>
          </div>
          <p>Your template, location and campaign features are confirmed before Stripe opens.</p>
        </div>

        {loading ? <div className={styles.loading}>Loading template checkout…</div> : null}
        {message ? <div className={styles.alert} role="alert">{message}</div> : null}

        {template ? (
          <div className={styles.checkoutGrid}>
            <article className={styles.summaryCard}>
              <div className={styles.templateTag}>Selected campaign template</div>
              <h2>{templateName}</h2>
              <p className={styles.description}>{template.description}</p>

              <div className={styles.metaGrid}>
                <div className={styles.metaItem}>
                  <span>Target role</span>
                  <strong>{template.role}</strong>
                </div>
                <div className={styles.metaItem}>
                  <span>Campaign location</span>
                  <strong>{postcodeInfo.label}</strong>
                </div>
              </div>

              <div className={styles.matchingCard}>
                <div className={styles.matchingIcon}>✓</div>
                <div>
                  <strong>Smart local matching enabled</strong>
                  <p>Calsie will use postcode {postcodeInfo.postcode} to rank nearby jobs and providers whose service coverage includes your area.</p>
                </div>
              </div>

              <div className={styles.featuresHeader}>
                <h3>Included features</h3>
                <span>{template.pricing_features?.length || 0} campaign benefits</span>
              </div>
              <div className={styles.featuresGrid}>
                {(template.pricing_features || []).map((feature) => (
                  <div className={styles.feature} key={feature}>
                    <span className={styles.featureMark}>✓</span>
                    <span>{feature}</span>
                  </div>
                ))}
              </div>
            </article>

            <aside className={styles.priceCard} aria-label="Order summary">
              <div className={styles.priceTop}>
                <p className={styles.priceLabel}>Template price</p>
                <div className={styles.priceRow}>
                  {template.compare_at_price_amount ? (
                    <span className={styles.comparePrice}>{money(template.compare_at_price_amount, template.currency)}</span>
                  ) : null}
                  <strong className={styles.currentPrice}>{money(template.price_amount, template.currency)}</strong>
                </div>
                <p className={styles.priceTerm}>{template.price_label}</p>
              </div>

              <div className={styles.priceBody}>
                <div className={styles.orderLine}>
                  <span>Campaign</span>
                  <strong>{templateName}</strong>
                </div>
                <p className={styles.checkoutCopy}>Your campaign is created after Stripe confirms the payment or an approved promotion code.</p>
                <button
                  type="button"
                  className={styles.checkoutButton}
                  onClick={() => void openSecureCheckout()}
                  disabled={checkoutLoading || !postcodeInfo.valid}
                >
                  {checkoutLoading ? "Opening secure checkout…" : template.payment_required === false ? "Use free template" : "Continue to secure checkout"}
                </button>
                <div className={styles.secureNote}>
                  <b>↗</b>
                  <span>You will be redirected to Stripe. Duplicate checkout requests are blocked while loading.</span>
                </div>
              </div>
            </aside>
          </div>
        ) : null}
      </section>
    </main>
  );
}

export default function PaymentPage() {
  return (
    <Suspense fallback={<main style={{ padding: 40 }}>Loading checkout…</main>}>
      <CheckoutContent />
    </Suspense>
  );
}
