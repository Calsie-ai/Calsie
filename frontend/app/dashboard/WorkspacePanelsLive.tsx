"use client";

import { useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "../../lib/supabaseClient";
import { normaliseAppError } from "../../lib/actionState";
import { inferAustralianPostcode, normaliseAustralianPostcode } from "../../lib/australianPostcode";
import { savePendingIntent, type PendingIntentV1 } from "../../lib/pendingIntent";
import OverviewDashboard from "./OverviewDashboard";
import ResumePreviewPanel from "./ResumePreviewPanel";
import WorkspacePanels from "./WorkspacePanels";
import { isCampaignRunning, type CampaignTemplate } from "./workspace-data";

type BaseProps = ComponentProps<typeof WorkspacePanels>;
type Props = BaseProps & {
  approvedCount: number;
  passedCount: number;
  purchasedTemplate?: CampaignTemplate | null;
  pendingIntent: PendingIntentV1 | null;
  userHint: string;
  onPendingIntentChange: (intent: PendingIntentV1 | null) => void;
  onPendingIntentRestored: (intentId: string) => void;
  onOpenTracker: () => void;
};

type Row = {
  id: string;
  slug: string;
  title: string;
  campaign_name: string;
  image_url: string | null;
  role: string;
  location: string;
  description: string;
  category: string;
  query_terms: string[];
  include_title_terms: string[];
  exclude_title_terms: string[];
  description_keywords: string[];
  job_types: string[];
  posted_within_days: number;
  price_amount: number;
  compare_at_price_amount: number | null;
  currency: string;
  price_label: string;
  pricing_features: string[];
  payment_required: boolean;
};

export function mapTemplate(row: Row): CampaignTemplate {
  return {
    id: row.id,
    slug: row.slug || undefined,
    title: row.title,
    campaignName: row.campaign_name || `${row.title} Campaign`,
    imageUrl: row.image_url,
    role: row.role,
    location: row.location,
    description: row.description,
    category: row.category,
    queryTerms: row.query_terms || [],
    includeTitleTerms: row.include_title_terms || [],
    excludeTitleTerms: row.exclude_title_terms || [],
    descriptionKeywords: row.description_keywords || [],
    jobTypes: row.job_types || [],
    postedWithinDays: row.posted_within_days || 30,
    priceAmount: row.price_amount || 0,
    compareAtPriceAmount: row.compare_at_price_amount,
    currency: row.currency || "aud",
    priceLabel: row.price_label || "one-time",
    pricingFeatures: row.pricing_features || [],
    paymentRequired: row.payment_required !== false,
  };
}

function formatMoney(amount: number, currency = "aud") {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: currency.toUpperCase(), maximumFractionDigits: amount % 100 === 0 ? 0 : 2 }).format(amount / 100);
}

