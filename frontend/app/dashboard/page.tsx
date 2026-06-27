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
    <>
      <main className="applix-home-shell dashboard-cockpit-shell">
        <button className="applix-setup-back" type="button" onClick={() => router.back()} aria-label="Go back">←</button>
        <button className="home-signout" type="button" onClick={signOut} style={{ right: "clamp(96px, 11vw, 140px)" }}>Sign out</button>
        <div className="applix-setup-info" title={email || "Applix dashboard"}>i</div>

        <section className="applix-home-center dashboard-hero">
          <img src="/applix-logo.svg" alt="Applix logo" style={{ width: "clamp(120px, 18vw, 190px)", height: "auto", display: "block", objectFit: "contain", marginBottom: "-4px", filter: "drop-shadow(0 18px 25px rgba(0,0,0,.32))" }} />
          <p style={{ margin: "10px 0 12px", color: "#ff7bad", fontSize: "clamp(46px, 8vw, 74px)", fontWeight: 950, letterSpacing: ".18em" }}>APPLIX</p>
          <p className="applix-setup-kicker">Persistence at Scale</p>
          <h1>Welcome back</h1>
          <p className="applix-home-copy dashboard-subtitle">Signup, setup, start, and sleep while Applix works in the background.</p>
        </section>

        <section className="applix-home-bottom dashboard-stack">
          {loading && <p className="applix-setup-status success">Loading your Applix workspace...</p>}
          {message && <p className="applix-setup-status success">{message}</p>}
          {errorMessage && <p className="error-text" style={{ textAlign: "center" }}>{errorMessage}</p>}

          <div className="home-campaign-card dashboard-card-clean applix-intro-card">
            <strong>I am Applix.</strong>
            <p>I am here to help you get the opportunity. Set me up once and I will automate your task.</p>
            <p>My skill is simple: give me your resume and tell me what opportunities you want. I will knock every door for you.</p>
            <p>I will knock 100 doors a day for 10 days.</p>
          </div>

          <div className="home-campaign-card dashboard-card-clean resume-card-wrap">
            <p className="resume-warning">Your Resume Will Be Attached to the Email, Please Use The Current And Best Resume</p>
            <Link className={`home-check resume-action ${resumeReady ? "ready" : ""}`} href="/resume-canvas">
              <span>{resumeReady ? "✓" : "1"}</span>
              <div>
                <strong>Upload / Change Resume</strong>
                <p>{resumeReady ? "Resume data is saved." : "Drag and drop your DOC or DOCX resume."}</p>
              </div>
            </Link>
          </div>

          <div className="home-check-grid dashboard-single-row">
            <div className={`home-check dashboard-app-connect ${gmailReady ? "ready" : ""}`}>
              <span>{gmailReady ? "✓" : "2"}</span>
              <div>
                <strong>Connect Applix to my app</strong>
                <p>{gmailReady ? "Applix is connected." : "Connect your app to prepare outreach."}</p>
              </div>
            </div>
          </div>

          <div className="home-campaign-card dashboard-card-clean campaign-summary-card">
            {latestCampaign ? (
              <>
                <strong>{latestCampaign.name}</strong>
                <p>{roleFor(latestCampaign)}{locationFor(latestCampaign) ? ` in ${locationFor(latestCampaign)}` : ""}</p>
                <p>Status: {statusLabel(latestCampaign.status)}</p>
                {latestCampaign.status === "launched" && <p>Agent runs in the background for {latestCampaign.outreach?.agent_days || 10} days.</p>}
                <div className="home-action-row" style={{ marginTop: 16 }}>
                  <Link className="ghost-link" href="/campaign/new">New campaign</Link>
                  <button className="ghost-button" type="button" onClick={() => deleteCampaign(latestCampaign)} disabled={busy} style={{ borderColor: "rgba(248,113,113,.55)", background: "rgba(127,29,29,.34)", color: "#fecaca" }}>{busy ? "Deleting..." : "Delete campaign"}</button>
                </div>
              </>
            ) : (
              <>
                <strong>No campaign yet</strong>
                <p>Create a campaign so Applix can fetch jobs and prepare outreach.</p>
              </>
            )}
          </div>

          <div className="applix-home-actions dashboard-actions">
            {!resumeReady && <Link className="applix-setup-outline" href="/resume-canvas">Upload Resume</Link>}
            {!gmailReady && <button className="applix-setup-outline" type="button" onClick={connectGmail} disabled={busy || !email}>{busy ? "Opening..." : "Connect Applix"}</button>}
            {!latestCampaign && <Link className="applix-setup-outline" href="/campaign/new">Create Campaign</Link>}
            <button className="applix-setup-primary" type="button" onClick={startCampaign} disabled={!canStartCampaign}>{campaignRunning ? "Agent running" : canStartCampaign ? "Start Campaign" : "Complete setup first"}</button>
            <Link className="applix-setup-outline" href="/tracker">Open Job Tracker</Link>
          </div>
        </section>
      </main>

      <style>{`
        .dashboard-cockpit-shell {
          grid-template-rows: auto 1fr !important;
          overflow-y: auto !important;
          justify-items: center !important;
          padding: clamp(28px, 5vw, 58px) 18px 48px !important;
          background:
            radial-gradient(circle at 20% 0%, rgba(168, 85, 247, .35), transparent 28%),
            radial-gradient(circle at 85% 20%, rgba(34, 211, 238, .18), transparent 24%),
            linear-gradient(180deg, #120b2d 0%, #070711 56%, #030306 100%) !important;
        }

        .dashboard-cockpit-shell::before { display: none !important; }

        .dashboard-hero {
          width: min(760px, 92vw) !important;
          padding-top: clamp(92px, 10vh, 128px) !important;
          margin-bottom: clamp(30px, 5vw, 52px) !important;
          text-align: center !important;
          justify-items: center !important;
        }

        .dashboard-hero h1 { font-size: clamp(50px, 10vw, 92px) !important; line-height: .95 !important; }

        .dashboard-subtitle {
          display: block !important;
          margin-top: 20px !important;
          font-size: clamp(16px, 3vw, 22px) !important;
          line-height: 1.45 !important;
          color: rgba(255,255,255,.86) !important;
        }

        .dashboard-stack {
          width: min(760px, 92vw) !important;
          margin: 0 auto !important;
          display: grid !important;
          justify-items: center !important;
          gap: clamp(18px, 3.5vw, 28px) !important;
        }

        .dashboard-card-clean,
        .dashboard-single-row,
        .dashboard-actions { width: 100% !important; }

        .dashboard-card-clean {
          text-align: center !important;
          padding: clamp(22px, 4vw, 32px) !important;
          display: grid !important;
          justify-items: center !important;
          gap: 14px !important;
        }

        .dashboard-card-clean strong { font-size: clamp(21px, 4.5vw, 32px) !important; line-height: 1.15 !important; margin-bottom: 0 !important; }

        .dashboard-card-clean p,
        .home-check p { font-size: clamp(14px, 3.2vw, 17px) !important; line-height: 1.45 !important; }

        .applix-intro-card p { max-width: 600px !important; text-align: center !important; }

        .resume-warning {
          max-width: 650px !important;
          color: rgba(255,255,255,.9) !important;
          font-weight: 950 !important;
          text-align: center !important;
        }

        .resume-action,
        .dashboard-app-connect {
          width: 100% !important;
          display: grid !important;
          grid-template-columns: 1fr !important;
          place-items: center !important;
          justify-items: center !important;
          align-items: center !important;
          padding: clamp(18px, 3.8vw, 26px) !important;
          min-height: clamp(82px, 15vw, 112px) !important;
          gap: 10px !important;
          text-align: center !important;
        }

        .resume-action div,
        .dashboard-app-connect div { text-align: center !important; display: grid !important; justify-items: center !important; }

        .resume-action span,
        .dashboard-app-connect span {
          width: clamp(42px, 9vw, 58px) !important;
          height: clamp(42px, 9vw, 58px) !important;
          font-size: clamp(20px, 5vw, 34px) !important;
        }

        .resume-action strong,
        .dashboard-app-connect strong { font-size: clamp(18px, 4.2vw, 26px) !important; line-height: 1.2 !important; text-align: center !important; }

        .dashboard-single-row { grid-template-columns: 1fr !important; }
        .campaign-summary-card p { text-align: center !important; }

        @media (max-width: 640px) {
          .dashboard-cockpit-shell { padding-left: 14px !important; padding-right: 14px !important; }
          .dashboard-hero { padding-top: 82px !important; margin-bottom: 34px !important; }
          .dashboard-stack { width: min(100%, 430px) !important; }
          .dashboard-card-clean { border-radius: 22px !important; padding: 20px !important; }
          .resume-action,
          .dashboard-app-connect { grid-template-columns: 1fr !important; border-radius: 22px !important; }
          .dashboard-actions .applix-setup-primary,
          .dashboard-actions .applix-setup-outline { min-height: 64px !important; font-size: clamp(20px, 6vw, 28px) !important; }
        }
      `}</style>
    </>
  );
}
