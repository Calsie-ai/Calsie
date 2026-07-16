"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "../../lib/supabaseClient";

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

function messageFrom(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error) return String((error as { message?: unknown }).message || fallback);
  return fallback;
}

function formatDate(value: string | null) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export default function TrackerPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("review");
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [reviewJobs, setReviewJobs] = useState<ReviewJob[]>([]);
  const [legacyJobs, setLegacyJobs] = useState<LegacyJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const summary = useMemo(() => ({
    waiting: reviewJobs.length,
    legacy: legacyJobs.length,
    approvedLegacy: legacyJobs.filter((job) => ["approved", "queued", "applied"].includes((job.status || "").toLowerCase())).length,
  }), [reviewJobs, legacyJobs]);

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
    if (!response.ok || payload?.ok === false) throw new Error(payload?.error || "Application preparation failed.");
    return payload;
  }

  async function decide(job: ReviewJob, decision: "approved" | "skipped") {
    if (busyId) return;
    setBusyId(job.id);
    setMessage("");
    setError("");

    try {
      const supabase = getSupabaseClient();
      const decisionResult = await supabase.rpc("decide_campaign_job", {
        p_campaign_id: job.campaign_id,
        p_job_id: job.id,
        p_decision: decision,
      });

      if (decisionResult.error) throw decisionResult.error;
      if (decisionResult.data !== true) throw new Error("This job is no longer available for review.");

      setReviewJobs((current) => current.filter((item) => item.id !== job.id));

      if (decision === "skipped") {
        setMessage("Job skipped.");
        return;
      }

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

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-white sm:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-col gap-4 border-b border-white/10 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link href="/dashboard" className="text-sm font-bold text-pink-300">← Back to dashboard</Link>
            <h1 className="mt-3 text-3xl font-black">Application tracker</h1>
            <p className="mt-2 text-sm text-white/60">
              {campaign ? `${campaign.name || campaign.target_business_type || "Campaign"} · ${campaign.location || "Location not set"}` : "No campaign selected"}
            </p>
          </div>
          <button onClick={() => void load()} disabled={loading} className="rounded-xl border border-white/15 px-4 py-2 text-sm font-bold disabled:opacity-50">
            {loading ? "Loading..." : "Reload"}
          </button>
        </header>

        <section className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><span className="text-sm text-white/50">AI jobs waiting</span><strong className="mt-2 block text-3xl">{summary.waiting}</strong></div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><span className="text-sm text-white/50">Legacy history</span><strong className="mt-2 block text-3xl">{summary.legacy}</strong></div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><span className="text-sm text-white/50">Legacy approved/queued</span><strong className="mt-2 block text-3xl">{summary.approvedLegacy}</strong></div>
        </section>

        <div className="mt-6 flex gap-2 rounded-2xl border border-white/10 bg-white/5 p-2">
          <button onClick={() => setTab("review")} className={`flex-1 rounded-xl px-4 py-3 text-sm font-black ${tab === "review" ? "bg-pink-500" : "text-white/60"}`}>AI Review Queue</button>
          <button onClick={() => setTab("history")} className={`flex-1 rounded-xl px-4 py-3 text-sm font-black ${tab === "history" ? "bg-pink-500" : "text-white/60"}`}>Legacy History</button>
        </div>

        {message && <p className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-sm text-emerald-200">{message}</p>}
        {error && <p className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/10 p-3 text-sm text-rose-200">{error}</p>}

        {tab === "review" && (
          <section className="mt-6 space-y-4">
            {!loading && reviewJobs.length === 0 && (
              <div className="rounded-3xl border border-white/10 bg-white/5 p-10 text-center">
                <h2 className="text-2xl font-black">No AI-approved jobs waiting</h2>
                <p className="mt-2 text-sm text-white/60">Start or refresh the campaign to run catalogue matching and AI judgment.</p>
              </div>
            )}
            {reviewJobs.map((job) => (
              <article key={job.match_id || job.id} className="rounded-3xl border border-white/10 bg-white/5 p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="max-w-3xl">
                    <div className="text-xs font-bold uppercase tracking-[0.2em] text-pink-300">AI approved · {job.source || "Job source"}</div>
                    <h2 className="mt-3 text-2xl font-black">{job.title || "Untitled job"}</h2>
                    <p className="mt-1 text-lg font-bold text-white/80">{job.company || "Unknown company"}</p>
                    <p className="mt-1 text-sm text-white/50">{job.location || "Location not listed"} · {formatDate(job.created_at)}</p>
                    <p className="mt-4 line-clamp-5 text-sm leading-6 text-white/65">{job.description || "No description saved."}</p>
                    <div className="mt-4 flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full bg-white/10 px-3 py-1">{job.extracted_email ? "Employer email found" : "Email enrichment after approval"}</span>
                      {job.apply_url && <a href={job.apply_url} target="_blank" rel="noreferrer" className="rounded-full bg-white/10 px-3 py-1 text-pink-200">Open job post</a>}
                    </div>
                  </div>
                  <div className="grid min-w-52 grid-cols-2 gap-2">
                    <button disabled={busyId === job.id} onClick={() => void decide(job, "skipped")} className="rounded-xl border border-white/15 px-4 py-3 font-black disabled:opacity-50">Skip</button>
                    <button disabled={busyId === job.id} onClick={() => void decide(job, "approved")} className="rounded-xl bg-pink-500 px-4 py-3 font-black disabled:opacity-50">{busyId === job.id ? "Working..." : "Approve"}</button>
                  </div>
                </div>
              </article>
            ))}
          </section>
        )}

        {tab === "history" && (
          <section className="mt-6 overflow-hidden rounded-3xl border border-white/10 bg-white/5">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-white/10 bg-white/5 text-white/50"><tr><th className="p-4">Company</th><th className="p-4">Job</th><th className="p-4">Location</th><th className="p-4">Status</th><th className="p-4">Added</th><th className="p-4">Link</th></tr></thead>
                <tbody>
                  {legacyJobs.map((job) => (
                    <tr key={job.id} className="border-b border-white/5"><td className="p-4 font-bold">{job.company || "Unknown"}</td><td className="p-4">{job.title || "Untitled"}</td><td className="p-4 text-white/60">{job.location || "—"}</td><td className="p-4"><span className="rounded-full bg-white/10 px-3 py-1">{job.status || "new"}</span></td><td className="p-4 text-white/60">{formatDate(job.created_at)}</td><td className="p-4">{job.apply_url ? <a href={job.apply_url} target="_blank" rel="noreferrer" className="text-pink-300">Open</a> : "—"}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!loading && legacyJobs.length === 0 && <p className="p-8 text-center text-white/60">No legacy history for this account.</p>}
          </section>
        )}
      </div>
    </main>
  );
}