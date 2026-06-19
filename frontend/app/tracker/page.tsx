"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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

type TrackerJob = {
  id: string;
  title: string;
  company: string;
  location: string;
  description: string;
  applyUrl?: string | null;
};

type JobsRow = {
  id: string;
  title?: string | null;
  company?: string | null;
  location?: string | null;
  description?: string | null;
  apply_url?: string | null;
  source?: string | null;
  created_at?: string | null;
};

function cleanText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function getCampaignRole(campaign?: Campaign | null) {
  return cleanText(campaign?.search?.target_role) || cleanText(campaign?.target_business_type) || cleanText(campaign?.name, "support worker");
}

function getCampaignLocation(campaign?: Campaign | null) {
  return cleanText(campaign?.search?.target_location) || cleanText(campaign?.location, "Sydney NSW");
}

function trimDescription(value: string) {
  if (!value) return "No description saved yet.";
  return value.length > 180 ? `${value.slice(0, 180).trim()}...` : value;
}

function mapSavedJob(row: JobsRow): TrackerJob {
  return {
    id: row.id,
    title: cleanText(row.title, "Untitled job"),
    company: cleanText(row.company, "Company not found"),
    location: cleanText(row.location, "Location not listed"),
    description: cleanText(row.description, "No description saved yet."),
    applyUrl: cleanText(row.apply_url) || null,
  };
}

