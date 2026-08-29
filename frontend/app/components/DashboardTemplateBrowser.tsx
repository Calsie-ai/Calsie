"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { getSupabaseClient } from "../../lib/supabaseClient";

const templates = [
  { id: "support-worker", title: "Support Worker / NDIS", role: "Support Worker", location: "Sydney NSW", description: "Disability support, community access, and NDIS roles." },
  { id: "social-work", title: "Social Work / Mental Health", role: "Mental Health Social Worker", location: "Sydney NSW", description: "Social work, case management, hospital, and mental health roles." },
  { id: "business-analyst", title: "Business Analyst", role: "Business Analyst", location: "Sydney NSW", description: "Requirements, reporting, process, and stakeholder-focused roles." },
  { id: "it-support", title: "IT Support", role: "IT Support", location: "Sydney NSW", description: "Service desk, help desk, and junior technical support roles." },
];

export default function DashboardTemplateBrowser() {
  const pathname = usePathname();
  const [mountNode, setMountNode] = useState<Element | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (pathname !== "/dashboard") {
      setMountNode(null);
      return;
    }

    const findMount = () => {
      const target = document.querySelector(".dashboard-stack");
      if (target) setMountNode(target);
    };

    findMount();
    const timer = window.setTimeout(findMount, 250);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return templates;
    return templates.filter((item) => `${item.title} ${item.role} ${item.description}`.toLowerCase().includes(value));
  }, [query]);

  async function useTemplate(template: (typeof templates)[number]) {
    setBusyId(template.id);
    setMessage("");

    try {
      const supabase = getSupabaseClient();
      const { data, error: userError } = await supabase.auth.getUser();
      if (userError || !data.user) throw new Error("Please sign in again.");

      const { error } = await supabase.from("campaigns").insert({
        user_id: data.user.id,
        name: `${template.title} Campaign`,
        location: template.location,
        target_business_type: template.role,
        search: {
          target_role: template.role,
          target_location: template.location,
          fetch_frequency: "daily",
          campaign_days: 30,
          daily_job_limit: 24,
          template_id: template.id,
        },
        filters: { location: template.location },
        outreach: {
          scheduled: true,
          active: true,
          campaign_days: 30,
          daily_job_limit: 24,
          daily_email_limit: 24,
          hourly_email_limit: 1,
          total_cap: 720,
          require_email: true,
          require_user_approval: true,
          approval_mode: "Ask me before applying",
          test_mode: false,
          gmail_consent_required: true,
        },
        status: "draft",
      });

      if (error) throw error;
      setMessage(`${template.title} template added. Refreshing dashboard...`);
      window.setTimeout(() => window.location.reload(), 500);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not use template.");
    } finally {
      setBusyId("");
    }
  }

  if (!mountNode) return null;

  return createPortal(
    <section className="dashboard-template-browser">
      <div className="dashboard-template-heading">
        <div>
          <span>TEMPLATES</span>
          <h2>Browse templates</h2>
          <p>Search and use a ready-made campaign without leaving this dashboard.</p>
        </div>
        <button type="button" onClick={() => setOpen((value) => !value)}>{open ? "Close" : "Browse templates"}</button>
      </div>

      {open && (
        <div className="dashboard-template-panel">
          <div className="dashboard-template-search-row">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search templates or job roles" aria-label="Search campaign templates" />
            <span>{filtered.length} templates</span>
          </div>
          <div className="dashboard-template-grid">
            {filtered.map((template, index) => (
              <article key={template.id}>
                <div className={`dashboard-template-visual visual-${index + 1}`}><span>{template.title}</span></div>
                <small>0{index + 1} · {template.role}</small>
                <h3>{template.title}</h3>
                <p>{template.description}</p>
                <button type="button" disabled={Boolean(busyId)} onClick={() => void useTemplate(template)}>{busyId === template.id ? "Adding..." : "Use template →"}</button>
              </article>
            ))}
          </div>
          {!filtered.length && <p className="dashboard-template-empty">No templates match your search.</p>}
        </div>
      )}

      {message && <p className="dashboard-template-message">{message}</p>}
    </section>,
    mountNode,
  );
}
