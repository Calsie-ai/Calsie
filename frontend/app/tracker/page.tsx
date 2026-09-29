"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseClient } from "../../lib/supabaseClient";
import { isAbortError, normaliseAppError } from "../../lib/actionState";
import { isTheme, THEME_STORAGE_KEY } from "../../lib/theme";
import JobSwipeDeck from "./JobSwipeDeck";
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
  source_job_id?: number | null;
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
  salary?: string | null;
  job_type?: string | null;
  posted_at?: string | null;
  company_logo?: string | null;
};

type CategoryFeedResponse = {
  ok?: boolean;
  error?: string;
  message?: string;
  agent?: { id: string; name: string; status: string; category: "disability" | "childcare" | "aged_care" } | null;
  agents?: Array<{ id: string; name: string; status: string; category: "disability" | "childcare" | "aged_care" }>;
  pool?: "disability" | "childcare" | "aged_care" | null;
  source_table?: string | null;
  campaigns?: Array<{ id: string; name: string | null; pool: "disability" | "childcare" | "aged_care"; template_slug: string }>;
  opportunities?: ReviewOpportunity[];
};

type Tab = "review" | "tracker" | "history";
type Decision = "approved" | "skipped";

const CATEGORY_JOB_FEED_URL = "https://ibgmpamvkvjzdxirzxzr.supabase.co/functions/v1/calsie-agent-feed";
const MIN_SHEET_ZOOM = 70;
const MAX_SHEET_ZOOM = 130;
const SHEET_ZOOM_STEP = 10;

function messageFrom(error: unknown, fallback: string) {
  return normaliseAppError(error, fallback) || fallback;
}

