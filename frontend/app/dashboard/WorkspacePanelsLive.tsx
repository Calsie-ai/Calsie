"use client";

import { useEffect, useMemo, useState, type ComponentProps } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "../../lib/supabaseClient";
import OverviewDashboard from "./OverviewDashboard";
import ResumePreviewPanel from "./ResumePreviewPanel";
import WorkspacePanels from "./WorkspacePanels";
import { isCampaignRunning, type CampaignTemplate } from "./workspace-data";

type BaseProps = ComponentProps<typeof WorkspacePanels>;
type Props = BaseProps & { approvedCount: number; passedCount: number; purchasedTemplate?: CampaignTemplate | null; onOpenTracker: () => void };

type Row = {
  id: string;
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (props.active !== "templates") return;
    let alive = true;
    setLoading(true);
    setError("");
    const supabase = getSupabaseClient();
    void supabase
      .from("campaign_templates")
      .select("id,title,campaign_name,image_url,role,location,description,category,query_terms,include_title_terms,exclude_title_terms,description_keywords,job_types,posted_within_days,price_amount,compare_at_price_amount,currency,price_label,pricing_features,payment_required")
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) setError(error.message);
        else setTemplates(((data || []) as Row[]).map(mapTemplate));
        setLoading(false);
      });
    return () => { alive = false; };
  }, [props.active]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return templates.filter((item) => !needle || `${item.title} ${item.campaignName} ${item.role} ${item.category} ${item.description}`.toLowerCase().includes(needle));
  }, [query, templates]);

  if (props.active === "overview") {
    return <OverviewDashboard campaign={props.campaign} purchasedTemplate={props.purchasedTemplate} resumeReady={props.resumeReady} resumeName={props.resumeName} gmailReady={props.gmailReady} approvedCount={props.approvedCount} passedCount={props.passedCount} onOpenTracker={props.onOpenTracker} />;
  }

  if (props.active === "resume") {
    return <ResumePreviewPanel resumeReady={props.resumeReady} resumeName={props.resumeName} busy={props.busy} onResumeUpload={props.onResumeUpload} />;
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
        <span>{selected ? "Review the campaign, price, and included features before checkout." : "Login and browsing are free. Pricing appears only after you choose a template."}</span>
      </header>

      {selected ? (
        <div className="template-review-canva">
          <button className="template-review-back" onClick={() => setSelected(null)}>← Back to templates</button>
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
            <div><span>Location</span><strong>{selected.location}</strong></div>
            <div><span>Posted within</span><strong>{selected.postedWithinDays} days</strong></div>
          </section>
          <section style={{ border: "1px solid #ddd", padding: 18, marginTop: 18 }}>
            <h3 style={{ marginTop: 0 }}>Included with this template</h3>
            <div style={{ display: "grid", gap: 9 }}>
              {(selected.pricingFeatures || []).map((feature) => <div key={feature}>✓ {feature}</div>)}
            </div>
          </section>
          <div className="template-review-checkout">
            <div><span>Campaign template</span><strong>{selected.campaignName || selected.title}</strong><small>Login and template browsing are free.</small></div>
            <section aria-label="Template price" style={{ display: "flex", alignItems: "center", justifyContent: "center", flexWrap: "wrap", gap: 12, marginLeft: "auto", whiteSpace: "nowrap" }}>
              {selected.compareAtPriceAmount ? <div style={{ color: "#ff3f4f", fontSize: 24, fontWeight: 900, textDecoration: "line-through" }}>{formatMoney(selected.compareAtPriceAmount, selected.currency)}</div> : null}
              <div style={{ color: "#2f8f2f", fontSize: 30, fontWeight: 950 }}>{formatMoney(selected.priceAmount || 0, selected.currency)}</div>
              <div style={{ color: "#555", fontSize: 14, fontWeight: 700 }}>{selected.priceLabel}</div>
            </section>
            <button className="workspace-primary" onClick={() => router.push(`/payment?template=${encodeURIComponent(selected.id)}`)}>{selected.paymentRequired === false ? "Use free template" : "Continue to checkout"}</button>
          </div>
        </div>
      ) : (
        <>
          <label className="template-search-label" htmlFor="template-search">Search templates or job roles</label>
          <input id="template-search" className="workspace-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search templates or job roles" />
          {loading && <div className="workspace-message">Loading templates...</div>}
          {error && <div className="workspace-message">Could not load templates: {error}</div>}
          <div className="template-canva-grid">
            {visible.map((item) => (
              <article className="template-canva-card" key={item.id}>
                <span className="template-category">{item.category}</span><h3>{item.title}</h3>
                {item.imageUrl ? <img className="template-canva-image" src={item.imageUrl} alt={item.title} /> : <div className="template-canva-image template-canva-placeholder">Add a photo from Admin</div>}
                <p>{item.description}</p><small>{item.role} · {item.location}</small>
                <button type="button" onClick={() => setSelected(item)}>Review template →</button>
              </article>
            ))}
          </div>
          {!loading && !error && visible.length === 0 && <div className="workspace-message">No active templates match this search.</div>}
        </>
      )}
    </section>
  );
}
