"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, ArrowRight, Check, LockKeyhole, MapPin, BriefcaseBusiness, ChevronDown, Layers } from "lucide-react";
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
        <Link className={styles.backLink} aria-label="Back to templates" href="/dashboard?panel=templates&restoreIntent=1">
          <ArrowLeft size={18} aria-hidden="true" /><span>Templates</span>
        </Link>
        <Link className={styles.brand} href="/" aria-label="Calsie Jobs home">
          <Image src="/applix-logo.svg" alt="" width={32} height={32} />
          <span>Calsie <span className={styles.brandDivider}>/</span> Jobs</span>
        </Link>
        <div className={styles.appearance}><ThemeToggle /></div>
      </header>
      <section className={styles.shell} aria-labelledby="payment-title">
        <ol className={styles.steps} aria-label="Checkout progress">
          <li aria-current="step"><span>1</span> Review</li>
          <li><span>2</span> Payment</li>
        </ol>
        <div className={styles.intro}>
          <h1 id="payment-title">Review your campaign</h1>
          <p>Your template, your location. Ready when you are.</p>
        </div>
        {loading ? <div className={styles.loading} role="status" aria-live="polite">Loading your campaign...</div> : null}
        {message ? <div className={styles.alert} role="alert">{message}</div> : null}
        {!loading && !template ? <div className={styles.emptyState}>
          <Layers size={28} aria-hidden="true" />
          <h2>Choose your campaign</h2>
          <p>Select a template and add your postcode to continue.</p>
          <Link className={styles.editLink} href="/dashboard?panel=templates">Browse templates <ArrowRight size={16} aria-hidden="true" /></Link>
        </div> : null}
        {template ? <>
          <article className={styles.reviewSheet} aria-label="Campaign review">
            <div className={styles.campaignPreview}>
              <div className={styles.campaignIcon}><Layers size={28} strokeWidth={1.5} aria-hidden="true" /></div>
              <div className={styles.campaignHeading}>
                <p className={styles.eyebrow}>Your campaign</p>
                <h2>{templateName}</h2>
                <p className={styles.description}>{template.description}</p>
              </div>
            </div>
            <section className={styles.detailsSection} aria-labelledby="details-title">
              <div className={styles.sectionHeading}><h3 id="details-title">Campaign details</h3><Link className={styles.editLink} href="/dashboard?panel=templates&restoreIntent=1">Edit details <ArrowRight size={14} aria-hidden="true" /></Link></div>
              <dl className={styles.detailList}>
                <div className={styles.detailRow}><dt><BriefcaseBusiness size={18} aria-hidden="true" />Target role</dt><dd>{template.role}</dd></div>
                <div className={styles.detailRow}><dt><MapPin size={18} aria-hidden="true" />Location</dt><dd>{postcodeInfo.label}</dd></div>
              </dl>
              <p className={styles.locationNote}>Jobs and providers are matched to postcode {postcodeInfo.postcode}.</p>
            </section>
            {template.pricing_features?.length ? <details className={styles.featuresSection}>
              <summary><span>Included features <span className={styles.featureCount}>{template.pricing_features.length}</span></span><ChevronDown size={18} aria-hidden="true" /></summary>
              <ul className={styles.featuresList}>{template.pricing_features.map((feature, index) =>
                <li key={`${index}-${feature}`}><Check size={17} aria-hidden="true" /><span>{feature}</span></li>
              )}</ul>
            </details> : null}
            <section className={styles.priceSection} aria-label="Price summary">
              <div><h3>Template price</h3><p>{template.price_label}</p></div>
              <div className={styles.priceValue}>
                {template.compare_at_price_amount && template.compare_at_price_amount > template.price_amount ? <span className={styles.comparePrice}><span className={styles.srOnly}>Previously </span>{money(template.compare_at_price_amount, template.currency)}</span> : null}
                <strong>{money(template.price_amount, template.currency)}</strong><span className={styles.currency}>{template.currency.toUpperCase()}</span>
              </div>
            </section>
          </article>
          <div className={styles.nextStep}><LockKeyhole size={18} aria-hidden="true" /><div><strong>Next, secure checkout</strong><p>Continue to Stripe. Your campaign is created once checkout is confirmed.</p></div></div>
        </> : null}
        <footer className={styles.footer}>Need help? <Link href="/support">Contact support</Link></footer>
      </section>
      {template ? <div className={styles.paymentBar}>
        <div className={styles.paymentBarInner}>
          <div className={styles.barPrice}><span>Template price</span><div><strong>{money(template.price_amount, template.currency)}</strong><span>{template.currency.toUpperCase()}</span></div></div>
          <button type="button" className={styles.checkoutButton} onClick={() => void openSecureCheckout()} disabled={checkoutLoading || !postcodeInfo.valid} aria-busy={checkoutLoading}>
            <span>{checkoutLoading ? "Opening checkout..." : template.payment_required === false ? "Use free template" : "Continue to payment"}</span>
            {!checkoutLoading ? <ArrowRight size={18} aria-hidden="true" /> : null}
          </button>
        </div>
      </div> : null}
    </main>
  );
}

export default function PaymentPage() {
  return <Suspense fallback={<main className={styles.page}><div className={styles.shell}><p className={styles.loading} role="status">Loading checkout...</p></div></main>}><CheckoutContent /></Suspense>;
}
