"use client";

import { useEffect, useMemo, useState, type ComponentProps } from "react";
import { getSupabaseClient } from "../../lib/supabaseClient";
import WorkspacePanels from "./WorkspacePanels";
import type { CampaignTemplate } from "./workspace-data";

type Props = ComponentProps<typeof WorkspacePanels>;
type Row = {
  id: string; title: string; role: string; location: string; description: string; category: string;
  query_terms: string[]; include_title_terms: string[]; exclude_title_terms: string[];
  description_keywords: string[]; job_types: string[]; posted_within_days: number;
};

function mapTemplate(row: Row): CampaignTemplate {
  return {
    id: row.id,
    title: row.title,
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
      .select("id,title,role,location,description,category,query_terms,include_title_terms,exclude_title_terms,description_keywords,job_types,posted_within_days")
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
    return templates.filter((item) => !needle || `${item.title} ${item.role} ${item.category} ${item.description}`.toLowerCase().includes(needle));
  }, [query, templates]);

  if (props.active !== "templates") return <WorkspacePanels {...props} />;

  return (
    <section>
      <header>
        <p>Templates</p>
        <h1>Browse templates</h1>
        <span>Choose a campaign template created in the Applix admin panel.</span>
      </header>

      {selected ? (
        <div className="workspace-template-review">
          <div className="workspace-template-review-heading">
            <div><small>{selected.category}</small><h2>{selected.title}</h2><p>{selected.description}</p></div>
            <button className="workspace-secondary" onClick={() => setSelected(null)}>Back to templates</button>
          </div>
          <div className="workspace-template-review-summary">
            <strong>Search recipe</strong>
            <span>{selected.queryTerms.length} search phrases</span>
            <span>{selected.includeTitleTerms.length} accepted title rules</span>
            <span>{selected.excludeTitleTerms.length} blocked title rules</span>
            <span>Jobs from the last {selected.postedWithinDays} days</span>
          </div>
          <div className="workspace-actions">
            <button className="workspace-primary" disabled={props.busy} onClick={() => props.onUseTemplate(selected)}>
              {props.busy ? "Adding template..." : "Use this template"}
            </button>
          </div>
        </div>
      ) : (
        <>
          <input className="workspace-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search templates or job roles" />
          {loading && <div className="workspace-message">Loading templates...</div>}
          {error && <div className="workspace-message">Could not load templates: {error}</div>}
          <div className="workspace-template-grid">
            {visible.map((item) => (
              <article key={item.id}>
                <small>{item.category}</small>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
                <button type="button" onClick={() => setSelected(item)}>Review template</button>
              </article>
            ))}
          </div>
          {!loading && !error && visible.length === 0 && <div className="workspace-message">No active templates match this search.</div>}
        </>
      )}
    </section>
  );
}
