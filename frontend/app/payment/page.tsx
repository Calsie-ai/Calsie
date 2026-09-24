"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, ArrowRight, Check, LockKeyhole, MapPin } from "lucide-react";
import ThemeToggle from "../dashboard/ThemeToggle";
import { useAuth } from "../providers/AuthProvider";
import { getSupabaseClient } from "../../lib/supabaseClient";
import { inferAustralianPostcode } from "../../lib/australianPostcode";
import { loginPathFor } from "../../lib/navigation";
import { readPendingIntent, savePendingIntent, type PendingIntentV1 } from "../../lib/pendingIntent";
import { ACTION_TIMEOUTS, isAbortError, normaliseAppError, readJsonResponse, withActionTimeout } from "../../lib/actionState";
import styles from "./payment.module.css";

type TemplateCheckout = {
  id: string;
  slug: string;
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
  status?: string;
  checkout_url?: string | null;
  template_id?: string;
  purchase_id?: string;
  campaign_id?: string | null;
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
  const { session, status, user } = useAuth();
  const legacyTemplateId = searchParams.get("template")?.trim() || "";
  const legacyPostcode = searchParams.get("postcode")?.trim() || "";
  const [purchaseIntent, setPurchaseIntent] = useState<PendingIntentV1 | null>(null);
  const [intentLoaded, setIntentLoaded] = useState(false);
  const templateId = purchaseIntent?.templateId || legacyTemplateId;
  const postcode = purchaseIntent?.postcode || legacyPostcode;
  const postcodeInfo = inferAustralianPostcode(postcode);
  const [template, setTemplate] = useState<TemplateCheckout | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [message, setMessage] = useState("");
  const checkoutRequestRef = useRef(false);
  const checkoutAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const storedIntent = readPendingIntent();
    setPurchaseIntent(storedIntent?.type === "purchase_template" ? storedIntent : null);
    setIntentLoaded(true);
  }, []);

  useEffect(() => {
    if (!intentLoaded || status === "loading") return;
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [intentLoaded, postcode, purchaseIntent?.id, status, templateId, user?.id]);

  useEffect(() => () => checkoutAbortRef.current?.abort(), []);

  async function load(signal: AbortSignal) {
    setLoading(true);
    setMessage("");
    try {
      if (status !== "authenticated" || !user) {
        if (purchaseIntent) {
          savePendingIntent({
            id: purchaseIntent.id,
            type: purchaseIntent.type,
            returnPath: purchaseIntent.returnPath,
            panel: purchaseIntent.panel,
            templateId: purchaseIntent.templateId,
            templateSlug: purchaseIntent.templateSlug,
            postcode: purchaseIntent.postcode,
            currentStep: purchaseIntent.currentStep,
            intendedAction: purchaseIntent.intendedAction,
            userHint: purchaseIntent.userHint,
          });
        } else if (templateId && postcodeInfo.valid) {
          savePendingIntent({
            type: "purchase_template",
            returnPath: "/dashboard?panel=templates&restoreIntent=1",
            panel: "templates",
            templateId,
            postcode: postcodeInfo.postcode,
            currentStep: "review",
            intendedAction: "continue_to_checkout",
          });
        }
        router.replace(loginPathFor("/dashboard?panel=templates&restoreIntent=1"));
        return;
      }
      if (purchaseIntent?.userHint && purchaseIntent.userHint !== user.id) {
        setMessage("This saved campaign belongs to a different account. Return to templates to review or discard it.");
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
      const { data, error } = await getSupabaseClient()
        .from("campaign_templates")
        .select("id,slug,title,campaign_name,role,location,description,price_amount,compare_at_price_amount,currency,price_label,pricing_features,payment_required")
        .eq("id", templateId)
        .eq("is_active", true)
        .abortSignal(signal)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("This template is unavailable.");
      if (!signal.aborted) setTemplate(data as TemplateCheckout);
    } catch (error) {
      if (!isAbortError(error)) setMessage(normaliseAppError(error, "Could not load checkout.") || "");
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }

  async function openSecureCheckout() {
    if (!template || checkoutRequestRef.current) return;
    if (!postcodeInfo.valid) {
      setMessage("Return to the template and enter a valid Australian postcode before checkout.");
      return;
    }

    checkoutRequestRef.current = true;
    const controller = new AbortController();
    checkoutAbortRef.current = controller;
    setCheckoutLoading(true);
    setMessage("");
    try {
      const accessToken = session?.access_token;
      const savedIntent = savePendingIntent({
        id: purchaseIntent?.id,
        type: "purchase_template",
        returnPath: "/dashboard?panel=templates&restoreIntent=1",
        panel: "templates",
        templateId: template.id,
        templateSlug: template.slug,
        postcode: postcodeInfo.postcode,
        currentStep: "checkout_departure",
        intendedAction: "continue_to_checkout",
        userHint: user?.id || purchaseIntent?.userHint,
      });
      if (!savedIntent) throw new Error("Could not safely save this campaign draft. Check browser storage permissions and try again.");
      setPurchaseIntent(savedIntent);

      if (!accessToken) {
        router.replace(loginPathFor("/dashboard?panel=templates&restoreIntent=1"));
        return;
      }

      const response = await withActionTimeout(fetch("/api/stripe/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          access_token: accessToken,
          intent_id: savedIntent.id,
          intended_action: savedIntent.intendedAction,
          originating_path: `${window.location.pathname}${window.location.search}`,
          return_panel: savedIntent.panel,
          return_path: savedIntent.returnPath,
          template_id: template.id,
          postcode: postcodeInfo.postcode,
        }),
        signal: controller.signal,
      }), ACTION_TIMEOUTS.ordinary, () => controller.abort());
      const result = await readJsonResponse<CheckoutResult>(response, "Could not create secure checkout.");
      if (result.status === "already_purchased") {
        router.replace("/dashboard?panel=templates&restoreIntent=1");
        return;
      }
      if (!result.ok || !result.checkout_url) throw new Error(result.error || "Checkout URL missing");
      window.location.assign(result.checkout_url);
    } catch (error) {
      if (!isAbortError(error)) setMessage(normaliseAppError(error, "Could not create secure checkout.") || "");
    } finally {
      checkoutAbortRef.current = null;
      checkoutRequestRef.current = false;
      setCheckoutLoading(false);
    }
  }

  const templateName = template?.campaign_name || template?.title || "Campaign checkout";

  return (
    <main className={styles.page} id="top">
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link className={styles.brand} href="/" aria-label="Calsie Jobs home">
            <Image src="/applix-logo.svg" alt="" width={36} height={36} />
            <span>Calsie <span className={styles.brandDivider}>/</span> Jobs</span>
          </Link>
          <nav className={styles.navigation} aria-label="Checkout navigation">
            <Link href="/support">Support</Link>
            <ThemeToggle />
          </nav>
        </div>
      </header>
      <section className={styles.shell} aria-labelledby="payment-title">
        <Link className={styles.backLink} href="/dashboard?panel=templates&restoreIntent=1">
          <ArrowLeft size={16} aria-hidden="true" /> Back to templates
        </Link>
        <div className={styles.intro}>
          <p className={styles.eyebrow}>Checkout</p>
          <h1 id="payment-title">Review your campaign</h1>
          <p>Check your details, then continue to payment.</p>
        </div>
        {loading ? <div className={styles.loading} role="status" aria-live="polite">Loading your campaign...</div> : null}
        {message ? <div className={styles.alert} role="alert">{message}</div> : null}
        {!loading && !template ? <div className={styles.emptyState}>
          <h2>Your campaign starts with a template</h2>
          <p>Choose a template and add your postcode to continue.</p>
          <Link className={styles.backLink} href="/dashboard?panel=templates">Browse templates <ArrowRight size={16} aria-hidden="true" /></Link>
        </div> : null}
        {template ? <div className={styles.checkoutGrid}>
          <article className={styles.summaryCard}>
            <p className={styles.templateTag}>Your campaign</p>
            <h2>{templateName}</h2>
            <p className={styles.description}>{template.description}</p>
            <dl className={styles.metaGrid}>
              <div className={styles.metaItem}><dt>Target role</dt><dd>{template.role}</dd></div>
              <div className={styles.metaItem}><dt>Location</dt><dd>{postcodeInfo.label}</dd></div>
            </dl>
            <div className={styles.matchingCard}>
              <MapPin size={20} aria-hidden="true" />
              <div><strong>Matched to your area</strong><p>We use postcode {postcodeInfo.postcode} to find nearby jobs and providers that cover your area.</p></div>
            </div>
            {template.pricing_features?.length ? <div className={styles.featuresSection}>
              <h3>Included features</h3>
              <ul className={styles.featuresGrid}>{template.pricing_features.map((feature, index) =>
                <li className={styles.feature} key={`${index}-${feature}`}><Check size={17} aria-hidden="true" /><span>{feature}</span></li>
              )}</ul>
            </div> : null}
          </article>
          <aside className={styles.priceCard} aria-labelledby="order-title">
            <div className={styles.priceTop}>
              <h2 id="order-title">Order summary</h2>
              <p className={styles.priceLabel}>Template price</p>
              <div className={styles.priceRow}>
                <strong className={styles.currentPrice}>{money(template.price_amount, template.currency)}</strong>
                <span className={styles.currency}>{template.currency.toUpperCase()}</span>
                {template.compare_at_price_amount && template.compare_at_price_amount > template.price_amount ? <span className={styles.comparePrice}><span className={styles.srOnly}>Previously </span>{money(template.compare_at_price_amount, template.currency)}</span> : null}
              </div>
              <p className={styles.priceTerm}>{template.price_label}</p>
            </div>
            <div className={styles.priceBody}>
              <div className={styles.orderLine}><span>Campaign</span><strong>{templateName}</strong></div>
              <p className={styles.checkoutCopy}>Your campaign is created once checkout is confirmed.</p>
              <button type="button" className={styles.checkoutButton} onClick={() => void openSecureCheckout()} disabled={checkoutLoading || !postcodeInfo.valid} aria-busy={checkoutLoading}>
                <span>{checkoutLoading ? "Opening checkout..." : template.payment_required === false ? "Use free template" : "Continue to payment"}</span>
                {!checkoutLoading ? <ArrowRight size={18} aria-hidden="true" /> : null}
              </button>
              <p className={styles.secureNote}><LockKeyhole size={14} aria-hidden="true" /><span>Secure checkout with Stripe</span></p>
            </div>
          </aside>
        </div> : null}
        <footer className={styles.footer}>Need a hand? <Link href="/support">Contact support</Link></footer>
      </section>
    </main>
  );
}

export default function PaymentPage() {
  return <Suspense fallback={<main className={styles.page}><div className={styles.shell}><p className={styles.loading} role="status">Loading checkout...</p></div></main>}><CheckoutContent /></Suspense>;
}
