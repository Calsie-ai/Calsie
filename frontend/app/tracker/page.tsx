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

type AgentStatus =
  | "found"
  | "prepared"
  | "approved"
  | "needs_email"
  | "queued"
  | "applied"
  | "interviewing"
  | "saved"
  | "declined"
  | "skipped"
  | "rejected"
  | "failed"
  | "waiting";

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
  user_decision?: string | null;
  reviewed_at?: string | null;
};

type AgentLog = {
  id: string;
  campaignId?: string | null;
  company: string;
  jobTitle: string;
  location: string;
  website: string;
  jobUrl: string;
  source: string;
  status: AgentStatus;
  actionTime: string;
};

type ApprovalResponse = {
  ok: boolean;
  job_id: string;
  approval_status?: "approved" | string | null;
  email_status?: "found" | "not_found" | "failed" | "provider_missing" | string | null;
  draft_status?: "created" | "queued" | "not_created" | "failed" | string | null;
  queue_id?: string | null;
  next_step?: string | null;
  error?: string;
};

type ActiveReview = {
  id: string;
  decision: "approved" | "declined";
};

const PAGE_SIZE = 20;
const STATUS_OPTIONS: AgentStatus[] = [
  "found",
  "prepared",
  "approved",
  "needs_email",
  "queued",
  "applied",
  "interviewing",
  "saved",
  "declined",
  "skipped",
  "rejected",
  "failed",
  "waiting",
];

const APPROVED_STATUSES: AgentStatus[] = [
  "approved",
  "needs_email",
  "queued",
  "applied",
  "interviewing",
];
const DECLINED_STATUSES: AgentStatus[] = ["declined", "skipped", "rejected"];

function cleanText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeStatus(value: unknown): AgentStatus | null {
  const status = cleanText(value).toLowerCase().replace(/\s+/g, "_");
  if (!status) return null;
  if (status === "new") return "found";
  if (status === "approve") return "approved";
  if (status === "decline") return "declined";
  if (status === "progressing" || status === "interview") return "interviewing";
  if (status === "ready_for_review" || status === "pending_user_approval") return "prepared";
  if (status === "email_not_found") return "needs_email";
  return STATUS_OPTIONS.includes(status as AgentStatus) ? (status as AgentStatus) : null;
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
  return (
    cleanText(campaign?.search?.target_role) ||
    cleanText(campaign?.target_business_type) ||
    cleanText(campaign?.name, "target opportunities")
  );
}

function getCampaignLocation(campaign?: Campaign | null) {
  return cleanText(campaign?.search?.target_location) || cleanText(campaign?.location, "your selected location");
}

function statusFor(row: JobsRow): AgentStatus {
  const decision = normalizeStatus(row.user_decision);
  const savedStatus = normalizeStatus(row.status);
  if (decision === "approved" && savedStatus && !["approved", "found", "prepared"].includes(savedStatus)) {
    return savedStatus;
  }
  if (decision) return decision;
  if (savedStatus) return savedStatus;

  const description = `${row.description || ""} ${row.source || ""}`.toLowerCase();
  if (description.includes("applied")) return "applied";
  if (description.includes("interview")) return "interviewing";
  if (description.includes("rejected")) return "rejected";
  if (description.includes("skipped")) return "skipped";
  if (description.includes("failed")) return "failed";
  return row.apply_url ? "prepared" : "found";
}