function formatDate(value: string | null) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function formatBatchDate(value: string | null) {
  if (!value) return "DATE NOT RECORDED";
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value.toUpperCase() : date.toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();
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

async function categoryFeed(token: string, body: Record<string, unknown>, signal?: AbortSignal) {
  const response = await fetch(CATEGORY_JOB_FEED_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    signal,
  });
  const payload = await response.json().catch(() => ({})) as CategoryFeedResponse;
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Could not load the category job feed (${response.status}).`);
  }
  return payload;
}

export default function TrackerPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const embedded = searchParams.get("embedded") === "1";
  const requestedView = searchParams.get("view");
  const [tab, setTab] = useState<Tab>(initialTab(requestedView));
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [agentCampaigns, setAgentCampaigns] = useState<NonNullable<CategoryFeedResponse["campaigns"]>>([]);
  const [feedMessage, setFeedMessage] = useState("");
  const [opportunities, setOpportunities] = useState<ReviewOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [sheetZoom, setSheetZoom] = useState(100);
  const decisionGuardsRef = useRef(new Set<string>());
  const loadAbortRef = useRef<AbortController | null>(null);
  const selectedCampaignRef = useRef("");
  const userIdRef = useRef("");

  const pendingOpportunities = useMemo(() => opportunities.filter(isPending), [opportunities]);
  const approvedOpportunities = useMemo(() => opportunities.filter((item) => item.status === "approved"), [opportunities]);
  const skippedOpportunities = useMemo(() => opportunities.filter((item) => item.status === "skipped"), [opportunities]);
  const currentOpportunity = pendingOpportunities[0] || null;
  const summary = useMemo(() => ({ waiting: pendingOpportunities.length, approved: approvedOpportunities.length, skipped: skippedOpportunities.length }), [approvedOpportunities.length, pendingOpportunities.length, skippedOpportunities.length]);
  const sheetStyle = { "--sheet-zoom": sheetZoom / 100 } as CSSProperties;

  function publishCounts(items: ReviewOpportunity[], campaignId: string | null) {
    if (window.parent !== window) window.parent.postMessage({
      type: "applix-tracker-counts",
      campaignId,
      approvedCount: items.filter((item) => item.status === "approved").length,
      passedCount: items.filter((item) => item.status === "skipped").length,
    }, window.location.origin);
  }

  async function load(options: { quiet?: boolean; campaignId?: string } = {}) {
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;
    if (!options.quiet) setLoading(true);
    setError("");

    try {
      const supabase = getSupabaseClient();
      const sessionResult = await supabase.auth.getSession();
      const session = sessionResult.data.session;
      if (sessionResult.error || !session?.user || !session.access_token) {
        router.replace("/");
        return;
      }
      userIdRef.current = session.user.id;

      const storageKey = `calsie:agent-campaign:${session.user.id}`;
      let selectedId = options.campaignId ?? selectedCampaignRef.current;
      if (!selectedId) selectedId = window.localStorage.getItem(storageKey) || "";
      let feed: CategoryFeedResponse;
      try {
        feed = await categoryFeed(session.access_token, { action: "feed", ...(selectedId ? { agent_id: selectedId } : {}) }, controller.signal);
      } catch (feedError) {
        if (!selectedId || !(feedError instanceof Error) || !feedError.message.includes("unavailable to your account")) throw feedError;
        window.localStorage.removeItem(storageKey);
        feed = await categoryFeed(session.access_token, { action: "feed" }, controller.signal);
      }
      const loadedOpportunities = feed.opportunities || [];
      selectedCampaignRef.current = feed.agent?.id || "";
      setAgentCampaigns((feed.agents || []).map((item) => ({ ...item, pool: item.category, template_slug: item.category })));
      setFeedMessage(feed.message || "");
      setCampaign(feed.agent ? { id: feed.agent.id, name: feed.agent.name, status: feed.agent.status, location: null, target_business_type: feed.agent.category } : null);
      setOpportunities(loadedOpportunities);
      publishCounts(loadedOpportunities, feed.agent?.id || null);
    } catch (loadError) {
      if (isAbortError(loadError)) return;
      setError(messageFrom(loadError, "Could not load your category job feed."));
      if (!options.quiet) {
        setOpportunities([]);
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
    const timer = window.setInterval(() => void load({ quiet: true }), 30000);
    return () => {
      window.clearInterval(timer);
      loadAbortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  useEffect(() => {
    function syncTheme(event: StorageEvent) {
      if (event.key !== THEME_STORAGE_KEY) return;
      if (isTheme(event.newValue)) document.documentElement.setAttribute("data-theme", event.newValue);
      else document.documentElement.removeAttribute("data-theme");
    }
    window.addEventListener("storage", syncTheme);
    return () => window.removeEventListener("storage", syncTheme);
  }, []);

  async function recordDecision(opportunity: ReviewOpportunity, decision: Decision) {
    const sourceJobId = Number(opportunity.source_job_id ?? opportunity.id);
    if (!Number.isSafeInteger(sourceJobId) || sourceJobId <= 0) throw new Error("This Apify job does not have a valid source id.");

    const supabase = getSupabaseClient();
    const sessionResult = await supabase.auth.getSession();
    const token = sessionResult.data.session?.access_token;
    if (!token) throw new Error("Please sign in again.");

    await categoryFeed(token, { action: "decide", agent_id: opportunity.campaign_id, source_job_id: sourceJobId, decision });
  }

  async function decide(opportunity: ReviewOpportunity, decision: Decision) {
    const key = opportunityKey(opportunity);
    if (decisionGuardsRef.current.has(key) || !isPending(opportunity)) return;
    decisionGuardsRef.current.add(key);
    setBusyId(key);
    setMessage("");
    setError("");

    try {
      await recordDecision(opportunity, decision);
      const reviewedAt = new Date().toISOString();
      const nextItems = opportunities.map((item) => opportunityKey(item) === key ? { ...item, status: decision, reviewed_at: reviewedAt } : item);
      setOpportunities(nextItems);
      publishCounts(nextItems, campaign?.id || null);
      setMessage(decision === "approved" ? "Smashed. This job has been saved to your Calsie review decisions." : "Passed. This job has been removed from your waiting feed.");
    } catch (decisionError) {
      setError(messageFrom(decisionError, "Could not save the decision."));
      await load();
    } finally {
      decisionGuardsRef.current.delete(key);
      setBusyId(null);
    }
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

        <div className={styles.agentPicker}>
          <label htmlFor="active-care-agent">Active care agent</label>
          <select
            id="active-care-agent"
            value={campaign?.id || ""}
            disabled={loading || agentCampaigns.length === 0}
            onChange={(event) => {
              const id = event.target.value;
              selectedCampaignRef.current = id;
              if (userIdRef.current) window.localStorage.setItem(`calsie:agent-campaign:${userIdRef.current}`, id);
              void load({ campaignId: id });
            }}
          >
            {agentCampaigns.length === 0 && <option value="">No active care agent</option>}
            {agentCampaigns.map((item) => <option key={item.id} value={item.id}>{item.pool === "disability" ? "Disability Agent" : item.pool === "childcare" ? "Childcare Agent" : "Aged Care Agent"} · {item.name || "Campaign"}</option>)}
          </select>
          {!campaign && <Link href="/dashboard">Choose an agent</Link>}
        </div>
        {feedMessage && <p className={styles.notice} role="status">{feedMessage}</p>}
        {tab !== "review" && (
          <section className={styles.summary}>
            <div className={styles.summaryCard}><span>Loaded for review</span><strong>{summary.waiting}</strong><small>More jobs load as you review</small></div>
            <div className={styles.summaryCard}><span>Smashed</span><strong>{summary.approved}</strong><small>Saved review decisions</small></div>
            <div className={styles.summaryCard}><span>Passed</span><strong>{summary.skipped}</strong><small>Saved review decisions</small></div>
          </section>
        )}

        {!embedded && (
          <div className={styles.trackerNav}>
            <div className={styles.tabs}>
              <button type="button" onClick={() => setTab("review")} className={`${styles.tab} ${tab === "review" ? styles.activeTab : ""}`}>Smash or Pass</button>
              <button type="button" onClick={() => setTab("tracker")} className={`${styles.tab} ${tab === "tracker" ? styles.activeTab : ""}`}>Tracker</button>
              <button type="button" onClick={() => setTab("history")} className={`${styles.tab} ${tab === "history" ? styles.activeTab : ""}`}>Application History</button>
            </div>
            {tab !== "review" ? (
              <div className={styles.zoomControls} aria-label="Tracker sheet zoom controls">
                <button type="button" onClick={() => zoomSheet("out")} disabled={sheetZoom <= MIN_SHEET_ZOOM} aria-label="Zoom tracker sheet out">−</button>
                <button type="button" className={styles.zoomValue} onClick={() => setSheetZoom(100)} aria-label="Reset tracker sheet zoom to 100 percent">{sheetZoom}%</button>
                <button type="button" onClick={() => zoomSheet("in")} disabled={sheetZoom >= MAX_SHEET_ZOOM} aria-label="Zoom tracker sheet in">+</button>
              </div>
            ) : null}
          </div>
        )}

        {message && <p className={styles.notice} role="status" aria-live="polite">{message}</p>}
        {error && <p className={styles.error} role="alert">{error}</p>}

        {tab === "review" && (
          <JobSwipeDeck
            job={currentOpportunity}
            waitingCount={pendingOpportunities.length}
            busy={currentOpportunity ? busyId === opportunityKey(currentOpportunity) : false}
            onSmash={(job) => void decide(job, "approved")}
            onPass={(job) => void decide(job, "skipped")}
          />
        )}

        {tab === "tracker" && (
          <section className={styles.trackerSheetSection}>
            <div className={styles.trackerTitleRow}><strong>CALSIE TRACKER</strong><span>{approvedOpportunities.length} smashed opportunit{approvedOpportunities.length === 1 ? "y" : "ies"}</span></div>
            {approvedOpportunities.length > 0 ? (
              <div className={styles.historyWrap}><div className={styles.sheetCanvas} style={sheetStyle}><table className={`${styles.sheet} ${styles.trackerSheet}`}>
                <thead><tr><th className={styles.companyColumn}>Company</th><th className={styles.linkColumn}>Type / URL</th><th className={styles.descriptionColumn}>Description</th><th className={styles.dateColumn}>Posted</th><th className={styles.dateColumn}>Smashed at</th></tr></thead>
                <tbody>{approvedOpportunities.map((item) => <tr key={opportunityKey(item)}><td className={styles.companyCell}><strong>{item.company || "Unknown company"}</strong></td><td>{item.apply_url ? <a className={styles.cleanLink} href={item.apply_url} target="_blank" rel="noreferrer">Open job</a> : opportunityLabel(item)}</td><td className={styles.descriptionCell}><strong>{item.title || opportunityLabel(item)}</strong><small>{shortDescription(item.ai_reason || item.description)}</small></td><td>{formatBatchDate(item.batch_date)}</td><td>{formatDate(item.reviewed_at)}</td></tr>)}</tbody>
              </table></div></div>
            ) : <div className={styles.empty}><h2>{loading ? "Loading tracker..." : "No smashed opportunities yet"}</h2><p>Items appear here after you press Smash.</p></div>}
          </section>
        )}

        {tab === "history" && (
          <>
          <section className={styles.trackerSheetSection}>
            <div className={styles.trackerTitleRow}><strong>REVIEW HISTORY</strong><span>{approvedOpportunities.length + skippedOpportunities.length} decisions</span></div>
            <div className={styles.historyWrap}><div className={styles.sheetCanvas} style={sheetStyle}><table className={styles.sheet}>
              <thead><tr><th>Company</th><th>Job title</th><th>Decision</th><th>Reviewed</th><th>Link</th></tr></thead>
              <tbody>{[...approvedOpportunities, ...skippedOpportunities].sort((a, b) => (b.reviewed_at || "").localeCompare(a.reviewed_at || "")).map((item) => <tr key={opportunityKey(item)}><td>{item.company || "Unknown"}</td><td>{item.title || "Untitled"}</td><td>{item.status === "approved" ? "Smashed" : "Passed"}</td><td>{formatDate(item.reviewed_at)}</td><td>{item.apply_url ? <a className={styles.cleanLink} href={item.apply_url} target="_blank" rel="noreferrer">Open job</a> : "—"}</td></tr>)}</tbody>
            </table></div></div>
          </section>
          </>
        )}
      </div>
    </main>
  );
}
