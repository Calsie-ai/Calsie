"use client";

import { useEffect, useMemo, useState, type ComponentProps } from "react";
import { getSupabaseClient } from "../../lib/supabaseClient";
import OverviewDashboard from "./OverviewDashboard";
import WorkspacePanels from "./WorkspacePanels";
import type { CampaignTemplate } from "./workspace-data";

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
  };
}

export default function WorkspacePanelsLive(props: Props) {
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
      .select("id,title,campaign_name,image_url,role,location,description,category,query_terms,include_title_terms,exclude_title_terms,description_keywords,job_types,posted_within_days")
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

  if (props.active !== "templates") return <WorkspacePanels {...props} />;

  return (
    <section className={`template-browser-canva${selected ? " is-reviewing" : ""}`}>
      <header className="template-browser-head">
        <p>Templates</p>
        <h1>{selected ? "Template details" : "Browse templates"}</h1>
        <span>{selected ? "Review the campaign recipe before continuing." : "Choose a ready-made campaign template. You can review it before adding it."}</span>
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
          <div className="template-review-checkout">
            <div><span>Campaign template</span><strong>{selected.campaignName || selected.title}</strong><small>Login and template browsing are free.</small></div>
            <button className="workspace-primary" disabled={props.busy} onClick={() => props.onUseTemplate(selected)}>{props.busy ? "Preparing campaign..." : "Use this template"}</button>
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
