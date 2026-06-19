"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "../../lib/supabaseClient";

type Campaign = {
  id: string;
  name: string;
  location: string | null;
  target_business_type: string | null;
  search: { target_role?: string; target_location?: string | null } | null;
  outreach: { hourly_cap?: number; daily_cap?: number; campaign_days?: number; mode?: string; agent_days?: number; last_agent_run_started_at?: string; last_agent_run_finished_at?: string } | null;
  status: string;
  created_at: string;
};

function roleFor(campaign: Campaign) {
  return campaign.search?.target_role || campaign.target_business_type || "Target not set";
}

function locationFor(campaign: Campaign) {
  return campaign.search?.target_location || campaign.location || "";
}

function statusLabel(status: string) {
  if (status === "launched") return "Agent launched";
  if (status === "active") return "Agent active";
  if (status === "scheduled") return "Scheduled";
  if (status === "paused") return "Paused";
  return status || "Draft";
}

export default function DashboardPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [resumeReady, setResumeReady] = useState(false);
  const [gmailReady, setGmailReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const latestCampaign = campaigns[0] || null;
  const campaignRunning = latestCampaign?.status === "scheduled" || latestCampaign?.status === "active" || latestCampaign?.status === "launched";
  const canStartCampaign = Boolean(latestCampaign && resumeReady && gmailReady && !campaignRunning && !busy);

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    setLoading(true);
    setErrorMessage("");
    setMessage("");

    try {
      const supabase = getSupabaseClient();
      const { data: userData, error: userError } = await supabase.auth.getUser();

      if (userError || !userData.user) {
        router.replace("/");
        return;
      }

      const userEmail = userData.user.email || "";
      setEmail(userEmail);

      const { data: campaignData, error: campaignError } = await supabase
        .from("campaigns")
        .select("id,name,location,target_business_type,search,outreach,status,created_at")
        .eq("user_id", userData.user.id)
        .order("created_at", { ascending: false });

      if (campaignError) throw campaignError;
      setCampaigns((campaignData || []) as Campaign[]);

      const { data: resumeData } = await supabase
        .from("resume_profiles")
        .select("id,full_name,skills,work_experience")
        .eq("profile_id", userData.user.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      setResumeReady(Boolean(resumeData?.id));

      const { data: authData } = await supabase
        .from("user_email_authorizations")
        .select("status")
        .eq("user_identifier", userEmail || userData.user.id)
        .eq("provider", "google")
        .maybeSingle();

      setGmailReady(authData?.status === "connected");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not load dashboard.");
    } finally {
      setLoading(false);
    }
  }

  async function signOut() {
    const supabase = getSupabaseClient();
    await supabase.auth.signOut();
    router.replace("/");
  }

  async function connectGmail() {
    setBusy(true);
    setErrorMessage("");
    setMessage("");

    try {
      const supabase = getSupabaseClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("Missing login session. Please sign in again.");

      const response = await fetch("/api/applix/connect-gmail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: accessToken, return_to: `${window.location.origin}/dashboard` }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || "Google authorization URL was not returned.");

      window.location.href = data.authorization_url;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not connect Gmail.");
      setBusy(false);
    }
  }

  async function startCampaign() {
    if (!latestCampaign) {
      router.push("/campaign/new");
      return;
    }

    setBusy(true);
    setErrorMessage("");
    setMessage("");

    try {
      const supabase = getSupabaseClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("Missing login session. Please sign in again.");

      const response = await fetch("/api/applix/schedule-campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: accessToken, campaign_id: latestCampaign.id, enabled: true }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || "Could not start campaign.");

      const agentSummary = data.agent_run?.active_agent_campaigns ?? data.agent_run?.checked_campaigns;
      const summaryText = typeof agentSummary === "number" ? ` First agent run checked ${agentSummary} campaign${agentSummary === 1 ? "" : "s"}.` : " First agent run started.";
      setMessage(`Campaign launched.${summaryText} Opening the tracker...`);
      router.push("/tracker");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not start campaign.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteCampaign(campaign: Campaign) {
    const confirmed = window.confirm(`Delete campaign "${campaign.name}"? This will remove it from your Applix dashboard.`);
    if (!confirmed) return;

    setBusy(true);
    setErrorMessage("");
    setMessage("");

    try {
      const supabase = getSupabaseClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("Missing login session. Please sign in again.");

      const response = await fetch("/api/applix/delete-campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: accessToken, campaign_id: campaign.id }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || "Could not delete campaign.");

      setMessage("Campaign deleted.");
      setCampaigns((current) => current.filter((item) => item.id !== campaign.id));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not delete campaign.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="applix-home-shell">
      <button className="applix-setup-back" type="button" onClick={() => router.back()} aria-label="Go back">
        ←
      </button>
      <button className="home-signout" type="button" onClick={signOut}>Sign out</button>
      <div className="applix-setup-info" title={email || "Applix dashboard"}>i</div>

      <section className="applix-home-center" style={{ paddingTop: "clamp(70px, 8vh, 100px)" }}>
        <div style={{ fontSize: "clamp(88px, 15vw, 150px)", lineHeight: 0.85, filter: "drop-shadow(0 18px 25px rgba(0,0,0,.32))" }}>
          📨
        </div>
        <p style={{ margin: "10px 0 12px", color: "#ff7bad", fontSize: "clamp(46px, 8vw, 74px)", fontWeight: 950, letterSpacing: ".18em" }}>
          APPLIX
        </p>
        <p className="applix-setup-kicker">AI Job Automation</p>
        <h1>Welcome back</h1>
        <p className="applix-home-copy">
          Find relevant jobs, prepare tailored outreach, and track everything automatically.
        </p>
        {email && <p className="applix-setup-status" style={{ marginTop: 14 }}>Signed in as {email}</p>}
      </section>

      <section className="applix-home-bottom">
        {loading && <p className="applix-setup-status success">Loading your Applix workspace...</p>}
        {message && <p className="applix-setup-status success">{message}</p>}
        {errorMessage && <p className="error-text" style={{ textAlign: "center" }}>{errorMessage}</p>}

        <div className="home-check-grid">
          <div className={`home-check ${resumeReady ? "ready" : ""}`}>
            <span>{resumeReady ? "✓" : "1"}</span>
            <div>
              <strong>Master Resume</strong>
              <p>{resumeReady ? "Resume data is saved." : "Upload your resume first."}</p>
            </div>
          </div>
          <div className={`home-check ${gmailReady ? "ready" : ""}`}>
            <span>{gmailReady ? "✓" : "2"}</span>
            <div>
              <strong>Gmail Consent</strong>
              <p>{gmailReady ? "Gmail is connected." : "Connect Gmail to prepare outreach."}</p>
            </div>
          </div>
        </div>

        <div className="home-campaign-card">
          {latestCampaign ? (
            <>
              <strong>{latestCampaign.name}</strong>
              <p>{roleFor(latestCampaign)}{locationFor(latestCampaign) ? ` in ${locationFor(latestCampaign)}` : ""}</p>
              <p>Status: {statusLabel(latestCampaign.status)}</p>
              {latestCampaign.status === "launched" && <p>Agent runs in the background for {latestCampaign.outreach?.agent_days || 10} days.</p>}
              <div className="home-action-row" style={{ marginTop: 16 }}>
                <Link className="ghost-link" href="/campaign/new">New campaign</Link>
                <button className="ghost-button" type="button" onClick={() => deleteCampaign(latestCampaign)} disabled={busy} style={{ borderColor: "rgba(248,113,113,.55)", background: "rgba(127,29,29,.34)", color: "#fecaca" }}>
                  {busy ? "Deleting..." : "Delete campaign"}
                </button>
              </div>
            </>
          ) : (
            <>
              <strong>No campaign yet</strong>
              <p>Create a campaign so Applix can fetch jobs and prepare outreach.</p>
            </>
          )}
        </div>

        <div className="applix-home-actions">
          {!resumeReady && <Link className="applix-setup-outline" href="/resume-canvas">Upload Resume</Link>}
          {!gmailReady && <button className="applix-setup-outline" type="button" onClick={connectGmail} disabled={busy || !email}>{busy ? "Opening..." : "Connect Gmail"}</button>}
          {!latestCampaign && <Link className="applix-setup-outline" href="/campaign/new">Create Campaign</Link>}
          <button className="applix-setup-primary" type="button" onClick={startCampaign} disabled={!canStartCampaign}>
            {campaignRunning ? "Agent running" : canStartCampaign ? "Start Campaign" : "Complete setup first"}
          </button>
          <Link className="applix-setup-outline" href="/tracker">Open Job Tracker</Link>
        </div>
      </section>
    </main>
  );
}
