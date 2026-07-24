"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseClient } from "../../lib/supabaseClient";
import { inferAustralianPostcode } from "../../lib/australianPostcode";

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

function money(amount: number, currency = "aud") {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: currency.toUpperCase(), maximumFractionDigits: amount % 100 === 0 ? 0 : 2 }).format(amount / 100);
}

function CheckoutContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const templateId = searchParams.get("template") || "";
  const postcode = searchParams.get("postcode") || "";
  const postcodeInfo = inferAustralianPostcode(postcode);
  const [template, setTemplate] = useState<TemplateCheckout | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => { void load(); }, [templateId, postcode]);

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

  return (
    <main className="applix-landing" id="top">
      <header className="applix-header">
        <div className="applix-container applix-header-inner">
          <a className="applix-brand" href="/" aria-label="Calsie Jobs home"><img src="/applix-logo.svg" alt="" /><span>Calsie | Jobs</span></a>
          <nav className="applix-nav" aria-label="Checkout navigation"><a href="/dashboard">Dashboard</a><a href="/support">Support</a></nav>
          <div className="applix-actions"><a className="applix-button applix-button--subtle" href="/dashboard">Back to templates</a></div>
        </div>
      </header>

      <section style={{ padding: "72px 20px 88px" }} aria-labelledby="payment-title">
        <div className="applix-container" style={{ maxWidth: 980 }}>
          {loading ? <p>Loading template checkout...</p> : null}
          {message ? <div style={{ padding: 16, border: "1px solid #ff9ca5", background: "#fff0f2", fontWeight: 800 }}>{message}</div> : null}
          {template ? (
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.2fr) minmax(300px,.8fr)", gap: 24, alignItems: "start" }}>
              <article style={{ border: "1px solid #ddd", background: "#fff", padding: 30 }}>
                <p className="applix-eyebrow">Selected campaign template</p>
                <h1 id="payment-title" style={{ margin: "8px 0 14px" }}>{template.campaign_name || template.title}</h1>
                <p style={{ color: "#555", lineHeight: 1.7 }}>{template.description}</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 12, margin: "24px 0" }}>
                  <div><span style={{ color: "#777" }}>Target role</span><br /><strong>{template.role}</strong></div>
                  <div><span style={{ color: "#777" }}>Campaign location</span><br /><strong>{postcodeInfo.label}</strong></div>
                </div>
                <div style={{ border: "1px solid #a8d8b4", background: "#f1fbf4", padding: 16, marginBottom: 24 }}>
                  <strong>Smart local matching enabled</strong>
                  <p style={{ margin: "7px 0 0", lineHeight: 1.6 }}>Calsie will use postcode {postcodeInfo.postcode} to rank nearby jobs and providers whose service-postcode coverage includes your area.</p>
                </div>
                <h2>Included features</h2>
                <div style={{ display: "grid", gap: 12 }}>
                  {(template.pricing_features || []).map((feature) => <div key={feature}>✓ {feature}</div>)}
                </div>
              </article>

              <aside style={{ border: "1px solid #111", background: "#111", color: "#fff", padding: 28, position: "sticky", top: 24 }}>
                <p style={{ margin: 0, opacity: .7 }}>Template price</p>
                <div style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: 10, margin: "16px 0" }}>
                  {template.compare_at_price_amount ? <span style={{ textDecoration: "line-through", color: "#ff8b95", fontSize: 24 }}>{money(template.compare_at_price_amount, template.currency)}</span> : null}
                  <strong style={{ fontSize: 54 }}>{money(template.price_amount, template.currency)}</strong>
                </div>
                <p style={{ opacity: .75 }}>{template.price_label}</p>
                <p style={{ lineHeight: 1.6 }}>Login and browsing were free. Payment is requested only for this selected campaign template.</p>
                <button type="button" disabled style={{ width: "100%", minHeight: 52, marginTop: 18, background: "#fff", color: "#111", border: 0, fontWeight: 900, opacity: .7 }}>
                  Secure payment coming next
                </button>
                <small style={{ display: "block", marginTop: 12, opacity: .65 }}>No charge is taken yet. Stripe checkout is not connected in this branch.</small>
              </aside>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}

export default function PaymentPage() {
  return <Suspense fallback={<main style={{ padding: 40 }}>Loading checkout...</main>}><CheckoutContent /></Suspense>;
}