export default function TrackerPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [jobs, setJobs] = useState<TrackerJob[]>([]);
  const [role, setRole] = useState("support worker");
  const [location, setLocation] = useState("Sydney NSW");
  const [loading, setLoading] = useState(true);
  const [fetchingJobs, setFetchingJobs] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  async function loadSingleCampaign(supabase: ReturnType<typeof getSupabaseClient>, userId: string) {
    const { data, error } = await supabase
      .from("campaigns")
      .select("id,name,target_business_type,location,search,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return (data || null) as Campaign | null;
  }

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

      const loadedCampaign = await loadSingleCampaign(supabase, userData.user.id);
      setCampaign(loadedCampaign);

      const campaignRole = getCampaignRole(loadedCampaign);
      const campaignLocation = getCampaignLocation(loadedCampaign);
      setRole(campaignRole);
      setLocation(campaignLocation);

      if (!loadedCampaign?.id) {
        setJobs([]);
        return;
      }

      const { data: savedJobsData, error: savedJobsError } = await supabase
        .from("jobs")
        .select("id,title,company,location,description,apply_url,source,created_at")
        .eq("user_id", userData.user.id)
        .eq("campaign_id", loadedCampaign.id)
        .order("created_at", { ascending: false })
        .limit(80);

      if (savedJobsError) throw savedJobsError;
      setJobs((savedJobsData || []).map(mapSavedJob));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not load tracker data.");
      setJobs([]);
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

    if (!campaign?.id) {
      setActionMessage("Create your campaign first so Applix can fetch matching jobs.");
      return;
    }

    setFetchingJobs(true);
    setActionMessage("");

    try {
      const response = await fetch("/api/applix/fetch-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: accessToken, role, location, campaign_id: campaign.id }),
      });

      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.ok) {
        throw new Error(result?.error || "Could not fetch jobs.");
      }

      setActionMessage(`Fetched ${result.count || 0} jobs. Saved ${result.inserted_count ?? 0}. Skipped ${result.duplicate_count ?? 0} duplicates.`);
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
            <span style={{ color: "rgba(255,255,255,.62)", fontSize: "12px", fontWeight: 800 }}>Pro Tracker</span>
          </div>
        </Link>

        <Link className="applix-setup-outline" href="/dashboard" style={{ width: "auto", minHeight: "48px", padding: "10px 18px", fontSize: "15px", borderWidth: "1px" }}>
          Home
        </Link>
      </header>

      <section style={{ position: "relative", zIndex: 1, width: "min(1180px, 100%)", padding: "38px 0 26px" }}>
        <div style={{ textAlign: "center", marginBottom: "24px" }}>
          <p className="applix-setup-kicker" style={{ marginBottom: "10px" }}>Single campaign pro flow</p>
          <h1 style={{ margin: 0, fontSize: "clamp(38px, 7vw, 76px)", lineHeight: .95, letterSpacing: "-2px" }}>Job tracker</h1>
          {email && <p className="applix-home-copy" style={{ marginTop: "12px" }}>Signed in as {email}</p>}
        </div>

        <div className="home-campaign-card" style={{ padding: "18px", marginBottom: "18px", textAlign: "left", background: "rgba(255,255,255,.075)", borderColor: "rgba(255,255,255,.14)" }}>
          <p className="applix-setup-kicker" style={{ marginBottom: "8px" }}>Saved campaign</p>
          {campaign ? (
            <>
              <strong>{campaign.name || role}</strong>
              <p style={{ margin: "8px 0 0", color: "rgba(255,255,255,.72)", lineHeight: 1.5 }}>
                {role} in {location}
              </p>
            </>
          ) : (
            <p style={{ margin: 0, color: "rgba(255,255,255,.72)", lineHeight: 1.5 }}>Create your campaign first. Pro users have one active campaign only.</p>
          )}
          {actionMessage && <p style={{ marginTop: "12px", color: actionMessage.toLowerCase().includes("could not") || actionMessage.toLowerCase().includes("missing") || actionMessage.toLowerCase().includes("create") ? "#fca5a5" : "#a7f3d0", fontWeight: 850 }}>{actionMessage}</p>}
        </div>

        <button className="primary-button" type="button" onClick={fetchRealJobs} disabled={fetchingJobs || loading || !campaign?.id} style={{ minHeight: "52px", whiteSpace: "nowrap", marginBottom: "18px" }}>
          {fetchingJobs ? "Fetching campaign jobs..." : "Fetch jobs for this campaign"}
        </button>

        {errorMessage && <p className="applix-setup-status">{errorMessage}</p>}
        {loading && <p className="applix-setup-status">Loading tracker...</p>}

        {!loading && !errorMessage && jobs.length === 0 && (
          <div className="home-campaign-card" style={{ padding: "28px", textAlign: "center", background: "rgba(255,255,255,.075)", borderColor: "rgba(255,255,255,.14)" }}>
            <img src="/applix-logo.svg" alt="" aria-hidden="true" style={{ width: "110px", height: "110px", objectFit: "contain", marginBottom: "8px" }} />
            <h2 style={{ margin: "0 0 10px", fontSize: "clamp(28px, 5vw, 44px)" }}>Tracker is ready for campaign jobs</h2>
            <p style={{ margin: "0 auto 20px", maxWidth: "560px", color: "rgba(255,255,255,.72)", lineHeight: 1.5 }}>
              Fetch jobs for the saved campaign. Applix will continue the Supabase OutScraper pipeline and show only jobs saved for this campaign.
            </p>
          </div>
        )}

        {!loading && !errorMessage && jobs.length > 0 && (
          <div className="home-campaign-card" style={{ padding: "0", overflow: "hidden", textAlign: "left", background: "rgba(255,255,255,.075)", borderColor: "rgba(255,255,255,.14)", boxShadow: "0 28px 80px rgba(0,0,0,.26)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1.15fr .85fr .8fr 1.55fr .65fr", gap: "0", padding: "14px 18px", borderBottom: "1px solid rgba(255,255,255,.14)", color: "rgba(255,255,255,.62)", fontSize: "12px", fontWeight: 900, letterSpacing: ".12em", textTransform: "uppercase" }}>
              <span>Job title</span>
              <span>Company</span>
              <span>Location</span>
              <span>Description</span>
              <span>Apply</span>
            </div>

            {jobs.map((job) => (
              <div key={job.id} style={{ display: "grid", gridTemplateColumns: "1.15fr .85fr .8fr 1.55fr .65fr", gap: "0", padding: "16px 18px", borderBottom: "1px solid rgba(255,255,255,.1)", alignItems: "center" }}>
                <strong style={{ color: "white" }}>{job.title}</strong>
                <span style={{ color: "rgba(255,255,255,.72)", overflow: "hidden", textOverflow: "ellipsis" }}>{job.company}</span>
                <span style={{ color: "rgba(255,255,255,.72)" }}>{job.location}</span>
                <span style={{ color: "rgba(255,255,255,.64)", lineHeight: 1.35 }}>{trimDescription(job.description)}</span>
                <span>
                  <Link
                    href={`/matching?jobId=${encodeURIComponent(job.id)}`}
                    className="applix-setup-outline"
                    style={{ minHeight: "42px", padding: "9px 12px", fontSize: "13px", width: "auto", whiteSpace: "nowrap" }}
                  >
                    Review / Apply
                  </Link>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
