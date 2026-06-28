"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "../../lib/supabaseClient";

type Campaign = {
  id: string;
  name?: string | null;
  target_business_type?: string | null;
  location?: string | null;
  search?: { target_role?: string | null; target_location?: string | null } | null;
  created_at?: string | null;
};

type AgentStatus = "found" | "prepared" | "applied" | "skipped" | "failed" | "waiting" | "interviewing" | "rejected" | "saved";

type JobsRow = {
  id: string;
  title?: string | null;
  company?: string | null;
  location?: string | null;
  description?: string | null;
  apply_url?: string | null;
  source?: string | null;
  status?: string | null;
  created_at?: string | null;
  campaign_id?: string | null;
};

type AgentLog = {
  id: string;
  company: string;
  jobTitle: string;
  location: string;
  website: string;
  jobUrl: string;
  source: string;
  status: AgentStatus;
  actionTime: string;
};

const PAGE_SIZE = 20;
const STATUS_OPTIONS: AgentStatus[] = ["found", "prepared", "applied", "interviewing", "saved", "skipped", "rejected", "failed", "waiting"];

function cleanText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeStatus(value: unknown): AgentStatus | null {
  const status = cleanText(value).toLowerCase().replace(/\s+/g, "_");
  if (!status) return null;
  if (status === "new") return "found";
  if (status === "progressing" || status === "interview") return "interviewing";
  if (status === "approved" || status === "ready_for_review") return "prepared";
  if (STATUS_OPTIONS.includes(status as AgentStatus)) return status as AgentStatus;
  return null;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    return String(record.message || record.details || record.hint || record.code || JSON.stringify(record));
  }
  return fallback;
}

function getCampaignRole(campaign?: Campaign | null) {
  return cleanText(campaign?.search?.target_role) || cleanText(campaign?.target_business_type) || cleanText(campaign?.name, "target opportunities");
}

function getCampaignLocation(campaign?: Campaign | null) {
  return cleanText(campaign?.search?.target_location) || cleanText(campaign?.location, "your selected location");
}

function statusFor(row: JobsRow): AgentStatus {
  const savedStatus = normalizeStatus(row.status);
  if (savedStatus) return savedStatus;

  const description = `${row.description || ""} ${row.source || ""}`.toLowerCase();
  if (description.includes("applied")) return "applied";
  if (description.includes("interview")) return "interviewing";
  if (description.includes("rejected")) return "rejected";
  if (description.includes("skipped")) return "skipped";
  if (description.includes("failed")) return "failed";
  if (row.apply_url) return "prepared";
  return "found";
}

function mapSavedJob(row: JobsRow): AgentLog {
  const source = cleanText(row.source);
  const jobUrl = cleanText(row.apply_url);
  const website = source.startsWith("http") ? source : "";

  return {
    id: row.id,
    company: cleanText(row.company, "Company not saved"),
    jobTitle: cleanText(row.title, "Opportunity not named"),
    location: cleanText(row.location, "Location not saved"),
    website,
    jobUrl,
    source,
    status: statusFor(row),
    actionTime: row.created_at || "",
  };
}

