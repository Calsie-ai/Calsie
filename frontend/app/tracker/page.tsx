"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseClient } from "../../lib/supabaseClient";
import { ACTION_TIMEOUTS, isAbortError, normaliseAppError, readJsonResponse, withActionTimeout } from "../../lib/actionState";
import { isTheme, THEME_STORAGE_KEY } from "../../lib/theme";
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
  status: "pending_review" | "approved" | "skipped" | string | null;
  created_at: string | null;
  selected_at: string | null;
  reviewed_at: string | null;
  batch_date: string | null;
  campaign_day: number | null;
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

type DayGroup = {
  key: string;
  batchDate: string | null;
  campaignDay: number | null;
  items: ReviewOpportunity[];
  waiting: number;
  approved: number;
  skipped: number;
};

const MIN_SHEET_ZOOM = 70;
const MAX_SHEET_ZOOM = 130;
const SHEET_ZOOM_STEP = 10;
const PAGE_SIZE = 500;
const MAX_HISTORY_ROWS = 5000;

function messageFrom(error: unknown, fallback: string) {
  return normaliseAppError(error, fallback) || fallback;
}

function formatDate(value: string | null) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function formatBatchDate(value: string | null) {
  if (!value) return "DATE NOT RECORDED";
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? value.toUpperCase()
    : date.toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();
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

function isPending(opportunity: ReviewOpportunity) {
  return !opportunity.status || opportunity.status === "pending_review";
}

function statusLabel(opportunity: ReviewOpportunity) {
  if (opportunity.status === "approved") return "Smashed";
  if (opportunity.status === "skipped") return "Passed";
  return "Awaiting review";
}

function statusClass(opportunity: ReviewOpportunity) {
  if (opportunity.status === "approved") return styles.statusSmashed;
  if (opportunity.status === "skipped") return styles.statusPassed;
  return styles.statusPending;
}

function groupOpportunities(items: ReviewOpportunity[]): DayGroup[] {
  const groups = new Map<string, ReviewOpportunity[]>();
  for (const item of items) {
    const key = `${item.batch_date || "unknown"}:${item.campaign_day ?? "unknown"}`;
    const group = groups.get(key) || [];
    group.push(item);
    groups.set(key, group);
  }

  return [...groups.entries()].map(([key, groupItems]) => ({
    key,
    batchDate: groupItems[0]?.batch_date || null,
    campaignDay: groupItems[0]?.campaign_day ?? null,
    items: groupItems,
    waiting: groupItems.filter(isPending).length,
    approved: groupItems.filter((item) => item.status === "approved").length,
    skipped: groupItems.filter((item) => item.status === "skipped").length,
  })).sort((a, b) => {
    const dateCompare = (b.batchDate || "").localeCompare(a.batchDate || "");
    if (dateCompare !== 0) return dateCompare;
    return (b.campaignDay || 0) - (a.campaignDay || 0);
  });
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
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [sheetZoom, setSheetZoom] = useState(100);
  const decisionGuardsRef = useRef(new Set<string>());
  const bulkGuardRef = useRef(false);
  const loadAbortRef = useRef<AbortController | null>(null);

  const pendingOpportunities = useMemo(() => opportunities.filter(isPending), [opportunities]);
  const approvedOpportunities = useMemo(() => opportunities.filter((item) => item.status === "approved"), [opportunities]);
  const skippedOpportunities = useMemo(() => opportunities.filter((item) => item.status === "skipped"), [opportunities]);
  const dayGroups = useMemo(() => groupOpportunities(opportunities), [opportunities]);
  const summary = useMemo(() => ({
    waiting: pendingOpportunities.length,
    approved: approvedOpportunities.length,
    skipped: skippedOpportunities.length,
    legacy: legacyJobs.length,
  }), [approvedOpportunities.length, legacyJobs.length, pendingOpportunities.length, skippedOpportunities.length]);
  const allSelected = pendingOpportunities.length > 0 && selectedIds.length === pendingOpportunities.length;
  const sheetStyle = { "--sheet-zoom": sheetZoom / 100 } as CSSProperties;

  function publishCounts(approvedCount: number) {
    if (window.parent !== window) {
      window.parent.postMessage({ type: "applix-tracker-counts", approvedCount }, window.location.origin);
    }
  }

  function initialiseExpandedGroups(groups: DayGroup[]) {
    setExpandedGroups((current) => {
      const next = { ...current };
      groups.forEach((group, index) => {
        if (!(group.key in next)) next[group.key] = index === 0 || group.waiting > 0;
      });
      return next;
    });
  }

  async function load(options: { quiet?: boolean } = {}) {
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;
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
        .abortSignal(controller.signal)
        .maybeSingle();
      if (campaignResult.error) throw campaignResult.error;

      const latestCampaign = campaignResult.data as Campaign | null;
      setCampaign(latestCampaign);

      const loadedOpportunities: ReviewOpportunity[] = [];
      if (latestCampaign?.id) {
        for (let offset = 0; offset < MAX_HISTORY_ROWS; offset += PAGE_SIZE) {
          const reviewResult = await supabase.rpc("get_review_opportunities_v2", {
            p_campaign_id: latestCampaign.id,
            p_limit: PAGE_SIZE,
            p_offset: offset,
            p_decision_status: null,
            p_campaign_day: null,
          }).abortSignal(controller.signal);
          if (reviewResult.error) throw reviewResult.error;
          const rows = (reviewResult.data || []) as ReviewOpportunity[];
          loadedOpportunities.push(...rows);
          if (rows.length < PAGE_SIZE) break;
        }
      }

      setOpportunities(loadedOpportunities);
      initialiseExpandedGroups(groupOpportunities(loadedOpportunities));
      publishCounts(loadedOpportunities.filter((item) => item.status === "approved").length);

      if (!options.quiet) {
        const legacyResult = await supabase
          .from("jobs")
          .select("id,title,company,location,status,apply_url,created_at")
          .eq("user_id", auth.data.user.id)
          .order("created_at", { ascending: false })
          .limit(500)
          .abortSignal(controller.signal);
        if (legacyResult.error) throw legacyResult.error;
        setLegacyJobs((legacyResult.data || []) as LegacyJob[]);
      }

      setSelectedIds((current) => current.filter((key) => loadedOpportunities.some((item) => isPending(item) && opportunityKey(item) === key)));
    } catch (loadError) {
      if (isAbortError(loadError)) return;
      setError(messageFrom(loadError, "Could not load the review history."));
      if (!options.quiet) {
        setOpportunities([]);
        setLegacyJobs([]);
      }
    } finally {
      if (loadAbortRef.current === controller) {
        loadAbortRef.current = null;
        if (!options.quiet) setLoading(false);
      }
    }
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load({ quiet: true }), 8000);
    return () => {
      window.clearInterval(timer);
      loadAbortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  // This page is embedded in a same-origin iframe on the dashboard. The
  // root layout's theme script already applies the stored theme on first
  // paint, but it runs once — so when the user flips the dashboard's
  // toggle while the frame is open, mirror that here too. `storage` only
  // fires in *other* documents sharing the origin, which is exactly this
  // case. Only the attribute is set: writing back to localStorage would
  // bounce the change between the two documents.
  useEffect(() => {
    function syncTheme(event: StorageEvent) {
      if (event.key !== THEME_STORAGE_KEY) return;
      if (isTheme(event.newValue)) {
        document.documentElement.setAttribute("data-theme", event.newValue);
      } else {
        document.documentElement.removeAttribute("data-theme");
      }
    }
    window.addEventListener("storage", syncTheme);
    return () => window.removeEventListener("storage", syncTheme);
  }, []);

  async function prepareApprovedApplications(campaignId: string, accessToken: string) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey) throw new Error("Missing Supabase environment variables.");

    const controller = new AbortController();
    const response = await withActionTimeout(fetch(`${supabaseUrl}/functions/v1/prepare-approved-applications`, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: anonKey, authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ campaign_id: campaignId, limit: 25 }),
      signal: controller.signal,
    }), ACTION_TIMEOUTS.ordinary, () => controller.abort());
    const payload = await readJsonResponse<{ ok?: boolean }>(response, "Application preparation failed.");
    if (payload.ok === false) throw new Error("Application preparation failed");
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
    if (result.data !== true) throw new Error(`${opportunity.company || opportunity.title || "Opportunity"} is no longer available for review.`);
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
    if (decisionGuardsRef.current.has(key) || bulkGuardRef.current || !isPending(opportunity)) return;
    decisionGuardsRef.current.add(key);
    setBusyId(key);
    setMessage("");
    setError("");

    try {
      await recordDecision(opportunity, decision);
      setSelectedIds((current) => current.filter((id) => id !== key));
      const reviewedAt = new Date().toISOString();
      const nextItems = opportunities.map((item) => opportunityKey(item) === key ? { ...item, status: decision, reviewed_at: reviewedAt } : item);
      setOpportunities(nextItems);
      publishCounts(nextItems.filter((item) => item.status === "approved").length);

      if (decision === "approved") {
        await prepareLiveJobs([opportunity]);
        setMessage(`Smashed. ${opportunityLabel(opportunity)} remains in Day ${opportunity.campaign_day || "?"} history.`);
      } else {
        setMessage(`Passed. ${opportunityLabel(opportunity)} remains in Day ${opportunity.campaign_day || "?"} history.`);
      }
    } catch (decisionError) {
      setError(messageFrom(decisionError, "Could not save the decision."));
      await load();
    } finally {
      decisionGuardsRef.current.delete(key);
      setBusyId(null);
    }
  }

  async function decideSelected(decision: Decision) {
    const items = pendingOpportunities.filter((item) => selectedIds.includes(opportunityKey(item)));
    if (!items.length || bulkGuardRef.current || decisionGuardsRef.current.size > 0) return;
    bulkGuardRef.current = true;
    setBulkBusy(true);
    setMessage("");
    setError("");

    try {
      for (const item of items) await recordDecision(item, decision);
      const decidedKeys = new Set(items.map(opportunityKey));
      const reviewedAt = new Date().toISOString();
      const nextItems = opportunities.map((item) => decidedKeys.has(opportunityKey(item)) ? { ...item, status: decision, reviewed_at: reviewedAt } : item);
      setSelectedIds([]);
      setOpportunities(nextItems);
      publishCounts(nextItems.filter((item) => item.status === "approved").length);
      if (decision === "approved") await prepareLiveJobs(items);
      setMessage(`${items.length} opportunities ${decision === "approved" ? "smashed" : "passed"}. They remain visible in their original day groups.`);
    } catch (bulkError) {
      setError(messageFrom(bulkError, "Could not complete the bulk decision."));
      await load();
    } finally {
      bulkGuardRef.current = false;
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
    setSheetZoom((current) => Math.min(MAX_SHEET_ZOOM, Math.max(MIN_SHEET_ZOOM, current + (direction === "in" ? SHEET_ZOOM_STEP : -SHEET_ZOOM_STEP))));
  }

  return (
    <main className={`${styles.shell} ${embedded ? styles.embedded : ""}`}>
      <div className={styles.page}>
        {!embedded && (
          <header className={styles.header}>
            <div>
              <Link href="/dashboard?panel=tracker" className={styles.backLink}>← Back to dashboard</Link>
              <p className={styles.eyebrow}>Calsie opportunities</p>
              <h1>{tab === "review" ? "Smash or Pass" : tab === "tracker" ? "Opportunity tracker" : "Application history"}</h1>
              <p className={styles.subtitle}>{campaign ? `${campaign.name || campaign.target_business_type || "Campaign"} · ${campaign.location || "Location not set"}` : "No campaign selected"}</p>
            </div>
            <button type="button" onClick={() => void load()} disabled={loading} className={styles.reload}>{loading ? "Loading..." : "Reload"}</button>
          </header>
        )}

        <section className={styles.summary}>
          <div className={styles.summaryCard}><span>Awaiting approval</span><strong>{summary.waiting}</strong><small>Across all campaign days</small></div>
          <div className={styles.summaryCard}><span>Smashed</span><strong>{summary.approved}</strong><small>Kept in daily history</small></div>
          <div className={styles.summaryCard}><span>Passed</span><strong>{summary.skipped}</strong><small>Kept in daily history</small></div>
        </section>

        <div className={styles.trackerNav}>
          <div className={styles.tabs}>
            <button type="button" onClick={() => setTab("review")} className={`${styles.tab} ${tab === "review" ? styles.activeTab : ""}`}>Smash or Pass</button>
            <button type="button" onClick={() => setTab("tracker")} className={`${styles.tab} ${tab === "tracker" ? styles.activeTab : ""}`}>Tracker</button>
            <button type="button" onClick={() => setTab("history")} className={`${styles.tab} ${tab === "history" ? styles.activeTab : ""}`}>Application History</button>
          </div>
          <div className={styles.zoomControls} aria-label="Tracker sheet zoom controls">
            <button type="button" onClick={() => zoomSheet("out")} disabled={sheetZoom <= MIN_SHEET_ZOOM} aria-label="Zoom tracker sheet out">−</button>
            <button type="button" className={styles.zoomValue} onClick={() => setSheetZoom(100)} aria-label="Reset tracker sheet zoom to 100 percent">{sheetZoom}%</button>
            <button type="button" onClick={() => zoomSheet("in")} disabled={sheetZoom >= MAX_SHEET_ZOOM} aria-label="Zoom tracker sheet in">+</button>
          </div>
        </div>

        {message && <p className={styles.notice} role="status" aria-live="polite">{message}</p>}
        {error && <p className={styles.error} role="alert">{error}</p>}

        {tab === "review" && (
          <section>
            <div className={styles.toolbar}>
              <span className={styles.toolbarLabel}>{pendingOpportunities.length} awaiting approval · {selectedIds.length} selected · {opportunities.length} total history</span>
              <div className={styles.toolbarRight}>
                <button type="button" className={styles.skipSelected} disabled={!selectedIds.length || bulkBusy} onClick={() => void decideSelected("skipped")}>Pass selected</button>
                <button type="button" className={styles.approveSelected} disabled={!selectedIds.length || bulkBusy} onClick={() => void decideSelected("approved")}>{bulkBusy ? "Working..." : "Smash selected"}</button>
              </div>
            </div>

            {dayGroups.length > 0 ? (
              <div className={styles.dayGroups}>
                {dayGroups.map((group, groupIndex) => {
                  const expanded = expandedGroups[group.key] ?? (groupIndex === 0 || group.waiting > 0);
                  const pendingInGroup = group.items.filter(isPending);
                  const allGroupSelected = pendingInGroup.length > 0 && pendingInGroup.every((item) => selectedIds.includes(opportunityKey(item)));
                  return (
                    <section key={group.key} className={styles.dayGroup}>
                      <button type="button" className={styles.dayHeader} onClick={() => setExpandedGroups((current) => ({ ...current, [group.key]: !expanded }))} aria-expanded={expanded}>
                        <span>
                          <strong>DAY {group.campaignDay || "?"} — {formatBatchDate(group.batchDate)}</strong>
                          <small>{group.items.length} total · {group.waiting} awaiting · {group.approved} smashed · {group.skipped} passed</small>
                        </span>
                        <b>{expanded ? "−" : "+"}</b>
                      </button>

                      {expanded && (
                        <div className={styles.sheetWrap}>
                          <div className={styles.sheetCanvas} style={sheetStyle}>
                            <table className={styles.sheet}>
                              <thead>
                                <tr>
                                  <th className={styles.rowNumber}>#</th>
                                  <th className={styles.checkColumn}><input aria-label={`Select all waiting opportunities for Day ${group.campaignDay || "unknown"}`} type="checkbox" disabled={!pendingInGroup.length} checked={allGroupSelected} onChange={() => {
                                    const groupKeys = pendingInGroup.map(opportunityKey);
                                    setSelectedIds((current) => allGroupSelected ? current.filter((key) => !groupKeys.includes(key)) : [...new Set([...current, ...groupKeys])]);
                                  }} /></th>
                                  <th className={styles.scoreColumn}>AI score</th>
                                  <th className={styles.titleColumn}>Opportunity</th>
                                  <th className={styles.companyColumn}>Company</th>
                                  <th className={styles.locationColumn}>Location</th>
                                  <th className={styles.linkColumn}>Contact</th>
                                  <th className={styles.actionColumn}>Status / decision</th>
                                </tr>
                              </thead>
                              <tbody>
                                {group.items.map((item, index) => {
                                  const key = opportunityKey(item);
                                  const selected = selectedIds.includes(key);
                                  const pending = isPending(item);
                                  return (
                                    <tr key={key} className={selected ? styles.selectedRow : ""}>
                                      <td className={styles.rowNumber}>{index + 1}</td>
                                      <td className={styles.checkColumn}><input aria-label={`Select ${item.company || item.title || "opportunity"}`} type="checkbox" disabled={!pending} checked={selected} onChange={() => toggleSelected(key)} /></td>
                                      <td><span className={styles.score}>{item.ai_role_relevance_score ?? "Fit"}</span></td>
                                      <td className={styles.titleCell} title={item.ai_reason || item.description || ""}>
                                        <strong>{item.title || opportunityLabel(item)}</strong>
                                        <small>{groupIndex === 0 && pending ? "New · " : ""}{opportunityLabel(item)} · {shortDescription(item.ai_reason || item.description)}</small>
                                      </td>
                                      <td className={styles.companyCell}><strong>{item.company || "Unknown company"}</strong><small>{item.source || "Source not saved"}</small></td>
                                      <td>{item.location || "—"}</td>
                                      <td>{item.apply_url ? <a className={styles.openLink} href={item.apply_url} target="_blank" rel="noreferrer">Open</a> : "Private"}</td>
                                      <td>
                                        {pending ? (
                                          <div className={styles.actions}>
                                            <button type="button" className={styles.skip} disabled={busyId === key || bulkBusy} onClick={() => void decide(item, "skipped")}>Pass</button>
                                            <button type="button" className={styles.approve} disabled={busyId === key || bulkBusy} onClick={() => void decide(item, "approved")}>{busyId === key ? "..." : "Smash"}</button>
                                          </div>
                                        ) : <span className={`${styles.statusBadge} ${statusClass(item)}`}>{statusLabel(item)}</span>}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            ) : <div className={styles.empty}><h2>{loading ? "Loading review history..." : "No campaign opportunities yet"}</h2><p>Each successful daily batch will appear here by campaign day.</p></div>}
          </section>
        )}

        {tab === "tracker" && (
          <section className={styles.trackerSheetSection}>
            <div className={styles.trackerTitleRow}><strong>CALSIE TRACKER</strong><span>{approvedOpportunities.length} smashed opportunit{approvedOpportunities.length === 1 ? "y" : "ies"}</span></div>
            {approvedOpportunities.length > 0 ? (
              <div className={styles.historyWrap}><div className={styles.sheetCanvas} style={sheetStyle}><table className={`${styles.sheet} ${styles.trackerSheet}`}>
                <thead><tr><th className={styles.companyColumn}>Company</th><th className={styles.linkColumn}>Type / URL</th><th className={styles.descriptionColumn}>Description</th><th className={styles.dateColumn}>Campaign day</th><th className={styles.dateColumn}>Smashed at</th></tr></thead>
                <tbody>{approvedOpportunities.map((item) => <tr key={opportunityKey(item)}><td className={styles.companyCell}><strong>{item.company || "Unknown company"}</strong></td><td>{item.apply_url ? <a className={styles.cleanLink} href={item.apply_url} target="_blank" rel="noreferrer">{item.opportunity_type === "live_job" ? "Open job" : "Open website"}</a> : opportunityLabel(item)}</td><td className={styles.descriptionCell}><strong>{item.title || opportunityLabel(item)}</strong><small>{shortDescription(item.ai_reason || item.description)}</small></td><td>Day {item.campaign_day || "?"}<br />{formatBatchDate(item.batch_date)}</td><td>{formatDate(item.reviewed_at)}</td></tr>)}</tbody>
              </table></div></div>
            ) : <div className={styles.empty}><h2>{loading ? "Loading tracker..." : "No smashed opportunities yet"}</h2><p>Items appear here after you press Smash.</p></div>}
          </section>
        )}

        {tab === "history" && (
          <section className={styles.historyWrap}>
            <div className={styles.sheetCanvas} style={sheetStyle}><table className={styles.sheet}>
              <thead><tr><th className={styles.rowNumber}>#</th><th className={styles.companyColumn}>Company</th><th className={styles.titleColumn}>Job title</th><th className={styles.locationColumn}>Location</th><th>Status</th><th className={styles.dateColumn}>Added</th><th className={styles.linkColumn}>Link</th></tr></thead>
              <tbody>{legacyJobs.map((job, index) => <tr key={job.id}><td className={styles.rowNumber}>{index + 1}</td><td className={styles.companyCell}><strong>{job.company || "Unknown"}</strong></td><td className={styles.titleCell}><strong>{job.title || "Untitled"}</strong></td><td>{job.location || "—"}</td><td>{job.status || "new"}</td><td>{formatDate(job.created_at)}</td><td>{job.apply_url ? <a className={styles.cleanLink} href={job.apply_url} target="_blank" rel="noreferrer">Open</a> : "—"}</td></tr>)}</tbody>
            </table></div>
            {!loading && legacyJobs.length === 0 && <div className={styles.empty}><h2>No application history yet</h2></div>}
          </section>
        )}
      </div>
    </main>
  );
}
