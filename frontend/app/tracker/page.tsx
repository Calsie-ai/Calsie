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

type ReviewOpportunity = {
  opportunity_type: "live_job" | "direct_company";
  review_id: string;
  id: string | null;
  campaign_id: string;
  title: string | null;
  company: string | null;
  location: string | null;
  source: string | null;
  apply_url: string | null;
  extracted_email: string | null;
  description: string | null;
  status: string | null;
  created_at: string | null;
  ai_role_relevance_score?: number | null;
  ai_reason?: string | null;
  service_categories?: string[] | null;
  service_postcodes?: string[] | null;
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

function opportunityKey(opportunity: ReviewOpportunity) {
  return `${opportunity.opportunity_type}:${opportunity.review_id}`;
}

function opportunityLabel(opportunity: ReviewOpportunity) {
  return opportunity.opportunity_type === "direct_company" ? "Direct company outreach" : "Live job";
}

export default function TrackerPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const embedded = searchParams.get("embedded") === "1";
  const requestedView = searchParams.get("view");
  const [tab, setTab] = useState<Tab>(initialTab(requestedView));
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [opportunities, setOpportunities] = useState<ReviewOpportunity[]>([]);
  const [legacyJobs, setLegacyJobs] = useState<LegacyJob[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [sheetZoom, setSheetZoom] = useState(100);

  const pendingOpportunities = useMemo(
    () => opportunities.filter((item) => item.status !== "approved"),
    [opportunities],
  );
  const approvedOpportunities = useMemo(
    () => opportunities.filter((item) => item.status === "approved"),
    [opportunities],
  );
  const summary = useMemo(
    () => ({ waiting: pendingOpportunities.length, approved: approvedOpportunities.length, legacy: legacyJobs.length }),
    [pendingOpportunities.length, approvedOpportunities.length, legacyJobs.length],
  );
  const allSelected = pendingOpportunities.length > 0 && selectedIds.length === pendingOpportunities.length;
  const sheetStyle = { "--sheet-zoom": sheetZoom / 100 } as CSSProperties;

  function publishCounts(approvedCount: number) {
    if (window.parent !== window) {
      window.parent.postMessage({ type: "applix-tracker-counts", approvedCount }, window.location.origin);
    }
  }

  async function load(options: { quiet?: boolean } = {}) {
    if (!options.quiet) setLoading(true);
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

      let loadedOpportunities: ReviewOpportunity[] = [];
      if (latestCampaign?.id) {
        const reviewResult = await supabase.rpc("get_review_opportunities", {
          p_campaign_id: latestCampaign.id,
          p_limit: 100,
        });
        if (reviewResult.error) throw reviewResult.error;
        loadedOpportunities = (reviewResult.data || []) as ReviewOpportunity[];
      }
      setOpportunities(loadedOpportunities);
      publishCounts(loadedOpportunities.filter((item) => item.status === "approved").length);

      if (!options.quiet) {
        const legacyResult = await supabase
          .from("jobs")
          .select("id,title,company,location,status,apply_url,created_at")
          .eq("user_id", auth.data.user.id)
          .order("created_at", { ascending: false })
          .limit(500);
        if (legacyResult.error) throw legacyResult.error;
        setLegacyJobs((legacyResult.data || []) as LegacyJob[]);
      }
      setSelectedIds((current) => current.filter((key) => loadedOpportunities.some((item) => opportunityKey(item) === key)));
    } catch (loadError) {
      setError(messageFrom(loadError, "Could not load the review queue."));
      if (!options.quiet) {
        setOpportunities([]);
        setLegacyJobs([]);
      }
    } finally {
      if (!options.quiet) setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load({ quiet: true }), 8000);
    return () => window.clearInterval(timer);
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

  async function recordDecision(opportunity: ReviewOpportunity, decision: Decision) {
    const supabase = getSupabaseClient();
    const result = await supabase.rpc("decide_campaign_opportunity", {
      p_opportunity_type: opportunity.opportunity_type,
      p_review_id: opportunity.review_id,
      p_decision: decision,
    });
    if (result.error) throw result.error;
    if (result.data !== true) {
      throw new Error(`${opportunity.company || opportunity.title || "Opportunity"} is no longer available for review.`);
    }
  }

  async function prepareLiveJobs(items: ReviewOpportunity[]) {
    if (!items.some((item) => item.opportunity_type === "live_job")) return null;
    const supabase = getSupabaseClient();
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) throw new Error("Please sign in again.");
    return prepareApprovedApplications(items[0].campaign_id, token);
  }

  async function decide(opportunity: ReviewOpportunity, decision: Decision) {
    const key = opportunityKey(opportunity);
    if (busyId || bulkBusy || opportunity.status === "approved") return;
    setBusyId(key);
    setMessage("");
    setError("");
    try {
      await recordDecision(opportunity, decision);
      setSelectedIds((current) => current.filter((id) => id !== key));

      if (decision === "skipped") {
        setOpportunities((current) => current.filter((item) => opportunityKey(item) !== key));
        setMessage(`Passed. ${opportunityLabel(opportunity)} was removed from the review queue.`);
        return;
      }

      const now = new Date().toISOString();
      const nextItems = opportunities.map((item) =>
        opportunityKey(item) === key ? { ...item, status: "approved", created_at: now } : item,
      );
      setOpportunities(nextItems);
      publishCounts(nextItems.filter((item) => item.status === "approved").length);

      if (opportunity.opportunity_type === "live_job") {
        await prepareLiveJobs([opportunity]);
        setMessage("Smashed. The live job was added to your tracker and prepared for review. Nothing was sent.");
      } else {
        setMessage("Smashed. The company opportunity was saved to your tracker. Nothing was drafted or sent.");
      }
      if (!embedded) setTab("tracker");
    } catch (decisionError) {
      setError(messageFrom(decisionError, "Could not save the decision."));
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function decideSelected(decision: Decision) {
    const items = pendingOpportunities.filter((item) => selectedIds.includes(opportunityKey(item)));
    if (!items.length || bulkBusy || busyId) return;
    setBulkBusy(true);
    setMessage("");
    setError("");
    try {
      for (const item of items) await recordDecision(item, decision);
      const decidedKeys = new Set(items.map(opportunityKey));
      setSelectedIds([]);

      if (decision === "skipped") {
        setOpportunities((current) => current.filter((item) => !decidedKeys.has(opportunityKey(item))));
        setMessage(`${items.length} opportunities passed and removed from the review queue.`);
        return;
      }

      const now = new Date().toISOString();
      const nextItems = opportunities.map((item) =>
        decidedKeys.has(opportunityKey(item)) ? { ...item, status: "approved", created_at: now } : item,
      );
      setOpportunities(nextItems);
      publishCounts(nextItems.filter((item) => item.status === "approved").length);
      await prepareLiveJobs(items);
      const companyCount = items.filter((item) => item.opportunity_type === "direct_company").length;
      const jobCount = items.length - companyCount;
      setMessage(`${items.length} opportunities smashed (${jobCount} live jobs, ${companyCount} direct companies). Nothing was sent.`);
      if (!embedded) setTab("tracker");
    } catch (bulkError) {
      setError(messageFrom(bulkError, "Could not complete the bulk decision."));
      await load();
    } finally {
      setBulkBusy(false);
    }
  }

  function toggleSelected(key: string) {
    setSelectedIds((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  }

  function toggleAll() {
    setSelectedIds(allSelected ? [] : pendingOpportunities.map(opportunityKey));
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
              <p className={styles.eyebrow}>Calsie opportunities</p>
              <h1>{tab === "review" ? "Smash or Pass" : tab === "tracker" ? "Opportunity tracker" : "Application history"}</h1>
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
          <div className={styles.summaryCard}><span>Awaiting approval</span><strong>{summary.waiting}</strong><small>Live jobs and direct companies</small></div>
          <div className={styles.summaryCard}><span>Tracker</span><strong>{summary.approved}</strong><small>Added after Smash</small></div>
          <div className={styles.summaryCard}><span>Application history</span><strong>{summary.legacy}</strong><small>Total application records</small></div>
        </section>

        <div className={styles.trackerNav}>
          <div className={styles.tabs}>
            <button onClick={() => setTab("review")} className={`${styles.tab} ${tab === "review" ? styles.activeTab : ""}`}>Smash or Pass</button>
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
              <span className={styles.toolbarLabel}>{pendingOpportunities.length} awaiting approval · {selectedIds.length} selected</span>
              <div className={styles.toolbarRight}>
                <button className={styles.skipSelected} disabled={!selectedIds.length || bulkBusy} onClick={() => void decideSelected("skipped")}>Pass selected</button>
                <button className={styles.approveSelected} disabled={!selectedIds.length || bulkBusy} onClick={() => void decideSelected("approved")}>{bulkBusy ? "Working..." : "Smash selected"}</button>
              </div>
            </div>

            {pendingOpportunities.length > 0 ? (
              <div className={styles.sheetWrap}>
                <div className={styles.sheetCanvas} style={sheetStyle}>
                  <table className={styles.sheet}>
                    <thead>
                      <tr>
                        <th className={styles.rowNumber}>#</th>
                        <th className={styles.checkColumn}><input aria-label="Select all waiting opportunities" type="checkbox" checked={allSelected} onChange={toggleAll} /></th>
                        <th className={styles.scoreColumn}>AI score</th>
                        <th className={styles.titleColumn}>Opportunity</th>
                        <th className={styles.companyColumn}>Company</th>
                        <th className={styles.locationColumn}>Location</th>
                        <th className={styles.linkColumn}>Contact</th>
                        <th className={styles.actionColumn}>Decision</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingOpportunities.map((item, index) => {
                        const key = opportunityKey(item);
                        const selected = selectedIds.includes(key);
                        return (
                          <tr key={key} className={selected ? styles.selectedRow : ""}>
                            <td className={styles.rowNumber}>{index + 1}</td>
                            <td className={styles.checkColumn}><input aria-label={`Select ${item.company || item.title || "opportunity"}`} type="checkbox" checked={selected} onChange={() => toggleSelected(key)} /></td>
                            <td><span className={styles.score}>{item.ai_role_relevance_score ?? "Fit"}</span></td>
                            <td className={styles.titleCell} title={item.ai_reason || item.description || ""}>
                              <strong>{item.title || opportunityLabel(item)}</strong>
                              <small>{opportunityLabel(item)} · {shortDescription(item.ai_reason || item.description)}</small>
                            </td>
                            <td className={styles.companyCell}>
                              <strong>{item.company || "Unknown company"}</strong>
                              <small>{item.source || "Source not saved"}</small>
                            </td>
                            <td>{item.location || "—"}</td>
                            <td>
                              {item.apply_url ? <a className={styles.openLink} href={item.apply_url} target="_blank" rel="noreferrer">Open</a> : item.extracted_email || "—"}
                            </td>
                            <td>
                              <div className={styles.actions}>
                                <button className={styles.skip} disabled={busyId === key || bulkBusy} onClick={() => void decide(item, "skipped")}>Pass</button>
                                <button className={styles.approve} disabled={busyId === key || bulkBusy} onClick={() => void decide(item, "approved")}>{busyId === key ? "..." : "Smash"}</button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className={styles.empty}><h2>{loading ? "Loading review queue..." : "No opportunities awaiting approval"}</h2><p>AI-matched live jobs and direct company opportunities will appear here.</p></div>
            )}
          </section>
        )}

        {tab === "tracker" && (
          <section className={styles.trackerSheetSection}>
            <div className={styles.trackerTitleRow}>
              <strong>CALSIE TRACKER</strong>
              <span>{approvedOpportunities.length} smashed opportunit{approvedOpportunities.length === 1 ? "y" : "ies"}</span>
            </div>
            {approvedOpportunities.length > 0 ? (
              <div className={styles.historyWrap}>
                <div className={styles.sheetCanvas} style={sheetStyle}>
                  <table className={`${styles.sheet} ${styles.trackerSheet}`}>
                    <thead><tr><th className={styles.companyColumn}>Company</th><th className={styles.linkColumn}>Type / URL</th><th className={styles.descriptionColumn}>Description</th><th className={styles.dateColumn}>Smashed at</th></tr></thead>
                    <tbody>{approvedOpportunities.map((item) => <tr key={opportunityKey(item)}><td className={styles.companyCell}><strong>{item.company || "Unknown company"}</strong><small>{item.extracted_email || ""}</small></td><td>{item.apply_url ? <a className={styles.cleanLink} href={item.apply_url} target="_blank" rel="noreferrer">{item.opportunity_type === "live_job" ? "Open job" : "Open website"}</a> : opportunityLabel(item)}</td><td className={styles.descriptionCell}><strong>{item.title || opportunityLabel(item)}</strong><small>{shortDescription(item.ai_reason || item.description)}</small></td><td>{formatDate(item.created_at)}</td></tr>)}</tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className={styles.empty}><h2>{loading ? "Loading tracker..." : "No smashed opportunities yet"}</h2><p>Items appear here only after you press Smash.</p></div>
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