function csvCell(value: string) {
  return `"${value.replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
}

function safeFileName(value: string) {
  return cleanText(value, "applix-agent-logs")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "applix-agent-logs";
}

function formatDate(value: string) {
  if (!value) return "Not logged yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function formatShortDate(value: string) {
  if (!value || value === "unknown") return "No date";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function dayKey(value: string) {
  if (!value) return "unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  return date.toISOString().slice(0, 10);
}

function statusLabel(status: AgentStatus) {
  if (status === "found") return "Found";
  if (status === "prepared") return "Prepared";
  if (status === "applied") return "Applied";
  if (status === "interviewing") return "Interviewing";
  if (status === "saved") return "Saved";
  if (status === "skipped") return "Skipped";
  if (status === "rejected") return "Rejected";
  if (status === "failed") return "Failed";
  return "Waiting";
}

export default function TrackerPage() {
  const router = useRouter();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [role, setRole] = useState("target opportunities");
  const [location, setLocation] = useState("your selected location");
  const [selectedDayKey, setSelectedDayKey] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [savingStatusId, setSavingStatusId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  const summary = useMemo(() => ({
    found: logs.length,
    prepared: logs.filter((log) => log.status === "prepared" || log.status === "applied" || log.status === "interviewing").length,
    applied: logs.filter((log) => log.status === "applied").length,
    skipped: logs.filter((log) => log.status === "skipped").length,
  }), [logs]);

  const dayGroups = useMemo(() => {
    const groups = new Map<string, AgentLog[]>();
    logs.forEach((log) => {
      const key = dayKey(log.actionTime);
      groups.set(key, [...(groups.get(key) || []), log]);
    });

    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, dayLogs], index) => ({
        key,
        label: `Day ${index + 1}`,
        dateLabel: formatShortDate(key),
        total: dayLogs.length,
        applied: dayLogs.filter((log) => log.status === "applied").length,
      }));
  }, [logs]);

  const visibleLogs = useMemo(() => {
    if (selectedDayKey === "all") return logs;
    return logs.filter((log) => dayKey(log.actionTime) === selectedDayKey);
  }, [logs, selectedDayKey]);

  const totalPages = Math.max(1, Math.ceil(visibleLogs.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const pagedLogs = visibleLogs.slice(pageStart, pageStart + PAGE_SIZE);

  const visibleDayLabel = selectedDayKey === "all"
    ? "All days"
    : dayGroups.find((group) => group.key === selectedDayKey)?.label || "Selected day";

  const csvHref = useMemo(() => {
    const header = ["Company", "Job Title", "Company Website", "Job Post URL", "Source", "Location", "Status", "Action Time"];
    const rows = logs.map((log) => [log.company, log.jobTitle, log.website || "Not saved", log.jobUrl || "Not saved", log.source || "Not saved", log.location, statusLabel(log.status), formatDate(log.actionTime)]);
    const csv = [header, ...rows].map((row) => row.map((cell) => csvCell(cell)).join(",")).join("\n");
    return `data:text/csv;charset=utf-8,${encodeURIComponent(`\uFEFF${csv}`)}`;
  }, [logs]);

  const jsonHref = useMemo(() => {
    const json = JSON.stringify({ exported_at: new Date().toISOString(), campaign: campaign ? { id: campaign.id, name: campaign.name, role, location } : null, summary, logs }, null, 2);
    return `data:application/json;charset=utf-8,${encodeURIComponent(json)}`;
  }, [campaign, role, location, summary, logs]);

  const filePrefix = safeFileName(campaign?.name || role);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedDayKey]);

  async function loadSingleCampaign(supabase: ReturnType<typeof getSupabaseClient>, userId: string) {
    const { data, error } = await supabase
      .from("campaigns")
      .select("id,name,target_business_type,location,search,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(`Campaign load failed: ${getErrorMessage(error, "Unknown campaign error")}`);
    return (data || null) as Campaign | null;
  }

  async function loadSavedJobs(supabase: ReturnType<typeof getSupabaseClient>, userId: string, campaignId?: string | null) {
    const select = "id,title,company,location,description,apply_url,source,status,created_at,campaign_id";

    if (campaignId) {
      const campaignJobs = await supabase
        .from("jobs")
        .select(select)
        .eq("user_id", userId)
        .eq("campaign_id", campaignId)
        .order("created_at", { ascending: false })
        .limit(1000);

      if (campaignJobs.error) throw new Error(`Agent logs load failed: ${getErrorMessage(campaignJobs.error, "Unknown jobs error")}`);
      if ((campaignJobs.data || []).length > 0) return (campaignJobs.data || []) as JobsRow[];
    }

    const allSavedJobs = await supabase
      .from("jobs")
      .select(select)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1000);

    if (allSavedJobs.error) throw new Error(`Agent logs load failed: ${getErrorMessage(allSavedJobs.error, "Unknown saved jobs error")}`);
    return (allSavedJobs.data || []) as JobsRow[];
  }

  async function loadTracker() {
    setLoading(true);
    setErrorMessage("");

    try {
      const supabase = getSupabaseClient();
      const { data: userData, error: userError } = await supabase.auth.getUser();

      if (userError || !userData.user) {
        router.replace("/");
        return;
      }

      const loadedCampaign = await loadSingleCampaign(supabase, userData.user.id);
      setCampaign(loadedCampaign);
      setRole(getCampaignRole(loadedCampaign));
      setLocation(getCampaignLocation(loadedCampaign));

      const savedJobsData = await loadSavedJobs(supabase, userData.user.id, loadedCampaign?.id || null);
      setLogs(savedJobsData.map(mapSavedJob));
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Could not load agent logs."));
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTracker();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function reloadLogs() {
    setReloading(true);
    setActionMessage("");

    try {
      await loadTracker();
      setActionMessage("Applix logs reloaded from Supabase.");
    } catch (error) {
      setActionMessage(getErrorMessage(error, "Could not reload Applix logs."));
    } finally {
      setReloading(false);
    }
  }

  async function updateLogStatus(logId: string, nextStatus: AgentStatus) {
    const previousLogs = logs;
    setSavingStatusId(logId);
    setActionMessage("");
    setLogs((current) => current.map((log) => log.id === logId ? { ...log, status: nextStatus } : log));

    try {
      const supabase = getSupabaseClient();
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) throw new Error("Missing login session. Please sign in again.");

      const { error } = await supabase
        .from("jobs")
        .update({ status: nextStatus })
        .eq("id", logId)
        .eq("user_id", userData.user.id);

      if (error) throw error;
      setActionMessage(`Status updated to ${statusLabel(nextStatus)}.`);
    } catch (error) {
      setLogs(previousLogs);
      setActionMessage(getErrorMessage(error, "Could not update status."));
    } finally {
      setSavingStatusId(null);
    }
  }

  return (
    <main className="agent-log-shell">
      <header className="agent-log-header">
        <Link href="/dashboard" className="agent-log-brand">
          <img src="/applix-logo.svg" alt="Applix logo" />
          <div><strong>APPLIX</strong><span>Applix Logs</span></div>
        </Link>
        <Link className="agent-home-link" href="/dashboard">Home</Link>
      </header>

      <section className="agent-log-hero">
        <p className="agent-kicker">Track Applix Log</p>
        <h1>See what Applix is doing.</h1>
        <p>Click a day dot to inspect jobs, then change status directly in the sheet-style table.</p>
      </section>

      <section className="agent-log-card campaign-overview">
        <span className="active-pill">Active campaign</span>
        <h2>{campaign?.name || role}</h2>
        <p>{role} in {location}</p>
      </section>

      <section className="agent-summary-grid">
        <div className="summary-card found"><span>Found</span><strong>{summary.found}</strong></div>
        <div className="summary-card prepared"><span>Prepared</span><strong>{summary.prepared}</strong></div>
        <div className="summary-card applied"><span>Applied</span><strong>{summary.applied}</strong></div>
        <div className="summary-card skipped"><span>Skipped</span><strong>{summary.skipped}</strong></div>
      </section>

      {logs.length > 0 && (
        <section className="agent-log-card agent-day-timeline">
          <div className="day-line-header">
            <div><p className="agent-kicker">Daily timeline</p><h2>Choose the day you want to inspect</h2></div>
            <span>{visibleDayLabel} · {visibleLogs.length} jobs</span>
          </div>
          <div className="day-dot-row">
            <button className={selectedDayKey === "all" ? "active" : ""} type="button" onClick={() => setSelectedDayKey("all")}>
              <span className="day-dot" /><strong>All</strong><small>{logs.length} jobs</small>
            </button>
            {dayGroups.map((group) => (
              <button key={group.key} className={selectedDayKey === group.key ? "active" : ""} type="button" onClick={() => setSelectedDayKey(group.key)}>
                <span className="day-dot" /><strong>{group.label}</strong><small>{group.applied} applied · {group.total} total</small><em>{group.dateLabel}</em>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="agent-action-row">
        <button type="button" onClick={reloadLogs} disabled={loading || reloading}>{reloading ? "Reloading..." : "Reload logs"}</button>
        <a href={csvHref} download={`${filePrefix}-applix-logs.csv`} aria-disabled={loading || logs.length === 0}>Download Excel</a>
        <a href={jsonHref} download={`${filePrefix}-applix-logs.json`} aria-disabled={loading || logs.length === 0}>Download JSON</a>
      </section>

      {actionMessage && <p className="agent-message">{actionMessage}</p>}
      {errorMessage && <p className="agent-error">{errorMessage}</p>}
      {loading && <p className="agent-message">Loading Applix logs...</p>}

      {!loading && !errorMessage && logs.length === 0 && (
        <section className="agent-log-card empty-agent-card">
          <img src="/applix-logo.svg" alt="" aria-hidden="true" />
          <h2>No Applix logs yet</h2>
          <p>When Applix starts finding and preparing opportunities, the company, website, job post URL, status, and action time will appear here.</p>
        </section>
      )}

      {!loading && !errorMessage && logs.length > 0 && (
        <section className="agent-log-card table-card">
          <div className="table-title-row">
            <div><p className="agent-kicker">{visibleDayLabel}</p><h2>Jobs Applix touched</h2></div>
            <span>{visibleLogs.length} records · page {safePage} of {totalPages}</span>
          </div>

          <div className="agent-table-wrap editable-sheet-wrap">
            <table className="editable-sheet-table">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Opportunity</th>
                  <th>Website</th>
                  <th>Job post</th>
                  <th>Status</th>
                  <th>Action time</th>
                </tr>
              </thead>
              <tbody>
                {pagedLogs.map((log) => (
                  <tr key={log.id}>
                    <td data-label="Company"><strong>{log.company}</strong><span>{log.location}</span></td>
                    <td data-label="Opportunity">{log.jobTitle}</td>
                    <td data-label="Website">{log.website ? <a href={log.website} target="_blank" rel="noreferrer">Website</a> : <span className="muted-cell">Not saved</span>}</td>
                    <td data-label="Job post">{log.jobUrl ? <a href={log.jobUrl} target="_blank" rel="noreferrer">Job post</a> : <span className="muted-cell">Not saved</span>}</td>
                    <td data-label="Status">
                      <select
                        className={`status-select ${log.status}`}
                        value={log.status}
                        disabled={savingStatusId === log.id}
                        onChange={(event) => updateLogStatus(log.id, event.target.value as AgentStatus)}
                      >
                        {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
                      </select>
                    </td>
                    <td data-label="Action time">{formatDate(log.actionTime)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="sheet-pagination">
            <button type="button" disabled={safePage <= 1} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}>Previous</button>
            <span>Rows {visibleLogs.length === 0 ? 0 : pageStart + 1}-{Math.min(pageStart + PAGE_SIZE, visibleLogs.length)} of {visibleLogs.length}</span>
            <button type="button" disabled={safePage >= totalPages} onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}>Next</button>
          </div>
        </section>
      )}

      <style>{`
        .agent-log-shell { min-height: 100vh; padding: clamp(22px, 4vw, 44px) 16px 54px; color: white; background: radial-gradient(circle at 12% 0%, rgba(168,85,247,.28), transparent 28%), radial-gradient(circle at 86% 18%, rgba(34,211,238,.16), transparent 24%), linear-gradient(180deg, #100b26 0%, #070b18 56%, #030306 100%); }
        .agent-log-header, .agent-log-hero, .agent-log-card, .agent-summary-grid, .agent-action-row { width: min(1180px, 100%); margin-left: auto; margin-right: auto; }
        .agent-log-header { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-bottom: clamp(26px, 5vw, 46px); }
        .agent-log-brand { display: inline-flex; align-items: center; gap: 12px; }
        .agent-log-brand img { width: 54px; height: 54px; object-fit: contain; }
        .agent-log-brand strong { display: block; color: #ff7fa8; letter-spacing: .18em; font-size: 16px; }
        .agent-log-brand span { color: rgba(255,255,255,.62); font-size: 12px; font-weight: 850; }
        .agent-home-link, .agent-action-row a, .agent-action-row button, .sheet-pagination button { border: 1px solid rgba(220,235,255,.2); border-radius: 999px; background: rgba(255,255,255,.08); color: white; font-weight: 950; padding: 12px 18px; min-height: 48px; display: inline-flex; align-items: center; justify-content: center; backdrop-filter: blur(18px); cursor: pointer; }
        .agent-home-link:disabled, .agent-action-row button:disabled, .sheet-pagination button:disabled { opacity: .45; cursor: not-allowed; }
        .agent-log-hero { text-align: center; margin-bottom: 22px; }
        .agent-kicker { margin: 0 0 8px; color: #a7f3d0; font-size: 12px; font-weight: 950; letter-spacing: .14em; text-transform: uppercase; }
        .agent-log-hero h1 { margin: 0; font-size: clamp(40px, 7vw, 76px); line-height: .95; letter-spacing: -2px; }
        .agent-log-hero p { max-width: 680px; margin: 16px auto 0; color: rgba(255,255,255,.74); font-size: clamp(16px, 2vw, 20px); line-height: 1.5; }
        .agent-log-card { border: 1px solid rgba(200,230,255,.2); border-radius: 30px; background: linear-gradient(180deg, rgba(18,25,43,.72), rgba(7,12,24,.86)); box-shadow: inset 0 1px 0 rgba(255,255,255,.12), 0 22px 70px rgba(0,0,0,.3); backdrop-filter: blur(22px) saturate(1.12); }
        .campaign-overview { text-align: center; padding: 24px; margin-bottom: 18px; }
        .campaign-overview h2 { margin: 10px 0 6px; font-size: clamp(24px, 4vw, 38px); }
        .campaign-overview p { margin: 0; color: rgba(255,255,255,.72); }
        .active-pill { display: inline-flex; padding: 7px 14px; border-radius: 999px; background: rgba(34,211,238,.12); border: 1px solid rgba(34,211,238,.26); color: #bff7ff; font-size: 12px; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; }
        .agent-summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 18px; }
        .summary-card { border-radius: 24px; padding: 20px; background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.16); text-align: center; }
        .summary-card span { display: block; color: rgba(255,255,255,.68); font-size: 13px; font-weight: 900; text-transform: uppercase; letter-spacing: .08em; }
        .summary-card strong { display: block; margin-top: 8px; font-size: clamp(30px, 5vw, 52px); line-height: 1; }
        .agent-day-timeline { padding: clamp(18px, 3vw, 28px); margin-bottom: 18px; }
        .day-line-header { display: flex; align-items: end; justify-content: space-between; gap: 18px; margin-bottom: 20px; }
        .day-line-header h2 { margin: 0; font-size: clamp(22px, 3.8vw, 36px); }
        .day-line-header > span { color: rgba(255,255,255,.68); font-weight: 900; }
        .day-dot-row { position: relative; display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 14px; }
        .day-dot-row::before { content: ""; position: absolute; left: 6%; right: 6%; top: 22px; height: 2px; background: linear-gradient(90deg, rgba(34,211,238,.15), rgba(255,106,181,.5), rgba(34,211,238,.15)); }
        .day-dot-row button { position: relative; display: grid; justify-items: center; gap: 6px; padding: 8px 12px 14px; border: 0; border-radius: 20px; background: transparent; color: white; cursor: pointer; }
        .day-dot { width: 42px; height: 42px; border-radius: 999px; display: block; border: 2px solid rgba(255,255,255,.24); background: linear-gradient(180deg, rgba(18,25,43,.96), rgba(7,12,24,.96)); box-shadow: 0 0 0 5px rgba(255,255,255,.04); }
        .day-dot-row button.active .day-dot { border-color: rgba(255,106,181,.98); box-shadow: 0 0 0 5px rgba(255,106,181,.15), 0 0 22px rgba(255,106,181,.38); }
        .day-dot-row strong { font-size: 16px; font-weight: 950; }
        .day-dot-row small { color: rgba(255,255,255,.7); font-weight: 850; text-align: center; }
        .day-dot-row em { color: rgba(255,255,255,.45); font-style: normal; font-size: 12px; font-weight: 850; }
        .agent-action-row { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; margin-bottom: 18px; }
        .agent-action-row a:nth-child(2) { background: rgba(34,211,238,.12); border-color: rgba(34,211,238,.28); }
        .agent-action-row a:nth-child(3) { background: rgba(255,106,181,.12); border-color: rgba(255,106,181,.34); }
        .agent-action-row a[aria-disabled="true"] { opacity: .45; pointer-events: none; }
        .agent-message, .agent-error { width: min(1180px, 100%); margin: 0 auto 18px; text-align: center; font-weight: 850; }
        .agent-message { color: #a7f3d0; }
        .agent-error { color: #fca5a5; }
        .empty-agent-card { padding: 34px; text-align: center; }
        .empty-agent-card img { width: 110px; height: 110px; object-fit: contain; }
        .empty-agent-card h2 { font-size: clamp(28px, 5vw, 44px); margin: 0 0 10px; }
        .empty-agent-card p { max-width: 650px; margin: 0 auto; color: rgba(255,255,255,.72); line-height: 1.5; }
        .table-card { padding: clamp(18px, 3vw, 30px); }
        .table-title-row { display: flex; justify-content: space-between; gap: 16px; align-items: end; margin-bottom: 18px; }
        .table-title-row h2 { margin: 0; font-size: clamp(26px, 4vw, 42px); }
        .table-title-row span { color: rgba(255,255,255,.68); font-weight: 850; }
        .agent-table-wrap { overflow-x: auto; border-radius: 22px; border: 1px solid rgba(255,255,255,.1); }
        .editable-sheet-table { width: 100%; border-collapse: collapse; min-width: 900px; }
        .editable-sheet-table th, .editable-sheet-table td { padding: 14px 16px; text-align: left; border-bottom: 1px solid rgba(255,255,255,.08); }
        .editable-sheet-table th { position: sticky; top: 0; z-index: 1; background: rgba(7,12,24,.95); color: rgba(255,255,255,.68); font-size: 12px; text-transform: uppercase; letter-spacing: .08em; }
        .editable-sheet-table tbody tr:hover { background: rgba(255,255,255,.045); }
        .editable-sheet-table td { color: rgba(255,255,255,.86); vertical-align: top; }
        .editable-sheet-table td strong { display: block; color: white; }
        .editable-sheet-table td span { display: block; color: rgba(255,255,255,.58); margin-top: 4px; }
        .editable-sheet-table td a { color: #bff7ff; font-weight: 900; }
        .muted-cell { color: rgba(255,255,255,.48); }
        .status-select { width: 155px; border: 1px solid rgba(255,255,255,.18); border-radius: 999px; padding: 9px 12px; color: white; font-weight: 950; background: rgba(15,23,42,.95); outline: none; cursor: pointer; }
        .status-select option { color: #0f172a; background: white; }
        .status-select.found { border-color: rgba(96,165,250,.38); box-shadow: inset 0 0 0 999px rgba(96,165,250,.12); }
        .status-select.prepared { border-color: rgba(34,211,238,.42); box-shadow: inset 0 0 0 999px rgba(34,211,238,.12); }
        .status-select.applied { border-color: rgba(52,211,153,.42); box-shadow: inset 0 0 0 999px rgba(52,211,153,.12); }
        .status-select.interviewing, .status-select.saved { border-color: rgba(168,85,247,.42); box-shadow: inset 0 0 0 999px rgba(168,85,247,.12); }
        .status-select.skipped { border-color: rgba(251,191,36,.42); box-shadow: inset 0 0 0 999px rgba(251,191,36,.12); }
        .status-select.rejected, .status-select.failed { border-color: rgba(248,113,113,.42); box-shadow: inset 0 0 0 999px rgba(248,113,113,.12); }
        .sheet-pagination { display: flex; justify-content: space-between; align-items: center; gap: 14px; margin-top: 18px; color: rgba(255,255,255,.72); font-weight: 900; }
        .sheet-pagination span { text-align: center; }
        @media (max-width: 760px) {
          .agent-log-header { align-items: flex-start; }
          .agent-summary-grid { grid-template-columns: repeat(2, 1fr); }
          .day-line-header { display: grid; align-items: start; text-align: center; }
          .day-dot-row { grid-template-columns: repeat(2, 1fr); }
          .day-dot-row::before { display: none; }
          .agent-action-row, .sheet-pagination { display: grid; grid-template-columns: 1fr; }
          .agent-action-row a, .agent-action-row button, .sheet-pagination button { width: 100%; }
          .table-title-row { display: grid; align-items: start; }
          .editable-sheet-table { min-width: 0; }
          .editable-sheet-table thead { display: none; }
          .editable-sheet-table tbody, .editable-sheet-table tr, .editable-sheet-table td { display: block; width: 100%; }
          .editable-sheet-table tr { padding: 16px; border-bottom: 1px solid rgba(255,255,255,.1); }
          .editable-sheet-table td { padding: 8px 0; border-bottom: 0; }
          .editable-sheet-table td::before { content: attr(data-label); display: block; margin-bottom: 5px; color: rgba(255,255,255,.48); font-size: 11px; font-weight: 950; text-transform: uppercase; letter-spacing: .08em; }
          .status-select { width: 100%; }
        }
      `}</style>
    </main>
  );
}
