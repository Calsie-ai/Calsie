"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "../../lib/supabaseClient";
import { getCockpitOverview, listCockpitRows, type CockpitOverview } from "../../lib/applixCockpit";

type PanelConfig = {
  title: string;
  description: string;
  table: string;
  columns: string[];
};

const ownerEmails = ["sajan3310giri@gmail.com", "hostsajan@gmail.com"];

const panels: Record<string, PanelConfig> = {
  campaigns: {
    title: "Campaigns",
    description: "Campaign setup, current status, scrape timing, and outreach timing.",
    table: "campaigns",
    columns: ["name", "location", "target_business_type", "status", "last_scraped_at", "last_outreach_at", "created_at"],
  },
  leads: {
    title: "Campaign Leads",
    description: "Lead records, matching fields, lead score, and lead status.",
    table: "campaign_leads",
    columns: ["company_name", "job_title", "location", "email_status", "lead_status", "lead_score", "created_at"],
  },
  contacts: {
    title: "Contact Records",
    description: "Saved contact records and source/status information.",
    table: "lead_contact_emails",
    columns: ["company_name", "company_website", "source", "confidence", "status", "reuse_count", "created_at"],
  },
  queue: {
    title: "Queue",
    description: "Queued outreach records, review state, attempts, and last error.",
    table: "outreach_queue",
    columns: ["recipient_company", "subject", "status", "review_status", "send_attempts", "last_error", "created_at"],
  },
  drafts: {
    title: "AI Drafts",
    description: "AI personalization rows and approval state.",
    table: "campaign_lead_personalizations",
    columns: ["email_subject", "status", "campaign_id", "campaign_lead_id", "contact_email_id", "created_at"],
  },
  logs: {
    title: "Logs",
    description: "Workflow logs for debugging and audit history.",
    table: "applix_logs",
    columns: ["workflow", "task", "status", "message", "error_message", "created_at"],
  },
};

