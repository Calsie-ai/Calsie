"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "../../../lib/supabaseClient";

type TemplatePricing = {
  id: string;
  title: string;
  campaign_name: string;
  slug: string;
  price_amount: number;
  compare_at_price_amount: number | null;
  currency: string;
  price_label: string;
  pricing_features: string[];
  payment_required: boolean;
  is_active: boolean;
};

function dollarsToCents(value: string) {
  const amount = Number(value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(amount) ? Math.max(0, Math.round(amount * 100)) : 0;
}

function centsToDollars(value: number | null) {
  return value == null ? "" : (value / 100).toFixed(2);
}

export default function AdminPricingPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<TemplatePricing[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [price, setPrice] = useState("");
  const [comparePrice, setComparePrice] = useState("");
  const [currency, setCurrency] = useState("aud");
  const [priceLabel, setPriceLabel] = useState("one-time");
  const [features, setFeatures] = useState("");
  const [paymentRequired, setPaymentRequired] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const selected = useMemo(() => templates.find((item) => item.id === selectedId) || null, [selectedId, templates]);

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    if (!selected) return;
    setPrice(centsToDollars(selected.price_amount));
    setComparePrice(centsToDollars(selected.compare_at_price_amount));
    setCurrency(selected.currency || "aud");
    setPriceLabel(selected.price_label || "one-time");
    setFeatures((selected.pricing_features || []).join("\n"));
    setPaymentRequired(selected.payment_required !== false);
  }, [selected]);

  async function load() {
    setLoading(true);
    setMessage("");
    try {
      const supabase = getSupabaseClient();
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) { router.replace("/login?next=/admin/pricing"); return; }

      const { data: admin, error: adminError } = await supabase
        .from("applix_admin_users")
        .select("user_id")
        .eq("user_id", authData.user.id)
        .maybeSingle();
      if (adminError) throw adminError;
      if (!admin) { router.replace("/dashboard"); return; }

      const { data, error } = await supabase
        .from("campaign_templates")
        .select("id,title,campaign_name,slug,price_amount,compare_at_price_amount,currency,price_label,pricing_features,payment_required,is_active")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      const rows = (data || []) as TemplatePricing[];
      setTemplates(rows);
      setSelectedId((current) => current || rows[0]?.id || "");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load pricing editor.");
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!selected) return;
    setSaving(true);
    setMessage("");
    try {
      const supabase = getSupabaseClient();
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) throw new Error("Please sign in again.");

      const pricingFeatures = features.split("\n").map((item) => item.trim()).filter(Boolean);
      const { error } = await supabase
        .from("campaign_templates")
        .update({
          price_amount: dollarsToCents(price),
          compare_at_price_amount: comparePrice.trim() ? dollarsToCents(comparePrice) : null,
          currency: currency.trim().toLowerCase() || "aud",
          price_label: priceLabel.trim() || "one-time",
          pricing_features: pricingFeatures,
          payment_required: paymentRequired,
          updated_by: authData.user.id,
        })
        .eq("id", selected.id);
      if (error) throw error;
      setMessage("Pricing updated successfully.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update pricing.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <main style={styles.shell}>Loading pricing editor...</main>;

  return (
    <main style={styles.shell}>
      <header style={styles.header}>
        <div>
          <p style={styles.eyebrow}>Calsie administration</p>
          <h1 style={styles.title}>Pricing & feature editor</h1>
          <p style={styles.subtitle}>Login and template browsing remain free. Pricing appears only after a user reviews a template.</p>
        </div>
      </header>

      {message ? <div style={styles.message}>{message}</div> : null}

      <section style={styles.grid}>
        <aside style={styles.panel}>
          <h2>Templates</h2>
          <div style={styles.templateList}>
            {templates.map((item) => (
              <button type="button" key={item.id} onClick={() => setSelectedId(item.id)} style={item.id === selectedId ? styles.activeTemplate : styles.templateButton}>
                <strong>{item.title}</strong>
                <span>{item.is_active ? "Active" : "Paused"}</span>
              </button>
            ))}
          </div>
        </aside>

        <section style={styles.panel}>
          {selected ? (
            <>
              <p style={styles.eyebrow}>Editing</p>
              <h2>{selected.campaign_name || selected.title}</h2>
              <div style={styles.formGrid}>
                <label style={styles.field}>Current price (AUD)<input type="number" min="0" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} /></label>
                <label style={styles.field}>Compare-at price (optional)<input type="number" min="0" step="0.01" value={comparePrice} onChange={(event) => setComparePrice(event.target.value)} /></label>
                <label style={styles.field}>Currency<input maxLength={3} value={currency} onChange={(event) => setCurrency(event.target.value)} /></label>
                <label style={styles.field}>Price label<input value={priceLabel} onChange={(event) => setPriceLabel(event.target.value)} placeholder="one-time" /></label>
              </div>
              <label style={styles.field}>Included features, one per line<textarea rows={10} value={features} onChange={(event) => setFeatures(event.target.value)} /></label>
              <label style={styles.checkbox}><input type="checkbox" checked={paymentRequired} onChange={(event) => setPaymentRequired(event.target.checked)} /> Require payment before campaign creation</label>
              <button type="button" style={styles.primary} disabled={saving} onClick={() => void save()}>{saving ? "Saving..." : "Save pricing"}</button>
            </>
          ) : <p>No templates available.</p>}
        </section>
      </section>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  shell: { minHeight: "100vh", padding: 28, background: "#fffafa", color: "#111", fontFamily: "Arial, Helvetica, sans-serif" },
  header: { maxWidth: 1200, margin: "0 auto 22px" },
  eyebrow: { margin: "0 0 8px", color: "#ff5757", fontSize: 11, fontWeight: 900, letterSpacing: ".14em", textTransform: "uppercase" },
  title: { margin: 0, fontSize: "clamp(34px,5vw,62px)", letterSpacing: "-.05em" },
  subtitle: { color: "#666", maxWidth: 760 },
  message: { maxWidth: 1200, margin: "0 auto 18px", padding: 12, border: "1px solid #ff9ca5", background: "#fff0f2", fontWeight: 800 },
  grid: { maxWidth: 1200, margin: "0 auto", display: "grid", gridTemplateColumns: "minmax(260px,.6fr) minmax(0,1.4fr)", gap: 20 },
  panel: { border: "1px solid #111", background: "#fff", padding: 22 },
  templateList: { display: "grid", gap: 9 },
  templateButton: { display: "grid", gap: 4, textAlign: "left", border: "1px solid #ddd", background: "#fff", padding: 12, cursor: "pointer" },
  activeTemplate: { display: "grid", gap: 4, textAlign: "left", border: "1px solid #111", background: "#ffebed", padding: 12, cursor: "pointer" },
  formGrid: { display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 14 },
  field: { display: "grid", gap: 7, marginBottom: 14, fontSize: 12, fontWeight: 900 },
  checkbox: { display: "flex", alignItems: "center", gap: 8, margin: "16px 0", fontWeight: 900 },
  primary: { border: "1px solid #111", background: "#ff7182", padding: "12px 16px", fontWeight: 900, cursor: "pointer" },
};