export default function WorkspacePanelsLive(props: Props) {
  const router = useRouter();
  const [templates, setTemplates] = useState<CampaignTemplate[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<CampaignTemplate | null>(null);
  const [postcode, setPostcode] = useState("");
  const [postcodeTouched, setPostcodeTouched] = useState(false);
  const [checkoutNavigating, setCheckoutNavigating] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const intentIdRef = useRef("");
  const restoredIntentIdRef = useRef("");

  useEffect(() => {
    if (props.active !== "templates") return;
    const controller = new AbortController();
    setLoading(true);
    setError("");

    async function loadTemplates() {
      try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
          .from("campaign_templates")
          .select("id,slug,title,campaign_name,image_url,role,location,description,category,query_terms,include_title_terms,exclude_title_terms,description_keywords,job_types,posted_within_days,price_amount,compare_at_price_amount,currency,price_label,pricing_features,payment_required")
          .eq("is_active", true)
          .order("updated_at", { ascending: false })
          .abortSignal(controller.signal);
        if (error) throw error;
        if (!controller.signal.aborted) setTemplates(((data || []) as Row[]).map(mapTemplate));
      } catch (error) {
        if (!controller.signal.aborted) setError(normaliseAppError(error, "Could not load templates.") || "");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadTemplates();
    return () => controller.abort();
  }, [props.active]);

  useEffect(() => {
    intentIdRef.current = props.pendingIntent?.type === "purchase_template"
      ? props.pendingIntent.id
      : "";
    if (props.pendingIntent || !restoredIntentIdRef.current) return;
    restoredIntentIdRef.current = "";
    setSelected(null);
    setPostcode("");
    setPostcodeTouched(false);
    setCheckoutError("");
  }, [props.pendingIntent]);

  useEffect(() => {
    const intent = props.pendingIntent;
    if (
      props.active !== "templates"
      || intent?.type !== "purchase_template"
      || restoredIntentIdRef.current === intent.id
      || templates.length === 0
    ) return;

    const template = templates.find((item) => item.id === intent.templateId);
    if (!template) {
      setCheckoutError("The saved campaign template is no longer available. Your draft was kept so you can discard it or try again later.");
      return;
    }

    setSelected(template);
    setPostcode(intent.postcode || "");
    setPostcodeTouched(Boolean(intent.postcode));
    setCheckoutNavigating(false);
    setCheckoutError("");
    restoredIntentIdRef.current = intent.id;
    props.onPendingIntentRestored(intent.id);
  }, [props.active, props.onPendingIntentRestored, props.pendingIntent, templates]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return templates.filter((item) => !needle || `${item.title} ${item.campaignName} ${item.role} ${item.category} ${item.description}`.toLowerCase().includes(needle));
  }, [query, templates]);

  const postcodeInfo = useMemo(() => inferAustralianPostcode(postcode.trim()), [postcode]);

  function persistTemplateIntent(item: CampaignTemplate, nextPostcode: string) {
    const saved = savePendingIntent({
      id: intentIdRef.current || undefined,
      type: "purchase_template",
      returnPath: "/dashboard?panel=templates&restoreIntent=1",
      panel: "templates",
      templateId: item.id,
      templateSlug: item.slug,
      postcode: nextPostcode || undefined,
      currentStep: "review",
      intendedAction: "continue_to_checkout",
      userHint: props.userHint,
    });
    if (!saved) return null;
    intentIdRef.current = saved.id;
    props.onPendingIntentChange(saved);
    return saved;
  }

  function openTemplate(item: CampaignTemplate) {
    setSelected(item);
    setPostcode("");
    setPostcodeTouched(false);
    setCheckoutNavigating(false);
    setCheckoutError("");
    persistTemplateIntent(item, "");
  }

  function continueToCheckout() {
    setPostcodeTouched(true);
    setCheckoutError("");
    if (!selected) {
      setCheckoutError("Choose a campaign template before checkout.");
      return;
    }
    if (!postcodeInfo.valid) {
      setCheckoutError("Enter a valid 4-digit Australian postcode.");
      return;
    }
    if (checkoutNavigating) return;

    if (!persistTemplateIntent(selected, postcodeInfo.postcode)) {
      setCheckoutError("Could not safely save this campaign draft. Check browser storage permissions and try again.");
      return;
    }

    setCheckoutNavigating(true);
    router.push("/payment?restoreIntent=1");
  }

  if (props.active === "overview") {
    return <OverviewDashboard campaign={props.campaign} purchasedTemplate={props.purchasedTemplate} resumeReady={props.resumeReady} resumeName={props.resumeName} gmailReady={props.gmailReady} approvedCount={props.approvedCount} passedCount={props.passedCount} onOpenTracker={props.onOpenTracker} />;
  }

  if (props.active === "resume") {
    return <ResumePreviewPanel resumeReady={props.resumeReady} resumeName={props.resumeName} uploadState={props.actionStates.uploadResume} onResumeUpload={props.onResumeUpload} />;
  }

  if (props.active === "approve" || props.active === "tracker") {
    const approvalMode = props.active === "approve";
    const status = props.campaign?.status || "Not configured";
    const running = isCampaignRunning(status);
    const paused = status === "paused";
    const statusClass = running ? "is-running" : paused ? "is-paused" : "is-idle";
    const statusText = running ? "Campaign running" : paused ? "Paused" : status;

    return (
      <section className="workspace-tracker-section">
        <header className="workspace-tracker-heading">
          <div>
            <p>{approvalMode ? "Approval queue" : "Calsie tracker"}</p>
            {approvalMode ? <h1><span style={{ color: "#ff5f78" }}>SMASH</span> <span style={{ color: "#111" }}>OR PASS</span></h1> : <h1>Application tracker</h1>}
            <span>{approvalMode ? "Review matched jobs and choose Pass or Smash." : "Only jobs you Smash are added to this tracker."}</span>
          </div>
          <span className={`workspace-status-pill ${statusClass}`}><i /> {statusText}</span>
        </header>
        <div className="workspace-tracker-frame-wrap">
          <iframe className="workspace-tracker-frame" src={`/tracker?embedded=1&view=${approvalMode ? "review" : "tracker"}`} title={approvalMode ? "Applix job approval queue" : "Applix application tracker"} />
        </div>
      </section>
    );
  }

  if (props.active !== "templates") return <WorkspacePanels {...props} />;

  return (
    <section className={`template-browser-canva${selected ? " is-reviewing" : ""}`}>
      <header className="template-browser-head">
        <p>Templates</p>
        <h1>{selected ? "Template details" : "Browse templates"}</h1>
        <span>{selected ? "Review the campaign, choose your postcode, and confirm the price before checkout." : "Login and browsing are free. Pricing appears only after you choose a template."}</span>
      </header>

      {selected ? (
        <div className="template-review-canva">
          <button type="button" className="template-review-back" onClick={() => setSelected(null)}>← Back to templates</button>
          <div className="template-review-hero">
            <div className="template-review-copy">
              <p className="template-category">{selected.category}</p>
              <h2>{selected.title}</h2>
              <p className="template-review-description">{selected.description}</p>
              <div className="template-review-usage"><strong>Ready-made campaign</strong><span>{selected.campaignName || selected.title}</span></div>
            </div>
            {selected.imageUrl ? <img src={selected.imageUrl} alt={selected.title} /> : <div className="template-review-image-placeholder">Add a template photo from Admin</div>}
          </div>
          <section className="template-recipe-card">
            <div><span>Search recipe</span><strong>Every Day Job Portal Search</strong></div>
            <div><span>Target role</span><strong>{selected.role}</strong></div>
            <div><span>Location</span><strong>{postcodeInfo.valid ? postcodeInfo.label : "Choose postcode below"}</strong></div>
            <div><span>Posted within</span><strong>{selected.postedWithinDays} days</strong></div>
          </section>
          <section style={{ border: "1px solid #ddd", padding: 18, marginTop: 18 }}>
            <h3 style={{ marginTop: 0 }}>Choose campaign location</h3>
            <label htmlFor="campaign-postcode" style={{ display: "grid", gap: 7, maxWidth: 420 }}>
              <strong>Australian postcode</strong>
              <input
                id="campaign-postcode"
                inputMode="numeric"
                autoComplete="postal-code"
                maxLength={4}
                value={postcode}
                onBlur={() => setPostcodeTouched(true)}
                onChange={(event) => {
                  const nextPostcode = normaliseAustralianPostcode(event.target.value.trim());
                  setPostcode(nextPostcode);
                  setCheckoutError("");
                  persistTemplateIntent(selected, nextPostcode);
                }}
                placeholder="Example: 2141"
                aria-invalid={postcodeTouched && !postcodeInfo.valid}
                aria-describedby="campaign-postcode-message"
                style={{ minHeight: 48, border: "1px solid #bbb", padding: "0 14px", fontSize: 16, fontWeight: 800 }}
              />
            </label>
            <div id="campaign-postcode-message" aria-live="polite">
              {postcodeTouched && !postcodeInfo.valid ? <p style={{ color: "#a12a38", fontWeight: 800, marginBottom: 0 }}>Enter a valid 4-digit Australian postcode.</p> : null}
              {postcodeInfo.valid ? <p style={{ color: "#226d35", fontWeight: 900, marginBottom: 0 }}>Detected location: {postcodeInfo.label}</p> : null}
            </div>
            <p style={{ color: "#666", lineHeight: 1.5, marginBottom: 0 }}>Your postcode will be used to rank nearby jobs and providers that service your area.</p>
          </section>
          <section style={{ border: "1px solid #ddd", padding: 18, marginTop: 18 }}>
            <h3 style={{ marginTop: 0 }}>Included with this template</h3>
            <div style={{ display: "grid", gap: 9 }}>
              {(selected.pricingFeatures || []).map((feature) => <div key={feature}>✓ {feature}</div>)}
            </div>
          </section>
          {checkoutError ? <div className="workspace-message" role="alert" style={{ marginTop: 16 }}>{checkoutError}</div> : null}
          <div className="template-review-checkout">
            <div><span>Campaign template</span><strong>{selected.campaignName || selected.title}</strong><small>{postcodeInfo.valid ? postcodeInfo.label : "Enter postcode to continue"}</small></div>
            <section aria-label="Template price" style={{ display: "flex", alignItems: "center", justifyContent: "center", flexWrap: "wrap", gap: 12, marginLeft: "auto", whiteSpace: "nowrap" }}>
              {selected.compareAtPriceAmount ? <div style={{ color: "#ff3f4f", fontSize: 24, fontWeight: 900, textDecoration: "line-through" }}>{formatMoney(selected.compareAtPriceAmount, selected.currency)}</div> : null}
              <div style={{ color: "#2f8f2f", fontSize: 30, fontWeight: 950 }}>{formatMoney(selected.priceAmount || 0, selected.currency)}</div>
              <div style={{ color: "#555", fontSize: 14, fontWeight: 700 }}>{selected.priceLabel}</div>
            </section>
            <button type="button" className="workspace-primary" onClick={continueToCheckout} disabled={!postcodeInfo.valid || checkoutNavigating} style={{ position: "relative", zIndex: 2, pointerEvents: checkoutNavigating ? "none" : "auto" }}>
              {checkoutNavigating ? "Opening checkout…" : selected.paymentRequired === false ? "Use free template" : "Continue to checkout"}
            </button>
          </div>
        </div>
      ) : (
        <>
          <label className="template-search-label" htmlFor="template-search">Search templates or job roles</label>
          <input id="template-search" className="workspace-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search templates or job roles" />
          {loading && <div className="workspace-message" role="status" aria-live="polite">Loading templates…</div>}
          {error && <div className="workspace-message" role="alert">{error}</div>}
          <div className="template-canva-grid">
            {visible.map((item) => (
              <article className="template-canva-card" key={item.id}>
                <span className="template-category">{item.category}</span><h3>{item.title}</h3>
                {item.imageUrl ? <img className="template-canva-image" src={item.imageUrl} alt={item.title} /> : <div className="template-canva-image template-canva-placeholder">Add a photo from Admin</div>}
                <p>{item.description}</p><small>{item.role} · Choose postcode</small>
                <button type="button" onClick={() => openTemplate(item)}>Review template →</button>
              </article>
            ))}
          </div>
          {!loading && !error && visible.length === 0 && <div className="workspace-message">No active templates match this search.</div>}
        </>
      )}
    </section>
  );
}