function display(value: unknown, max = 90) {
  if (value === null || value === undefined) return "-";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function Pill({ value }: { value: unknown }) {
  const label = String(value || "unknown");
  const lower = label.toLowerCase();
  const background = lower.includes("fail") || lower.includes("error") || lower.includes("invalid")
    ? "#3b1018"
    : lower.includes("active") || lower.includes("approved") || lower.includes("sent") || lower.includes("success")
      ? "#12331f"
      : lower.includes("pause") || lower.includes("draft") || lower.includes("pending")
        ? "#3a2c10"
        : "rgba(255,255,255,.08)";

  return (
    <span style={{ border: "1px solid rgba(255,255,255,.14)", borderRadius: 999, padding: "4px 8px", background, color: "#f7f7fb", fontSize: 12 }}>
      {label}
    </span>
  );
}

function OverviewPanel() {
  const [overview, setOverview] = useState<CockpitOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      setOverview(await getCockpitOverview());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load cockpit overview.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const cards = useMemo(() => [
    ["Campaigns", overview?.campaigns],
    ["Campaign Leads", overview?.campaignLeads],
    ["Saved Contacts", overview?.savedContacts],
    ["Queue Rows", overview?.queueRows],
    ["Failed Queue", overview?.failedQueue],
    ["AI Drafts", overview?.aiDrafts],
    ["Jobs", overview?.jobs],
    ["Applications", overview?.applications],
    ["Resume Versions", overview?.resumeVersions],
    ["Pending Tasks", overview?.pendingTasks],
    ["Logs", overview?.logs],
  ], [overview]);

  return (
    <section>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0 }}>Overview</h2>
          <p style={{ margin: "6px 0 0", color: "#a7a7b7" }}>Live database counts from Supabase.</p>
        </div>
        <button className="cockpit-button" onClick={load} disabled={loading}>{loading ? "Refreshing..." : "Refresh"}</button>
      </div>
      {error && <p className="cockpit-error">{error}</p>}
      <div className="cockpit-grid">
        {cards.map(([label, value]) => (
          <div className="cockpit-card" key={String(label)}>
            <p>{label}</p>
            <strong>{loading ? "..." : value ?? 0}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function DataPanel({ config }: { config: PanelConfig }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      setRows(await listCockpitRows(config.table, 100));
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not load ${config.title}.`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [config.table]);

  return (
    <section>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0 }}>{config.title}</h2>
          <p style={{ margin: "6px 0 0", color: "#a7a7b7" }}>{config.description}</p>
        </div>
        <button className="cockpit-button" onClick={load} disabled={loading}>{loading ? "Refreshing..." : "Refresh"}</button>
      </div>
      {error && <p className="cockpit-error">{error}</p>}
      <div className="cockpit-table-wrap">
        <table className="cockpit-table">
          <thead>
            <tr>
              {config.columns.map((column) => <th key={column}>{column}</th>)}
              <th>Raw</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={config.columns.length + 1}>Loading...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={config.columns.length + 1}>No rows found.</td></tr>
            ) : rows.map((row) => (
              <tr key={row.id || JSON.stringify(row).slice(0, 24)}>
                {config.columns.map((column) => (
                  <td key={column}>{column.includes("status") ? <Pill value={row[column]} /> : display(row[column])}</td>
                ))}
                <td>
                  <button className="cockpit-small-button" onClick={() => setExpanded(expanded === row.id ? null : row.id)}>
                    {expanded === row.id ? "Hide" : "View"}
                  </button>
                  {expanded === row.id && <pre className="cockpit-raw">{JSON.stringify(row, null, 2)}</pre>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function DevCockpitPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [email, setEmail] = useState("");

  useEffect(() => {
    async function checkAccess() {
      try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase.auth.getUser();
        if (error || !data.user) {
          router.replace("/");
          return;
        }

        const userEmail = (data.user.email || "").toLowerCase();
        setEmail(userEmail);

        if (!ownerEmails.includes(userEmail)) {
          router.replace("/dashboard");
          return;
        }

        setAllowed(true);
      } catch {
        router.replace("/");
      } finally {
        setLoading(false);
      }
    }

    checkAccess();
  }, [router]);

  if (loading) {
    return <main className="cockpit-shell"><p>Checking cockpit access...</p></main>;
  }

  if (!allowed) return null;

  return (
    <main className="cockpit-shell">
      <style jsx global>{`
        body { margin: 0; background: #080912; color: #f7f7fb; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
        .cockpit-shell { min-height: 100vh; padding: 32px; background: radial-gradient(circle at top left, rgba(255, 127, 168, .16), transparent 32%), #080912; }
        .cockpit-header { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-bottom: 28px; }
        .cockpit-header h1 { margin: 0; font-size: clamp(30px, 5vw, 54px); letter-spacing: -0.04em; }
        .cockpit-header p { margin: 8px 0 0; color: #a7a7b7; max-width: 780px; }
        .cockpit-back { color: #f7f7fb; text-decoration: none; border: 1px solid rgba(255,255,255,.16); border-radius: 999px; padding: 10px 14px; background: rgba(255,255,255,.06); }
        .cockpit-tabs { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 22px; }
        .cockpit-tab, .cockpit-button, .cockpit-small-button { border: 1px solid rgba(255,255,255,.16); color: #f7f7fb; background: rgba(255,255,255,.06); border-radius: 12px; padding: 10px 14px; cursor: pointer; }
        .cockpit-tab.active { background: linear-gradient(135deg, #ff7fa8, #8f7cff); border-color: transparent; color: #080912; font-weight: 800; }
        .cockpit-button:disabled { opacity: .65; cursor: not-allowed; }
        .cockpit-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 14px; }
        .cockpit-card { border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.06); border-radius: 18px; padding: 18px; box-shadow: 0 16px 40px rgba(0,0,0,.24); }
        .cockpit-card p { margin: 0 0 10px; color: #a7a7b7; }
        .cockpit-card strong { font-size: 34px; }
        .cockpit-table-wrap { overflow-x: auto; border: 1px solid rgba(255,255,255,.12); border-radius: 18px; background: rgba(255,255,255,.04); }
        .cockpit-table { width: 100%; min-width: 980px; border-collapse: collapse; }
        .cockpit-table th, .cockpit-table td { text-align: left; vertical-align: top; padding: 12px; border-bottom: 1px solid rgba(255,255,255,.08); font-size: 13px; }
        .cockpit-table th { color: #cfcfe0; background: rgba(255,255,255,.06); }
        .cockpit-raw { max-height: 360px; overflow: auto; margin-top: 10px; padding: 12px; border-radius: 12px; background: #05060c; color: #d9d9ef; }
        .cockpit-error { color: #ff9bab; background: rgba(255, 0, 64, .12); border: 1px solid rgba(255, 0, 64, .22); padding: 12px; border-radius: 12px; }
      `}</style>

      <header className="cockpit-header">
        <div>
          <h1>Applix Developer Cockpit</h1>
          <p>Owner-only read cockpit for campaigns, leads, contact records, queue rows, AI drafts, logs, and workflow debugging. Signed in as {email}.</p>
        </div>
        <Link className="cockpit-back" href="/dashboard">Back to dashboard</Link>
      </header>

      <nav className="cockpit-tabs">
        <button className={`cockpit-tab ${activeTab === "overview" ? "active" : ""}`} onClick={() => setActiveTab("overview")}>Overview</button>
        {Object.entries(panels).map(([key, panel]) => (
          <button key={key} className={`cockpit-tab ${activeTab === key ? "active" : ""}`} onClick={() => setActiveTab(key)}>{panel.title}</button>
        ))}
      </nav>

      {activeTab === "overview" ? <OverviewPanel /> : <DataPanel config={panels[activeTab]} />}
    </main>
  );
}
