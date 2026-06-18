"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "../../lib/supabaseClient";

type Campaign = {
  id: string;
  name: string | null;
  target_business_type?: string | null;
  location?: string | null;
  status?: string | null;
  created_at?: string | null;
};

type QueueRow = {
  id: string;
  campaign_id?: string | null;
  business_name?: string | null;
  company_name?: string | null;
  recipient_email?: string | null;
  email?: string | null;
  contact_email?: string | null;
  subject?: string | null;
  status?: string | null;
  sent_at?: string | null;
  created_at?: string | null;
  [key: string]: unknown;
};

type JobRow = {
  id: string;
  user_id?: string | null;
  title?: string | null;
  company?: string | null;
  location?: string | null;
  source?: string | null;
  apply_url?: string | null;
  description?: string | null;
  posted_at?: string | null;
  status?: string | null;
  created_at?: string | null;
};

type DisplayJob = {
  id: string;
  title: string;
  company: string;
  location: string;
  source: string;
  applyUrl?: string | null;
  postedAt?: string | null;
  status: string;
};

function displayDate(value: unknown) {
  if (!value || typeof value !== "string") return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getCompany(row: QueueRow) {
  return row.business_name || row.company_name || "Untitled lead";
}

function getStatus(row: QueueRow | JobRow) {
  return row.status || "new";
}

function jobFromQueue(row: QueueRow, campaign?: Campaign): DisplayJob {
  const company = getCompany(row);

  return {
    id: `queue-${row.id}`,
    title: row.subject || campaign?.target_business_type || campaign?.name || "Qualified job lead",
    company,
    location: campaign?.location || "-",
    source: "Outreach queue",
    applyUrl: null,
    postedAt: row.sent_at || row.created_at || campaign?.created_at || null,
    status: getStatus(row),
  };
}

function jobFromTable(row: JobRow): DisplayJob {
  return {
    id: row.id,
    title: row.title || "Untitled job",
    company: row.company || "Unknown company",
    location: row.location || "-",
    source: row.source || "Job source",
    applyUrl: row.apply_url || null,
    postedAt: row.posted_at || row.created_at || null,
    status: getStatus(row),
  };
}

export default function TrackerPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [queueRows, setQueueRows] = useState<QueueRow[]>([]);
  const [role, setRole] = useState("support worker");
  const [location, setLocation] = useState("Sydney NSW");
  const [loading, setLoading] = useState(true);
  const [fetchingJobs, setFetchingJobs] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  const campaignById = useMemo(() => {
    return campaigns.reduce<Record<string, Campaign>>((map, campaign) => {
      map[campaign.id] = campaign;
      return map;
    }, {});
  }, [campaigns]);

  const displayJobs = useMemo(() => {
    if (jobs.length > 0) {
      return jobs.map(jobFromTable);
    }

    return queueRows.map((row) => jobFromQueue(row, row.campaign_id ? campaignById[row.campaign_id] : undefined));
  }, [campaignById, jobs, queueRows]);

  async function loadTracker() {
    setLoading(true);
    setErrorMessage("");

    try {
      const supabase = getSupabaseClient();
      const { data: userData, error: userError } = await supabase.auth.getUser();
      const { data: sessionData } = await supabase.auth.getSession();

      if (userError || !userData.user) {
        router.replace("/");
        return;
      }

      const userEmail = userData.user.email || "";
      setEmail(userEmail);
      setAccessToken(sessionData.session?.access_token || "");

      const { data: jobData, error: jobError } = await supabase
        .from("jobs")
        .select("id,user_id,title,company,location,source,apply_url,description,posted_at,status,created_at")
        .eq("user_id", userData.user.id)
        .order("created_at", { ascending: false })
        .limit(80);

      if (!jobError && jobData) {
        setJobs(jobData as JobRow[]);
      } else {
        setJobs([]);
      }

      const { data: campaignData, error: campaignError } = await supabase
        .from("campaigns")
        .select("id,name,target_business_type,location,status,created_at")
        .eq("user_id", userData.user.id)
        .order("created_at", { ascending: false });

      if (campaignError) {
        if (jobs.length === 0) throw new Error(campaignError.message);
        return;
      }

      const loadedCampaigns = (campaignData || []) as Campaign[];
      setCampaigns(loadedCampaigns);

      if (loadedCampaigns.length === 0) {
        setQueueRows([]);
        return;
      }

      const campaignIds = loadedCampaigns.map((campaign) => campaign.id);
      const { data: queueData, error: queueError } = await supabase
        .from("outreach_queue")
        .select("*")
        .in("campaign_id", campaignIds)
        .order("created_at", { ascending: false })
        .limit(80);

      if (!queueError && queueData) {
        setQueueRows(queueData as QueueRow[]);
      } else {
        setQueueRows([]);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not load tracker data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTracker();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function fetchRealJobs() {
    if (!accessToken) {
      setActionMessage("Please sign in again before fetching jobs.");
      return;
    }

    setFetchingJobs(true);
    setActionMessage("");

    try {
      const response = await fetch("/api/applix/fetch-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: accessToken, role, location }),
      });

      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.ok) {
        throw new Error(result?.error || "Could not fetch jobs.");
      }

      setActionMessage(`Fetched ${result.count || 0} jobs${result.saved === false ? ", but they were not saved" : " and saved them"}.`);
      await loadTracker();
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Could not fetch jobs.");
    } finally {
      setFetchingJobs(false);
    }
  }

  return (
    <main
      className="applix-home-shell"
      style={{
        gridTemplateRows: "auto 1fr",
        overflow: "auto",
        paddingTop: "24px",
        background:
          "radial-gradient(circle at top, rgba(103, 65, 217, .72) 0%, rgba(56, 31, 123, .78) 32%, rgba(23, 13, 48, .98) 68%, #080512 100%)",
      }}
    >
      <header
        style={{
          position: "relative",
          zIndex: 2,
          width: "min(1180px, 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "16px",
        }}
      >
        <Link href="/dashboard" style={{ display: "inline-flex", alignItems: "center", gap: "12px" }}>
          <img src="/applix-logo.svg" alt="Applix logo" style={{ width: "54px", height: "54px", objectFit: "contain" }} />
          <div style={{ textAlign: "left" }}>
            <strong style={{ display: "block", color: "#ff7fa8", letterSpacing: ".18em", fontSize: "16px" }}>APPLIX</strong>
            <span style={{ color: "rgba(255,255,255,.62)", fontSize: "12px", fontWeight: 800 }}>Tracker</span>
          </div>
        </Link>

        <Link className="applix-setup-outline" href="/dashboard" style={{ width: "auto", minHeight: "48px", padding: "10px 18px", fontSize: "15px", borderWidth: "1px" }}>
          Home
        </Link>
      </header>

      <section style={{ position: "relative", zIndex: 1, width: "min(1180px, 100%)", padding: "38px 0 26px" }}>
        <div style={{ textAlign: "center", marginBottom: "24px" }}>
          <p className="applix-setup-kicker" style={{ marginBottom: "10px" }}>Live Supabase job data</p>
          <h1 style={{ margin: 0, fontSize: "clamp(38px, 7vw, 76px)", lineHeight: .95, letterSpacing: "-2px" }}>Job tracker</h1>
          {email && <p className="applix-home-copy" style={{ marginTop: "12px" }}>Signed in as {email}</p>}
        </div>

        <div className="home-campaign-card" style={{ padding: "18px", marginBottom: "18px", textAlign: "left", background: "rgba(255,255,255,.075)", borderColor: "rgba(255,255,255,.14)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: "12px", alignItems: "end" }}>
            <label style={{ display: "grid", gap: "8px", color: "rgba(255,255,255,.82)", fontWeight: 900 }}>
              Job title
              <input value={role} onChange={(event) => setRole(event.target.value)} placeholder="support worker" />
            </label>
            <label style={{ display: "grid", gap: "8px", color: "rgba(255,255,255,.82)", fontWeight: 900 }}>
              Location
              <input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Sydney NSW" />
            </label>
            <button className="primary-button" type="button" onClick={fetchRealJobs} disabled={fetchingJobs || loading} style={{ minHeight: "52px", whiteSpace: "nowrap" }}>
              {fetchingJobs ? "Fetching..." : "Fetch real jobs"}
            </button>
          </div>
          {actionMessage && <p style={{ marginTop: "12px", color: actionMessage.toLowerCase().includes("could not") || actionMessage.toLowerCase().includes("missing") ? "#fca5a5" : "#a7f3d0", fontWeight: 850 }}>{actionMessage}</p>}
        </div>

        {errorMessage && <p className="applix-setup-status">{errorMessage}</p>}
        {loading && <p className="applix-setup-status">Loading tracker...</p>}

        {!loading && !errorMessage && displayJobs.length === 0 && (
          <div className="home-campaign-card" style={{ padding: "28px", textAlign: "center", background: "rgba(255,255,255,.075)", borderColor: "rgba(255,255,255,.14)" }}>
            <img src="/applix-logo.svg" alt="" aria-hidden="true" style={{ width: "110px", height: "110px", objectFit: "contain", marginBottom: "8px" }} />
            <h2 style={{ margin: "0 0 10px", fontSize: "clamp(28px, 5vw, 44px)" }}>Tracker is ready for jobs</h2>
            <p style={{ margin: "0 auto 20px", maxWidth: "560px", color: "rgba(255,255,255,.72)", lineHeight: 1.5 }}>
              Fetch real job listings above. Applix will save them into Supabase and show them here.
            </p>
          </div>
        )}

        {!loading && !errorMessage && displayJobs.length > 0 && (
          <div className="home-campaign-card" style={{ padding: "0", overflow: "hidden", textAlign: "left", background: "rgba(255,255,255,.075)", borderColor: "rgba(255,255,255,.14)", boxShadow: "0 28px 80px rgba(0,0,0,.26)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1.35fr 1fr 1fr .75fr .7fr .6fr", gap: "0", padding: "14px 18px", borderBottom: "1px solid rgba(255,255,255,.14)", color: "rgba(255,255,255,.62)", fontSize: "12px", fontWeight: 900, letterSpacing: ".12em", textTransform: "uppercase" }}>
              <span>Job title</span>
              <span>Company</span>
              <span>Location</span>
              <span>Source</span>
              <span>Status</span>
              <span>Apply</span>
            </div>

            {displayJobs.map((job) => (
              <div key={job.id} style={{ display: "grid", gridTemplateColumns: "1.35fr 1fr 1fr .75fr .7fr .6fr", gap: "0", padding: "16px 18px", borderBottom: "1px solid rgba(255,255,255,.1)", alignItems: "center" }}>
                <strong style={{ color: "white" }}>{job.title}</strong>
                <span style={{ color: "rgba(255,255,255,.72)", overflow: "hidden", textOverflow: "ellipsis" }}>{job.company}</span>
                <span style={{ color: "rgba(255,255,255,.72)" }}>{job.location}</span>
                <span style={{ color: "rgba(255,255,255,.62)" }}>{job.source}</span>
                <span style={{ color: "#8fffd2", fontWeight: 900 }}>{job.status}</span>
                <span>
                  {job.applyUrl ? (
                    <a href={job.applyUrl} target="_blank" rel="noreferrer" style={{ color: "#a7f3d0", fontWeight: 950 }}>View</a>
                  ) : (
                    <span style={{ color: "rgba(255,255,255,.45)" }}>{displayDate(job.postedAt)}</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