function mapSavedJob(row: JobsRow): AgentLog {
  const source = cleanText(row.source);
  const jobUrl = cleanText(row.apply_url);
  return {
    id: row.id,
    campaignId: row.campaign_id,
    company: cleanText(row.company, "Company not saved"),
    jobTitle: cleanText(row.title, "Opportunity not named"),
    location: cleanText(row.location, "Location not saved"),
    website: source.startsWith("http") ? source : "",
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
  return (
    cleanText(value, "applix-agent-logs")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "applix-agent-logs"
  );
}

function formatDate(value: string) {
  if (!value) return "Not logged yet";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function formatShortDate(value: string) {
  if (!value || value === "unknown") return "No date";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function dayKey(value: string) {
  if (!value) return "unknown";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "unknown" : date.toISOString().slice(0, 10);
}

function statusLabel(status: AgentStatus) {
  const labels: Record<AgentStatus, string> = {
    found: "Found",
    prepared: "Prepared",
    approved: "Approved",
    needs_email: "Needs email",
    queued: "Queued",
    applied: "Applied",
    interviewing: "Interviewing",
    saved: "Saved",
    declined: "Declined",
    skipped: "Skipped",
    rejected: "Rejected",
    failed: "Failed",
    waiting: "Waiting",
  };
  return labels[status];
}

function normalizeApprovalField(value: unknown) {
  return cleanText(value).toLowerCase().replace(/\s+/g, "_");
}

function statusAfterApproval(result: ApprovalResponse): AgentStatus {
  const emailStatus = normalizeApprovalField(result.email_status);
  const draftStatus = normalizeApprovalField(result.draft_status);
  if (result.queue_id || draftStatus === "queued") return "queued";
  if (emailStatus === "failed" || draftStatus === "failed") return "failed";
  if (emailStatus && emailStatus !== "found") return "needs_email";
  return "approved";
}

function approvalMessage(result: ApprovalResponse) {
  const emailStatus = normalizeApprovalField(result.email_status);
  const draftStatus = normalizeApprovalField(result.draft_status);
  if (result.queue_id || draftStatus === "queued") return "Approved. Outreach draft is queued.";
  if (draftStatus === "created") {
    return "Approved. Outreach draft was created and is ready for the next queue step.";
  }
  if (emailStatus === "failed" || draftStatus === "failed") {
    return "Approved, but enrichment or draft creation failed. Check Supabase function logs.";
  }
  if (emailStatus && emailStatus !== "found") {
    return "Approved. Email enrichment is still required before Applix can create a draft.";
  }
  if (draftStatus === "not_created") {
    return result.next_step
      ? `Approved. Draft was not created yet. ${result.next_step}`
      : "Approved. Draft was not created yet; enrichment or draft generation still needs to run.";
  }
  return "Approved. Applix is waiting for enrichment or draft generation before queueing outreach.";
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
  const [activeReview, setActiveReview] = useState<ActiveReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [sheetMinimized, setSheetMinimized] = useState(false);
  const [sheetMaximized, setSheetMaximized] = useState(false);

  const summary = useMemo(
    () => ({
      found: logs.length,
      prepared: logs.filter((log) =>
        ["prepared", "approved", "needs_email", "queued", "applied", "interviewing"].includes(log.status),
      ).length,
      applied: logs.filter((log) => log.status === "applied" || log.status === "queued").length,
      skipped: logs.filter((log) => ["skipped", "declined", "rejected"].includes(log.status)).length,
    }),
    [logs],
  );

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
        applied: dayLogs.filter((log) => log.status === "applied" || log.status === "queued").length,
      }));
  }, [logs]);

  const visibleLogs = useMemo(
    () => (selectedDayKey === "all" ? logs : logs.filter((log) => dayKey(log.actionTime) === selectedDayKey)),
    [logs, selectedDayKey],
  );
  const totalPages = Math.max(1, Math.ceil(visibleLogs.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const pagedLogs = visibleLogs.slice(pageStart, pageStart + PAGE_SIZE);
  const visibleDayLabel =
    selectedDayKey === "all"
      ? "All days"
      : dayGroups.find((group) => group.key === selectedDayKey)?.label || "Selected day";

  const csvHref = useMemo(() => {
    const header = [
      "Company",
      "Job Title",
      "Company Website",
      "Job Post URL",
      "Source",
      "Location",
      "Status",
      "Action Time",
    ];
    const rows = logs.map((log) => [
      log.company,
      log.jobTitle,
      log.website || "Not saved",
      log.jobUrl || "Not saved",
      log.source || "Not saved",
      log.location,
      statusLabel(log.status),
      formatDate(log.actionTime),
    ]);
    const csv = [header, ...rows].map((row) => row.map((cell) => csvCell(cell)).join(",")).join("\n");
    return `data:text/csv;charset=utf-8,${encodeURIComponent(`\uFEFF${csv}`)}`;
  }, [logs]);

  const jsonHref = useMemo(
    () =>
      `data:application/json;charset=utf-8,${encodeURIComponent(
        JSON.stringify(
          {
            exported_at: new Date().toISOString(),
            campaign: campaign ? { id: campaign.id, name: campaign.name, role, location } : null,
            summary,
            logs,
          },
          null,
          2,
        ),
      )}`,
    [campaign, role, location, summary, logs],
  );
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

  async function loadSavedJobs(
    supabase: ReturnType<typeof getSupabaseClient>,
    userId: string,
    campaignId?: string | null,
  ) {
    const select =
      "id,title,company,location,description,apply_url,source,status,user_decision,reviewed_at,created_at,campaign_id";
    if (campaignId) {
      const campaignJobs = await supabase
        .from("jobs")
        .select(select)
        .eq("user_id", userId)
        .eq("campaign_id", campaignId)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (campaignJobs.error) {
        throw new Error(`Agent logs load failed: ${getErrorMessage(campaignJobs.error, "Unknown jobs error")}`);
      }
      if ((campaignJobs.data || []).length > 0) return (campaignJobs.data || []) as JobsRow[];
    }

    const allSavedJobs = await supabase
      .from("jobs")
      .select(select)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (allSavedJobs.error) {
      throw new Error(`Agent logs load failed: ${getErrorMessage(allSavedJobs.error, "Unknown saved jobs error")}`);
    }
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
    void loadTracker();
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

  async function saveJobStatus(logId: string, nextStatus: AgentStatus) {
    const previousLogs = logs;
    setSavingStatusId(logId);
    setActionMessage("");
    setLogs((current) => current.map((log) => (log.id === logId ? { ...log, status: nextStatus } : log)));
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

  async function reviewJob(log: AgentLog, decision: "approved" | "declined") {
    setSavingStatusId(log.id);
    setActiveReview({ id: log.id, decision });
    setActionMessage("");

    try {
      const supabase = getSupabaseClient();
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) throw new Error("Missing login session. Please sign in again.");

      if (decision === "declined") {
        const now = new Date().toISOString();
        const jobUpdate = await supabase
          .from("jobs")
          .update({ status: "declined", user_decision: "declined", reviewed_at: now })
          .eq("id", log.id)
          .eq("user_id", userData.user.id);
        if (jobUpdate.error) throw jobUpdate.error;
        setLogs((current) => current.map((row) => (row.id === log.id ? { ...row, status: "declined" } : row)));
        setActionMessage("Declined.");
        return;
      }

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (sessionError || !accessToken) throw new Error("Missing login session. Please sign in again.");
      if (!supabaseUrl || !supabaseAnonKey) throw new Error("Missing Supabase environment variables.");

      const response = await fetch(`${supabaseUrl}/functions/v1/approve-job-for-outreach`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          apikey: supabaseAnonKey,
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ job_id: log.id }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(getErrorMessage(payload, "Could not approve this job."));
      }

      const result = payload as ApprovalResponse;
      const finalStatus = statusAfterApproval(result);
      setLogs((current) => current.map((row) => (row.id === log.id ? { ...row, status: finalStatus } : row)));
      setActionMessage(approvalMessage(result));
    } catch (error) {
      setActionMessage(getErrorMessage(error, "Could not review this job."));
    } finally {
      setSavingStatusId(null);
      setActiveReview(null);
    }
  }

  function toggleSheetMaximized() {
    setSheetMinimized(false);
    setSheetMaximized((value) => !value);
  }

  return (
    <main className="agent-log-shell">
      <header className="agent-log-header">
        <Link href="/dashboard" className="agent-log-brand">
          <img src="/applix-logo.svg" alt="Applix logo" />
          <div>
            <strong>APPLIX</strong>
            <span>Applix Logs</span>
          </div>
        </Link>
        <Link className="agent-home-link" href="/dashboard">
          Home
        </Link>
      </header>

      <section className="agent-log-hero">
        <p className="agent-kicker">Track Applix Log</p>
        <h1>See what Applix is doing.</h1>
        <p>Approve jobs to queue them for Applix automatic sending, decline them, or open the direct application.</p>
      </section>

      <section className="agent-log-card campaign-overview">
        <span className="active-pill">Active campaign</span>
        <h2>{campaign?.name || role}</h2>
        <p>
          {role} in {location}
        </p>
      </section>

      <section className="agent-summary-grid">
        <div className="summary-card found">
          <span>Found</span>
          <strong>{summary.found}</strong>
        </div>
        <div className="summary-card prepared">
          <span>Prepared</span>
          <strong>{summary.prepared}</strong>
        </div>
        <div className="summary-card applied">
          <span>Queued</span>
          <strong>{summary.applied}</strong>
        </div>
        <div className="summary-card skipped">
          <span>Declined</span>
          <strong>{summary.skipped}</strong>
        </div>
      </section>

      {logs.length > 0 && (
        <section className="agent-log-card agent-day-timeline">
          <div className="day-line-header">
            <div>
              <p className="agent-kicker">Daily timeline</p>
              <h2>Choose the day you want to inspect</h2>
            </div>
            <span>
              {visibleDayLabel} · {visibleLogs.length} jobs
            </span>
          </div>
          <div className="day-dot-row">
            <button
              className={selectedDayKey === "all" ? "active" : ""}
              type="button"
              onClick={() => setSelectedDayKey("all")}
            >
              <span className="day-dot" />
              <strong>All</strong>
              <small>{logs.length} jobs</small>
            </button>
            {dayGroups.map((group) => (
              <button
                key={group.key}
                className={selectedDayKey === group.key ? "active" : ""}
                type="button"
                onClick={() => setSelectedDayKey(group.key)}
              >
                <span className="day-dot" />
                <strong>{group.label}</strong>
                <small>
                  {group.applied} queued · {group.total} total
                </small>
                <em>{group.dateLabel}</em>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="agent-action-row">
        <button type="button" onClick={reloadLogs} disabled={loading || reloading}>
          {reloading ? "Reloading..." : "Reload logs"}
        </button>
        <a href={csvHref} download={`${filePrefix}-applix-logs.csv`} aria-disabled={loading || logs.length === 0}>
          Download Excel
        </a>
        <a href={jsonHref} download={`${filePrefix}-applix-logs.json`} aria-disabled={loading || logs.length === 0}>
          Download JSON
        </a>
      </section>

      {actionMessage && <p className="agent-message">{actionMessage}</p>}
      {errorMessage && <p className="agent-error">{errorMessage}</p>}
      {loading && <p className="agent-message">Loading Applix logs...</p>}

      {!loading && !errorMessage && logs.length === 0 && (
        <section className="agent-log-card empty-agent-card">
          <img src="/applix-logo.svg" alt="" aria-hidden="true" />
          <h2>No Applix logs yet</h2>
          <p>
            When Applix starts finding and preparing opportunities, the company, website, job post URL, status,
            and action time will appear here.
          </p>
        </section>
      )}

      {!loading && !errorMessage && logs.length > 0 && (
        <section
          className={`agent-log-card table-card${sheetMinimized ? " is-minimized" : ""}${
            sheetMaximized ? " is-maximized" : ""
          }`}
        >
          <div className="table-title-row">
            <div>
              <p className="agent-kicker">{visibleDayLabel}</p>
              <h2>Jobs Applix touched</h2>
            </div>
            <div className="sheet-title-actions">
              <span>
                {visibleLogs.length} records · page {safePage} of {totalPages}
              </span>
              <button
                type="button"
                className="sheet-view-button"
                aria-label="Minimize application sheet"
                title="Minimize application sheet"
                onClick={() => {
                  setSheetMinimized((value) => !value);
                  setSheetMaximized(false);
                }}
              >
                −
              </button>
              <button
                type="button"
                className="sheet-view-button"
                aria-label={sheetMaximized ? "Restore application sheet" : "Maximize application sheet"}
                title={sheetMaximized ? "Restore application sheet" : "Maximize application sheet"}
                onClick={toggleSheetMaximized}
              >
                {sheetMaximized ? "▣" : "□"}
              </button>
            </div>
          </div>

          {!sheetMinimized && (
            <>
              <div className="agent-table-wrap editable-sheet-wrap">
                <table className="editable-sheet-table">
                  <thead>
                    <tr>
                      <th>Company</th>
                      <th>Opportunity</th>
                      <th>Website</th>
                      <th>Job post</th>
                      <th>Status</th>
                      <th>Review</th>
                      <th>Action time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedLogs.map((log) => {
                      const approvedSelected = APPROVED_STATUSES.includes(log.status);
                      const declinedSelected = DECLINED_STATUSES.includes(log.status);
                      const isApproving = activeReview?.id === log.id && activeReview.decision === "approved";
                      const isDeclining = activeReview?.id === log.id && activeReview.decision === "declined";

                      return (
                        <tr key={log.id}>
                          <td data-label="Company">
                            <strong>{log.company}</strong>
                            <span>{log.location}</span>
                          </td>
                          <td data-label="Opportunity">{log.jobTitle}</td>
                          <td data-label="Website">
                            {log.website ? (
                              <a href={log.website} target="_blank" rel="noreferrer">
                                Website
                              </a>
                            ) : (
                              <span className="muted-cell">Not saved</span>
                            )}
                          </td>
                          <td data-label="Job post">
                            {log.jobUrl ? (
                              <a href={log.jobUrl} target="_blank" rel="noreferrer">
                                Job post
                              </a>
                            ) : (
                              <span className="muted-cell">Not saved</span>
                            )}
                          </td>
                          <td data-label="Status">
                            <select
                              className={`status-select ${log.status}`}
                              value={log.status}
                              disabled={savingStatusId === log.id}
                              onChange={(event) => void saveJobStatus(log.id, event.target.value as AgentStatus)}
                            >
                              {STATUS_OPTIONS.map((item) => (
                                <option key={item} value={item}>
                                  {statusLabel(item)}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td data-label="Review">
                            <div className="review-actions">
                              <button
                                className={`approve-button${approvedSelected ? " is-selected" : ""}${
                                  isApproving ? " is-processing" : ""
                                }`}
                                type="button"
                                aria-pressed={approvedSelected}
                                aria-busy={isApproving}
                                disabled={savingStatusId === log.id || approvedSelected}
                                onClick={() => void reviewJob(log, "approved")}
                              >
                                {isApproving ? "Approving..." : "Approve"}
                              </button>
                              <button
                                className={`decline-button${declinedSelected ? " is-selected" : ""}${
                                  isDeclining ? " is-processing" : ""
                                }`}
                                type="button"
                                aria-pressed={declinedSelected}
                                aria-busy={isDeclining}
                                disabled={savingStatusId === log.id || declinedSelected}
                                onClick={() => void reviewJob(log, "declined")}
                              >
                                {isDeclining ? "Declining..." : "Decline"}
                              </button>
                              {log.jobUrl ? (
                                <a
                                  className="direct-apply-button"
                                  href={log.jobUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  title="Open the employer or job-board application page"
                                >
                                  Direct apply
                                </a>
                              ) : (
                                <span className="direct-apply-button is-disabled" aria-disabled="true">
                                  No apply link
                                </span>
                              )}
                            </div>
                          </td>
                          <td data-label="Action time">{formatDate(log.actionTime)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="sheet-pagination">
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                >
                  Previous
                </button>
                <span>
                  Rows {visibleLogs.length === 0 ? 0 : pageStart + 1}-
                  {Math.min(pageStart + PAGE_SIZE, visibleLogs.length)} of {visibleLogs.length}
                </span>
                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                >
                  Next
                </button>
              </div>
            </>
          )}
        </section>
      )}
    </main>
  );
}
