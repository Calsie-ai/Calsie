"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
  extracted_email: string | null;
  description: string | null;
  status: string | null;
  created_at: string | null;
  ai_role_relevance_score?: number | null;
  ai_reason?: string | null;
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

type Tab = "review" | "history";
type Decision = "approved" | "skipped";

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
  return clean.length > 95 ? `${clean.slice(0, 92)}...` : clean;
}

export default function TrackerPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const embedded = searchParams.get("embedded") === "1";
  const requestedView = searchParams.get("view");
  const [tab, setTab] = useState<Tab>(requestedView === "history" ? "history" : "review");
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [reviewJobs, setReviewJobs] = useState<ReviewJob[]>([]);
  const [legacyJobs, setLegacyJobs] = useState<LegacyJob[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const summary = useMemo(() => ({
    waiting: reviewJobs.length,
    selected: selectedIds.length,
    legacy: legacyJobs.length,
  }), [reviewJobs, selectedIds, legacyJobs]);

  const allSelected = reviewJobs.length > 0 && selectedIds.length === reviewJobs.length;

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

      if (latestCampaign?.id) {
        const reviewResult = await supabase.rpc("get_review_jobs", {
          p_campaign_id: latestCampaign.id,
          p_limit: 100,
        });
        if (reviewResult.error) throw reviewResult.error;
        setReviewJobs((reviewResult.data || []) as ReviewJob[]);
      } else {
        setReviewJobs([]);
      }

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
    const decisionResult = await supabase.rpc("decide_campaign_job", {
      p_campaign_id: job.campaign_id,
      p_job_id: job.id,
      p_decision: decision,
    });
    if (decisionResult.error) throw decisionResult.error;
    if (decisionResult.data !== true) throw new Error(`${job.title || "Job"} is no longer available for review.`);
  }

  async function decide(job: ReviewJob, decision: Decision) {
    if (busyId || bulkBusy) return;
    setBusyId(job.id);
    setMessage("");
    setError("");
    try {
      await recordDecision(job, decision);
      setReviewJobs((current) => current.filter((item) => item.id !== job.id));
      setSelectedIds((current) => current.filter((id) => id !== job.id));

      if (decision === "skipped") {
        setMessage("Job skipped.");
        return;
      }

      const supabase = getSupabaseClient();
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) throw new Error("Please sign in again.");
      const prepared = await prepareApprovedApplications(job.campaign_id, token);
      setMessage(
        prepared.queued_companies > 0
          ? `Approved. ${prepared.queued_companies} company contact${prepared.queued_companies === 1 ? " is" : "s are"} being enriched.`
          : `Approved. ${prepared.drafts_created || 0} draft${prepared.drafts_created === 1 ? " is" : "s are"} ready for review.`,
      );
    } catch (decisionError) {
      setError(messageFrom(decisionError, "Could not save the decision."));
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function decideSelected(decision: Decision) {
    const jobs = reviewJobs.filter((job) => selectedIds.includes(job.id));
    if (!jobs.length || bulkBusy || busyId) return;
    setBulkBusy(true);
    setMessage("");
    setError("");
    try {
      for (const job of jobs) await recordDecision(job, decision);
      const decidedIds = new Set(jobs.map((job) => job.id));
      setReviewJobs((current) => current.filter((job) => !decidedIds.has(job.id)));
      setSelectedIds([]);

      if (decision === "skipped") {
        setMessage(`${jobs.length} jobs skipped.`);
        return;
      }

      const supabase = getSupabaseClient();
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) throw new Error("Please sign in again.");
      await prepareApprovedApplications(jobs[0].campaign_id, token);
      setMessage(`${jobs.length} jobs approved and moved to application preparation.`);
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
    setSelectedIds(allSelected ? [] : reviewJobs.map((job) => job.id));
  }

  return (
    <main className={`${styles.shell} ${embedded ? styles.embedded : ""}`}>
      <div className={styles.page}>
        {!embedded && (
          <header className={styles.header}>
            <div>
              <Link href="/dashboard" className={styles.backLink}>← Back to dashboard</Link>
              <p className={styles.eyebrow}>AI mission control</p>
              <h1>Application tracker</h1>
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
          <div className={styles.summaryCard}><span>Jobs awaiting review</span><strong>{summary.waiting}</strong></div>
          <div className={styles.summaryCard}><span>Rows selected</span><strong>{summary.selected}</strong></div>
          <div className={styles.summaryCard}><span>Application history</span><strong>{summary.legacy}</strong></div>
        </section>

        <div className={styles.tabs}>
          <button onClick={() => setTab("review")} className={`${styles.tab} ${tab === "review" ? styles.activeTab : ""}`}>Approve Jobs</button>
          <button onClick={() => setTab("history")} className={`${styles.tab} ${tab === "history" ? styles.activeTab : ""}`}>Application History</button>
        </div>

        {message && <p className={styles.notice}>{message}</p>}
        {error && <p className={styles.error}>{error}</p>}

        {tab === "review" && (
          <section>
            <div className={styles.toolbar}>
              <div className={styles.toolbarLeft}>
                <span className={styles.toolbarLabel}>{reviewJobs.length} AI-approved jobs · {selectedIds.length} selected</span>
              </div>
              <div className={styles.toolbarRight}>
                <button className={styles.skipSelected} disabled={!selectedIds.length || bulkBusy} onClick={() => void decideSelected("skipped")}>Skip selected</button>
                <button className={styles.approveSelected} disabled={!selectedIds.length || bulkBusy} onClick={() => void decideSelected("approved")}>{bulkBusy ? "Working..." : "Approve selected"}</button>
              </div>
            </div>

            {reviewJobs.length > 0 ? (
              <div className={styles.sheetWrap}>
                <table className={styles.sheet}>
                  <thead>
                    <tr>
                      <th className={styles.rowNumber}>#</th>
                      <th className={styles.checkColumn}><input aria-label="Select all jobs" type="checkbox" checked={allSelected} onChange={toggleAll} /></th>
                      <th className={styles.scoreColumn}>AI score</th>
                      <th className={styles.titleColumn}>Job title</th>
                      <th className={styles.companyColumn}>Company</th>
                      <th className={styles.locationColumn}>Location</th>
                      <th className={styles.emailColumn}>Employer email</th>
                      <th className={styles.dateColumn}>Added</th>
                      <th className={styles.linkColumn}>Job post</th>
                      <th className={styles.actionColumn}>Decision</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reviewJobs.map((job, index) => {
                      const selected = selectedIds.includes(job.id);
                      return (
                        <tr key={job.match_id || job.id} className={selected ? styles.selectedRow : ""}>
                          <td className={styles.rowNumber}>{index + 1}</td>
                          <td className={styles.checkColumn}><input aria-label={`Select ${job.title || "job"}`} type="checkbox" checked={selected} onChange={() => toggleSelected(job.id)} /></td>
                          <td><span className={styles.score}>{job.ai_role_relevance_score ?? "Pass"}</span></td>
                          <td className={styles.titleCell} title={job.description || ""}><strong>{job.title || "Untitled job"}</strong><small>{shortDescription(job.description)}</small></td>
                          <td className={styles.companyCell}><strong>{job.company || "Unknown company"}</strong><small>{job.source || "Source not saved"}</small></td>
                          <td>{job.location || "—"}</td>
                          <td>{job.extracted_email ? <span className={styles.emailFound}>Found</span> : <span className={styles.emailPending}>After approval</span>}</td>
                          <td>{formatDate(job.created_at)}</td>
                          <td>{job.apply_url ? <a className={styles.openLink} href={job.apply_url} target="_blank" rel="noreferrer">Open</a> : "—"}</td>
                          <td><div className={styles.actions}><button className={styles.skip} disabled={busyId === job.id || bulkBusy} onClick={() => void decide(job, "skipped")}>Skip</button><button className={styles.approve} disabled={busyId === job.id || bulkBusy} onClick={() => void decide(job, "approved")}>{busyId === job.id ? "..." : "Approve"}</button></div></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className={styles.empty}>
                <h2>{loading ? "Loading review queue..." : "No jobs waiting for approval"}</h2>
                <p>Refresh the campaign to run catalogue matching and AI review.</p>
              </div>
            )}
          </section>
        )}

        {tab === "history" && (
          <section className={styles.historyWrap}>
            <table className={styles.sheet}>
              <thead><tr><th className={styles.rowNumber}>#</th><th className={styles.companyColumn}>Company</th><th className={styles.titleColumn}>Job title</th><th className={styles.locationColumn}>Location</th><th>Status</th><th className={styles.dateColumn}>Added</th><th className={styles.linkColumn}>Link</th></tr></thead>
              <tbody>{legacyJobs.map((job, index) => <tr key={job.id}><td className={styles.rowNumber}>{index + 1}</td><td className={styles.companyCell}><strong>{job.company || "Unknown"}</strong></td><td className={styles.titleCell}><strong>{job.title || "Untitled"}</strong></td><td>{job.location || "—"}</td><td>{job.status || "new"}</td><td>{formatDate(job.created_at)}</td><td>{job.apply_url ? <a className={styles.openLink} href={job.apply_url} target="_blank" rel="noreferrer">Open</a> : "—"}</td></tr>)}</tbody>
            </table>
            {!loading && legacyJobs.length === 0 && <div className={styles.empty}><h2>No application history yet</h2></div>}
          </section>
        )}
      </div>
    </main>
  );
}
