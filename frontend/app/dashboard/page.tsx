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
  outreach: { hourly_cap?: number; daily_cap?: number; campaign_days?: number; mode?: string } | null;
  status: string;
  created_at: string;
};

function roleFor(campaign: Campaign) {
  return campaign.search?.target_role || campaign.target_business_type || "Target not set";
}

function locationFor(campaign: Campaign) {
  return campaign.search?.target_location || campaign.location || "";
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
  const campaignRunning = latestCampaign?.status === "scheduled" || latestCampaign?.status === "active";
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

      setMessage("Campaign started. Applix will fetch fresh leads daily and respect the email sending limits.");
      await loadDashboard();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not start campaign.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteCampaign(campaign: Campaign) {
    const confirmed = window.confirm(`Delete campaign "${campaign.name}"?`);
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
    <main className="app-shell">
      <section className="dashboard-card">
        <div className="dashboard-header">
          <div>
            <p className="eyebrow">Dashboard</p>
            <h1>Applix setup</h1>
            {email && <p className="muted">Signed in as {email}</p>}
          </div>
          <button className="ghost-button" type="button" onClick={signOut}>Sign out</button>
        </div>

        {loading && <p className="form-status">Loading setup...</p>}
        {message && <p className="form-status success-status">{message}</p>}
        {errorMessage && <p className="error-text">{errorMessage}</p>}

        <div className="empty-state">
          <h2>1. Master Resume</h2>
          <p>{resumeReady ? "Resume data is saved." : "Upload and parse the user's resume source first."}</p>
          <Link className="primary-link" href="/resume-canvas">Upload / Update Resume</Link>
        </div>

        <div className="empty-state">
          <h2>2. Campaign</h2>
          {latestCampaign ? (
            <>
              <p><strong>{latestCampaign.name}</strong></p>
              <p>{roleFor(latestCampaign)}{locationFor(latestCampaign) ? ` in ${locationFor(latestCampaign)}` : ""}</p>
              <p className="muted">Status: {latestCampaign.status}</p>
              <button className="ghost-button" type="button" onClick={() => deleteCampaign(latestCampaign)} disabled={busy}>Delete campaign</button>
            </>
          ) : (
            <>
              <p>No campaign yet. Create one for daily lead fetching.</p>
              <Link className="primary-link" href="/campaign/new">Create campaign</Link>
            </>
          )}
        </div>

        <div className="empty-state">
          <h2>3. Gmail Consent</h2>
          <p>{gmailReady ? "Gmail is connected." : "Connect Gmail so Applix can write/send outreach on the user's behalf."}</p>
          {!gmailReady && (
            <button className="primary-button" type="button" onClick={connectGmail} disabled={busy || !email}>
              {busy ? "Opening..." : "Connect Gmail"}
            </button>
          )}
        </div>

        <div className="empty-state">
          <h2>4. Start Campaign</h2>
          <p>Limit: 5 emails/hour, 100 emails/day, 10 days. New leads fetched daily.</p>
          <button className="primary-button" type="button" onClick={startCampaign} disabled={!canStartCampaign}>
            {campaignRunning ? "Campaign running" : canStartCampaign ? "Start Campaign" : "Complete setup first"}
          </button>
        </div>
      </section>
    </main>
  );
}
