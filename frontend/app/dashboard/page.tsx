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
  outreach: { daily_cap?: number; hourly_cap?: number; campaign_days?: number } | null;
  status: string;
  created_at: string;
};

const TEST_RECIPIENT_EMAIL = "hostsajan@gmail.com";

function getCampaignRole(campaign: Campaign) {
  return campaign.search?.target_role || campaign.target_business_type || "Target not set";
}

function getCampaignLocation(campaign: Campaign) {
  return campaign.search?.target_location || campaign.location || "";
}

function getDailyCap(campaign: Campaign) {
  return campaign.outreach?.daily_cap || 100;
}

function getHourlyCap(campaign: Campaign) {
  return campaign.outreach?.hourly_cap || 5;
}

function getCampaignDays(campaign: Campaign) {
  return campaign.outreach?.campaign_days || 10;
}

export default function DashboardPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [gmailStatus, setGmailStatus] = useState("Not connected");
  const [connectingGmail, setConnectingGmail] = useState(false);
  const [launchingCampaignId, setLaunchingCampaignId] = useState("");

  useEffect(() => {
    async function loadDashboard() {
      setLoading(true);
      setErrorMessage("");
      setSuccessMessage("");

      try {
        const supabase = getSupabaseClient();
        const { data: userData, error: userError } = await supabase.auth.getUser();

        if (userError || !userData.user) {
          router.replace("/");
          return;
        }

        setEmail(userData.user.email || "");

        const { data, error } = await supabase
          .from("campaigns")
          .select("id,name,location,target_business_type,search,outreach,status,created_at")
          .eq("user_id", userData.user.id)
          .order("created_at", { ascending: false });

        if (error) {
          setErrorMessage(error.message);
          return;
        }

        setCampaigns((data || []) as Campaign[]);

        const { data: authData } = await supabase
          .from("user_email_authorizations")
          .select("status,provider_email")
          .eq("user_identifier", userData.user.email || userData.user.id)
          .eq("provider", "google")
          .maybeSingle();

        if (authData?.status) {
          setGmailStatus(authData.provider_email ? `${authData.status}: ${authData.provider_email}` : authData.status);
        }
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Could not load dashboard.");
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
  }, [router]);

  async function signOut() {
    const supabase = getSupabaseClient();
    await supabase.auth.signOut();
    router.replace("/");
  }

  async function connectGmail() {
    setConnectingGmail(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const supabase = getSupabaseClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      if (!accessToken) {
        throw new Error("Missing login session. Please sign in again.");
      }

      const response = await fetch("/api/applix/connect-gmail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          access_token: accessToken,
          return_to: `${window.location.origin}/dashboard`,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Google authorization URL was not returned.");
      }

      window.location.href = data.authorization_url;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not start Gmail connection.");
      setConnectingGmail(false);
    }
  }

  async function launchApplixTest(campaignId: string) {
    setLaunchingCampaignId(campaignId);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const supabase = getSupabaseClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      if (!accessToken) {
        throw new Error("Missing login session. Please sign in again.");
      }

      const response = await fetch("/api/applix/launch-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          access_token: accessToken,
          campaign_id: campaignId,
          batch_size: 10,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Could not launch Applix test.");
      }

      const generatedCount = data.result?.generated?.length ?? data.result?.count ?? 10;
      setSuccessMessage(`Launch Applix Test started. Real recipients are OFF. Batch size: ${generatedCount}. Test emails will go only to ${TEST_RECIPIENT_EMAIL}.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not launch Applix test.");
    } finally {
      setLaunchingCampaignId("");
    }
  }

  return (
    <main className="app-shell">
      <section className="dashboard-card">
        <div className="dashboard-header">
          <div>
            <p className="eyebrow">Dashboard</p>
            <h1>Welcome to Applix</h1>
            {email && <p className="muted">Signed in as {email}</p>}
          </div>
          <button className="ghost-button" type="button" onClick={signOut}>Sign out</button>
        </div>

        <div className="empty-state">
          <h2>Google consent</h2>
          <p>Connect Gmail so Applix can write/send outreach on your behalf. Campaign limit: 5 emails/hour, 100 emails/day, for 10 days. Fresh leads are fetched daily.</p>
          <p className="muted">Status: {gmailStatus}</p>
          <button className="primary-button" type="button" onClick={connectGmail} disabled={connectingGmail || !email}>
            {connectingGmail ? "Opening Google..." : "Connect Gmail"}
          </button>
        </div>

        <div className="empty-state">
          <h2>Master Resume</h2>
          <p>Upload, parse and save your resume source. Applix keeps the original layout and stores parsed JSON separately.</p>
          <Link className="primary-link" href="/resume-canvas">Upload / Edit Master Resume</Link>
        </div>

        <div className="empty-state">
          <h2>Test launch plan</h2>
          <p>TEST MODE is ON. Real recipients are OFF. First batch sends only to {TEST_RECIPIENT_EMAIL}. Subject prefix: [APPLIX TEST #001]. Batch size: 10.</p>
        </div>

        {loading && <p className="muted">Loading your campaigns...</p>}
        {errorMessage && <p className="error-text">{errorMessage}</p>}
        {successMessage && <p className="form-status success-status">{successMessage}</p>}

        {!loading && campaigns.length === 0 && (
          <div className="empty-state">
            <h2>No campaign yet</h2>
            <p>Create your first campaign so Applix knows what jobs to target and how many emails to send daily.</p>
            <Link className="primary-link" href="/campaign/new">Start campaign now</Link>
          </div>
        )}

        {!loading && campaigns.length > 0 && (
          <div className="campaign-list">
            <div className="section-title-row">
              <h2>Your campaigns</h2>
              <Link className="primary-link small" href="/campaign/new">New campaign</Link>
            </div>
            {campaigns.map((campaign) => {
              const role = getCampaignRole(campaign);
              const location = getCampaignLocation(campaign);
              const dailyCap = getDailyCap(campaign);
              const hourlyCap = getHourlyCap(campaign);
              const days = getCampaignDays(campaign);
              const launching = launchingCampaignId === campaign.id;

              return (
                <article className="campaign-row" key={campaign.id}>
                  <div>
                    <h3>{campaign.name}</h3>
                    <p>{role}{location ? ` in ${location}` : ""}</p>
                    <button className="primary-button small-action" type="button" onClick={() => launchApplixTest(campaign.id)} disabled={launching || gmailStatus === "Not connected"}>
                      {launching ? "Launching test..." : "Launch Applix Test"}
                    </button>
                  </div>
                  <div className="campaign-meta">
                    <span>{campaign.status}</span>
                    <span>{hourlyCap}/hour</span>
                    <span>{dailyCap}/day</span>
                    <span>{days} days</span>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
