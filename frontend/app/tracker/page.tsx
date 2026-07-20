"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseClient } from "../../lib/supabaseClient";
import styles from "./tracker.module.css";

type Campaign = {
  id: string;
  name: string | null;
  target_business_type: string | null;
  location: string | null;
  status: string | null;
};

type ReviewJob = {
  match_id: string;
  id: string;
  campaign_id: string;
  title: string | null;
  company: string | null;
  location: string | null;
  source: string | null;
  apply_url: string | null;
  description: string | null;
  status: string | null;
  created_at: string | null;
  ai_role_relevance_score?: number | null;
};

type LegacyJob = {
  id: string;
  title: string | null;
  company: string | null;
  location: string | null;
  status: string | null;
  apply_url: string | null;
  created_at: string | null;
};

type Tab = "review" | "tracker" | "history";
type Decision = "approved" | "skipped";

const MIN_SHEET_ZOOM = 70;
const MAX_SHEET_ZOOM = 130;
const SHEET_ZOOM_STEP = 10;

function messageFrom(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message || fallback);
  }
  return fallback;
}

function formatDate(value: string | null) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function shortDescription(value: string | null) {
  const clean = (value || "No description saved.").replace(/\s+/g, " ").trim();
  return clean.length > 110 ? `${clean.slice(0, 107)}...` : clean;
}

function initialTab(value: string | null): Tab {
  if (value === "tracker" || value === "history") return value;
  return "review";
}

export default function TrackerPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const embedded = searchParams.get("embedded") === "1";
  const requestedView = searchParams.get("view");
  const [tab, setTab] = useState<Tab>(initialTab(requestedView));
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [reviewJobs, setReviewJobs] = useState<ReviewJob[]>([]);
  const [legacyJobs, setLegacyJobs] = useState<LegacyJob[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [sheetZoom, setSheetZoom] = useState(100);

  const pendingJobs = useMemo(() => reviewJobs.filter((job) => job.status !== "approved"), [reviewJobs]);
  const approvedJobs = useMemo(() => reviewJobs.filter((job) => job.status === "approved"), [reviewJobs]);
  const summary = useMemo(
    () => ({ waiting: pendingJobs.length, approved: approvedJobs.length, legacy: legacyJobs.length }),
    [pendingJobs.length, approvedJobs.length, legacyJobs.length],
  );
  const allSelected = pendingJobs.length > 0 && selectedIds.length === pendingJobs.length;
  const sheetStyle = { "--sheet-zoom": sheetZoom / 100 } as CSSProperties;

  function publishCounts(approvedCount: number) {
    if (window.parent !== window) {
      window.parent.postMessage({ type: "applix-tracker-counts", approvedCount }, window.location.origin);
    }
  }

  async function load() {
    setLoading(true);
    setError("");
    try {
      const supabase = getSupabaseClient();
      const auth = await supabase.auth.getUser();
      if (auth.error || !auth.data.user) {
        router.replace("/");
        return;
      }

      const campaignResult = await supabase
        .from("campaigns")
        .select("id,name,target_business_type,location,status")
        .eq("user_id", auth.data.user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (campaignResult.error) throw campaignResult.error;

      const latestCampaign = campaignResult.data as Campaign | null;
      setCampaign(latestCampaign);

      let loadedReviewJobs: ReviewJob[] = [];
      if (latestCampaign?.id) {
        const reviewResult = await supabase.rpc("get_review_jobs", {
          p_campaign_id: latestCampaign.id,
          p_limit: 100,
        });
        if (reviewResult.error) throw reviewResult.error;
        loadedReviewJobs = (reviewResult.data || []) as ReviewJob[];
      }
      setReviewJobs(loadedReviewJobs);
      publishCounts(loadedReviewJobs.filter((job) => job.status === "approved").length);

      const legacyResult = await supabase
        .from("jobs")
        .select("id,title,company,location,status,apply_url,created_at")
        .eq("user_id", auth.data.user.id)
        .order("created_at", { ascending: false })
        .limit(500);
      if (legacyResult.error) throw legacyResult.error;
      setLegacyJobs((legacyResult.data || []) as LegacyJob[]);
      setSelectedIds([]);
    } catch (loadError) {
      setError(messageFrom(loadError, "Could not load the tracker."));
      setReviewJobs([]);
      setLegacyJobs([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function prepareApprovedApplications(campaignId: string, accessToken: string) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey) throw new Error("Missing Supabase environment variables.");

    const response = await fetch(`${supabaseUrl}/functions/v1/prepare-approved-applications`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: anonKey,
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ campaign_id: campaignId, limit: 25 }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok === false) {
      throw new Error(payload?.error || "Application preparation failed.");
    }
    return payload;
  }

  async function recordDecision(job: ReviewJob, decision: Decision) {
    const supabase = getSupabaseClient();
    const result = await supabase.rpc("decide_campaign_job", {
      p_match_id: job.match_id,
      p_decision: decision,
    });
    if (result.error) throw result.error;
    if (result.data !== true) throw new Error(`${job.title || "Job"} is no longer available for review.`);
  }

  async function decide(job: ReviewJob, decision: Decision) {
    if (busyId || bulkBusy || job.status === "approved") return;
    setBusyId(job.id);
    setMessage("");
    setError("");
    try {
      await recordDecision(job, decision);
      setSelectedIds((current) => current.filter((id) => id !== job.id));

      if (decision === "skipped") {
        setReviewJobs((current) => current.filter((item) => item.id !== job.id));
        setMessage("Passed. This job was removed from the approval queue.");
        return;
      }

      const nextJobs = reviewJobs.map((item) =>
        item.id === job.id ? { ...item, status: "approved", created_at: new Date().toISOString() } : item,
      );
      setReviewJobs(nextJobs);
      publishCounts(nextJobs.filter((item) => item.status === "approved").length);

      const supabase = getSupabaseClient();
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) throw new Error("Please sign in again.");
      const prepared = await prepareApprovedApplications(job.campaign_id, token);
      setMessage(
        prepared.queued_companies > 0
          ? `Smashed. Added to your tracker while ${prepared.queued_companies} company contact${prepared.queued_companies === 1 ? " is" : "s are"} enriched.`
          : `Smashed. Added to your tracker with ${prepared.drafts_created || 0} draft${prepared.drafts_created === 1 ? "" : "s"} ready.`,
      );
      if (!embedded) setTab("tracker");
    } catch (decisionError) {
      setError(messageFrom(decisionError, "Could not save the decision."));
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function decideSelected(decision: Decision) {
    const jobs = pendingJobs.filter((job) => selectedIds.includes(job.id));
    if (!jobs.length || bulkBusy || busyId) return;
    setBulkBusy(true);
    setMessage("");
    setError("");
    try {
      for (const job of jobs) await recordDecision(job, decision);
      const decidedIds = new Set(jobs.map((job) => job.id));
      setSelectedIds([]);

      if (decision === "skipped") {
        setReviewJobs((current) => current.filter((job) => !decidedIds.has(job.id)));
        setMessage(`${jobs.length} jobs passed and removed from the approval queue.`);
        return;
      }

      const now = new Date().toISOString();
      const nextJobs = reviewJobs.map((job) =>
        decidedIds.has(job.id) ? { ...job, status: "approved", created_at: now } : job,
      );
      setReviewJobs(nextJobs);
      publishCounts(nextJobs.filter((job) => job.status === "approved").length);

      const supabase = getSupabaseClient();
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) throw new Error("Please sign in again.");
      await prepareApprovedApplications(jobs[0].campaign_id, token);
      setMessage(`${jobs.length} jobs smashed and added to your tracker.`);
      if (!embedded) setTab("tracker");
    } catch (bulkError) {
      setError(messageFrom(bulkError, "Could not complete the bulk decision."));
      await load();
    } finally {
      setBulkBusy(false);
    }
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function toggleAll() {
    setSelectedIds(allSelected ? [] : pendingJobs.map((job) => job.id));
  }

  function zoomSheet(direction: "in" | "out") {
    setSheetZoom((current) => {
      const next = current + (direction === "in" ? SHEET_ZOOM_STEP : -SHEET_ZOOM_STEP);
      return Math.min(MAX_SHEET_ZOOM, Math.max(MIN_SHEET_ZOOM, next));
    });
  }

  return (
    <main className={`${styles.shell} ${embedded ? styles.embedded : ""}`}>
      <div className={styles.page}>
        {!embedded && (
          <header className={styles.header}>
            <div>
              <Link href="/dashboard" className={styles.backLink}>← Back to dashboard</Link>
              <p className={styles.eyebrow}>Calsie jobs</p>
              <h1>{tab === "review" ? "Approve jobs" : tab === "tracker" ? "Application tracker" : "Application history"}</h1>
              <p className={styles.subtitle}>
                {campaign ? `${campaign.name || campaign.target_business_type || "Campaign"} · ${campaign.location || "Location not set"}` : "No campaign selected"}
              </p>
            </div>
            <button onClick={() => void load()} disabled={loading} className={styles.reload}>
              {loading ? "Loading..." : "Reload"}
            </button>
          </header>
        )}

        <section className={styles.summary}>
          <div className={styles.summaryCard}><span>Awaiting approval</span><strong>{summary.waiting}</strong><small>Choose Pass or Smash</small></div>
          <div className={styles.summaryCard}><span>Tracker</span><strong>{summary.approved}</strong><small>Added after Smash</small></div>
          <div className={styles.summaryCard}><span>Application history</span><strong>{summary.legacy}</strong><small>Total application records</small></div>
        </section>

        <div className={styles.trackerNav}>
          <div className={styles.tabs}>
            <button onClick={() => setTab("review")} className={`${styles.tab} ${tab === "review" ? styles.activeTab : ""}`}>Approve Jobs</button>
            <button onClick={() => setTab("tracker")} className={`${styles.tab} ${tab === "tracker" ? styles.activeTab : ""}`}>Tracker</button>
            <button onClick={() => setTab("history")} className={`${styles.tab} ${tab === "history" ? styles.activeTab : ""}`}>Application History</button>
          </div>
          <div className={styles.zoomControls} aria-label="Tracker sheet zoom controls">
            <button type="button" onClick={() => zoomSheet("out")} disabled={sheetZoom <= MIN_SHEET_ZOOM} aria-label="Zoom tracker sheet out">−</button>
            <button type="button" className={styles.zoomValue} onClick={() => setSheetZoom(100)} aria-label="Reset tracker sheet zoom to 100 percent">{sheetZoom}%</button>
            <button type="button" onClick={() => zoomSheet("in")} disabled={sheetZoom >= MAX_SHEET_ZOOM} aria-label="Zoom tracker sheet in">+</button>
          </div>
        </div>

        {message && <p className={styles.notice}>{message}</p>}
        {error && <p className={styles.error}>{error}</p>}

        {tab === "review" && (
          <section>
            <div className={styles.toolbar}>
              <span className={styles.toolbarLabel}>{pendingJobs.length} awaiting approval · {selectedIds.length} selected</span>
              <div className={styles.toolbarRight}>
                <button className={styles.skipSelected} disabled={!selectedIds.length || bulkBusy} onClick={() => void decideSelected("skipped")}>Pass selected</button>
                <button className={styles.approveSelected} disabled={!selectedIds.length || bulkBusy} onClick={() => void decideSelected("approved")}>{bulkBusy ? "Working..." : "Smash selected"}</button>
              </div>
            </div>

            {pendingJobs.length > 0 ? (
              <div className={styles.sheetWrap}>
                <div className={styles.sheetCanvas} style={sheetStyle}>
                  <table className={styles.sheet}>
                    <thead>
                      <tr>
                        <th className={styles.rowNumber}>#</th>
                        <th className={styles.checkColumn}><input aria-label="Select all waiting jobs" type="checkbox" checked={allSelected} onChange={toggleAll} /></th>
                        <th className={styles.scoreColumn}>AI score</th>
                        <th className={styles.titleColumn}>Job title</th>
                        <th className={styles.companyColumn}>Company</th>
                        <th className={styles.locationColumn}>Location</th>
                        <th className={styles.linkColumn}>Job post</th>
                        <th className={styles.actionColumn}>Decision</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingJobs.map((job, index) => {
                        const selected = selectedIds.includes(job.id);
                        return (
                          <tr key={job.match_id || job.id} className={selected ? styles.selectedRow : ""}>
                            <td className={styles.rowNumber}>{index + 1}</td>
                            <td className={styles.checkColumn}><input aria-label={`Select ${job.title || "job"}`} type="checkbox" checked={selected} onChange={() => toggleSelected(job.id)} /></td>
                            <td><span className={styles.score}>{job.ai_role_relevance_score ?? "Fit"}</span></td>
                            <td className={styles.titleCell} title={job.description || ""}><strong>{job.title || "Untitled job"}</strong><small>{shortDescription(job.description)}</small></td>
                            <td className={styles.companyCell}><strong>{job.company || "Unknown company"}</strong><small>{job.source || "Source not saved"}</small></td>
                            <td>{job.location || "—"}</td>
                            <td>{job.apply_url ? <a className={styles.openLink} href={job.apply_url} target="_blank" rel="noreferrer">Open</a> : "—"}</td>
                            <td><div className={styles.actions}><button className={styles.skip} disabled={busyId === job.id || bulkBusy} onClick={() => void decide(job, "skipped")}>Pass</button><button className={styles.approve} disabled={busyId === job.id || bulkBusy} onClick={() => void decide(job, "approved")}>{busyId === job.id ? "..." : "Smash"}</button></div></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className={styles.empty}><h2>{loading ? "Loading approval queue..." : "No jobs awaiting approval"}</h2><p>New AI-matched jobs will appear here for Pass or Smash.</p></div>
            )}
          </section>
        )}

        {tab === "tracker" && (
          <section className={styles.trackerSheetSection}>
            <div className={styles.trackerTitleRow}>
              <strong>CALSIE TRACKER</strong>
              <span>{approvedJobs.length} smashed job{approvedJobs.length === 1 ? "" : "s"}</span>
            </div>
            {approvedJobs.length > 0 ? (
              <div className={styles.historyWrap}>
                <div className={styles.sheetCanvas} style={sheetStyle}>
                  <table className={`${styles.sheet} ${styles.trackerSheet}`}>
                    <thead><tr><th className={styles.companyColumn}>Company</th><th className={styles.linkColumn}>URL</th><th className={styles.descriptionColumn}>Description</th><th className={styles.dateColumn}>Smashed at</th></tr></thead>
                    <tbody>{approvedJobs.map((job) => <tr key={job.match_id || job.id}><td className={styles.companyCell}><strong>{job.company || "Unknown company"}</strong></td><td>{job.apply_url ? <a className={styles.cleanLink} href={job.apply_url} target="_blank" rel="noreferrer">Open job</a> : "—"}</td><td className={styles.descriptionCell}><strong>{job.title || "Untitled job"}</strong><small>{shortDescription(job.description)}</small></td><td>{formatDate(job.created_at)}</td></tr>)}</tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className={styles.empty}><h2>{loading ? "Loading tracker..." : "No smashed jobs in the tracker yet"}</h2><p>Jobs appear here only after you press Smash in Approve Jobs.</p></div>
            )}
          </section>
        )}

        {tab === "history" && (
          <section className={styles.historyWrap}>
            <div className={styles.sheetCanvas} style={sheetStyle}>
              <table className={styles.sheet}>
                <thead><tr><th className={styles.rowNumber}>#</th><th className={styles.companyColumn}>Company</th><th className={styles.titleColumn}>Job title</th><th className={styles.locationColumn}>Location</th><th>Status</th><th className={styles.dateColumn}>Added</th><th className={styles.linkColumn}>Link</th></tr></thead>
                <tbody>{legacyJobs.map((job, index) => <tr key={job.id}><td className={styles.rowNumber}>{index + 1}</td><td className={styles.companyCell}><strong>{job.company || "Unknown"}</strong></td><td className={styles.titleCell}><strong>{job.title || "Untitled"}</strong></td><td>{job.location || "—"}</td><td>{job.status || "new"}</td><td>{formatDate(job.created_at)}</td><td>{job.apply_url ? <a className={styles.cleanLink} href={job.apply_url} target="_blank" rel="noreferrer">Open</a> : "—"}</td></tr>)}</tbody>
              </table>
            </div>
            {!loading && legacyJobs.length === 0 && <div className={styles.empty}><h2>No application history yet</h2></div>}
          </section>
        )}
      </div>
    </main>
  );
}
