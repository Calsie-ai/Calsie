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

type HomeStatus = {
  resumeReady: boolean;
  gmailReady: boolean;
  aiReady: boolean;
  trackerReady: boolean;
};

const TEST_RECIPIENT_EMAIL = "hostsajan@gmail.com";

function getCampaignRole(campaign: Campaign) {
  return campaign.search?.target_role || campaign.target_business_type || "Target not set";
}

function getCampaignLocation(campaign: Campaign) {
  return campaign.search?.target_location || campaign.location || "";
}

function shortJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export default function DashboardPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [status, setStatus] = useState<HomeStatus>({
    resumeReady: false,
    gmailReady: false,
    aiReady: false,
    trackerReady: false,
  });
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [gmailStatus, setGmailStatus] = useState("Not connected");
  const [connectingGmail, setConnectingGmail] = useState(false);
  const [launchingCampaignId, setLaunchingCampaignId] = useState("");
  const [launchResult, setLaunchResult] = useState<any>(null);

  const setupCount = [status.resumeReady, status.gmailReady, status.aiReady, status.trackerReady].filter(Boolean).length;
  const allSet = setupCount >= 3;
  const latestCampaign = campaigns[0];

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

        const userEmail = userData.user.email || "";
        setEmail(userEmail);

        const { data: campaignData, error: campaignError } = await supabase
          .from("campaigns")
          .select("id,name,location,target_business_type,search,outreach,status,created_at")
          .eq("user_id", userData.user.id)
          .order("created_at", { ascending: false });

        if (campaignError) {
          setErrorMessage(campaignError.message);
          return;
        }

        const loadedCampaigns = (campaignData || []) as Campaign[];
        setCampaigns(loadedCampaigns);

        const { data: authData } = await supabase
          .from("user_email_authorizations")
          .select("status,provider_email")
          .eq("user_identifier", userEmail || userData.user.id)
          .eq("provider", "google")
          .maybeSingle();

        const gmailReady = authData?.status === "connected";
        if (authData?.status) {
          setGmailStatus(authData.provider_email ? `${authData.status}: ${authData.provider_email}` : authData.status);
        }

        const { data: resumeData } = await supabase
          .from("resume_profiles")
          .select("resume_file_path,full_name")
          .eq("profile_id", userData.user.id)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const { count: trackerCount } = await supabase
          .from("outreach_queue")
          .select("id", { count: "exact", head: true })
          .in("campaign_id", loadedCampaigns.map((campaign) => campaign.id));

        setStatus({
          resumeReady: Boolean(resumeData?.resume_file_path),
          gmailReady,
          aiReady: true,
          trackerReady: Boolean((trackerCount || 0) > 0),
        });
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
    setLaunchResult(null);

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
    setLaunchResult(null);

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
          user_identifier: email,
        }),
      });

      const data = await response.json().catch(() => ({}));
      setLaunchResult(data.result || data);

      const result = data.result || {};
      const version = result.version || "unknown";
      const sentCount = result.sent_count ?? 0;
      const gmailStatusCode = result.gmail_send_status ?? "not returned";

      if (!response.ok || !data.ok) {
        const errors = Array.isArray(result.errors) ? result.errors.join(" | ") : data.error;
        throw new Error(errors || "Could not launch Applix test.");
      }

      setSuccessMessage(`Automation finished: ${version}. Sent count: ${sentCount}. Gmail status: ${gmailStatusCode}. Test inbox: ${TEST_RECIPIENT_EMAIL}.`);
      setStatus((current) => ({ ...current, trackerReady: true }));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not launch Applix test.");
    } finally {
      setLaunchingCampaignId("");
    }
  }

  return (
    <main className="applix-home-shell">
      <button className="applix-setup-back" type="button" aria-label="Back" onClick={() => router.push("/")}>←</button>
      <button className="home-signout" type="button" onClick={signOut}>Sign out</button>

      <section className="applix-home-center">
        <img
          src="/applix-logo.svg"
          alt="Applix logo"
          style={{
            width: "clamp(52px, 10vw, 86px)",
            height: "auto",
            display: "block",
            objectFit: "contain",
            marginBottom: "10px",
            filter: "drop-shadow(0 14px 28px rgba(0, 0, 0, .35))",
          }}
        />

        <p className="applix-setup-kicker">Home</p>
        <h1>{allSet ? "You're all set up!" : "Finish setup"}</h1>
        {email && <p className="applix-home-copy">Signed in as {email}</p>}
      </section>

      <section className="applix-home-bottom">
        <div className="home-check-grid">
          <div className={status.resumeReady ? "home-check ready" : "home-check"}>
            <span>{status.resumeReady ? "✓" : "1"}</span>
            <div>
              <strong>Resume connected</strong>
              <p>{status.resumeReady ? "Your source resume is saved." : "Upload your master resume."}</p>
            </div>
          </div>

          <div className={status.gmailReady ? "home-check ready" : "home-check"}>
            <span>{status.gmailReady ? "✓" : "2"}</span>
            <div>
              <strong>Gmail connected</strong>
              <p>{status.gmailReady ? gmailStatus : "Connect Gmail to send from your account."}</p>
            </div>
          </div>

          <div className={status.aiReady ? "home-check ready" : "home-check"}>
            <span>{status.aiReady ? "✓" : "3"}</span>
            <div>
              <strong>AI writer ready</strong>
              <p>Unique job emails can be generated automatically.</p>
            </div>
          </div>

          <div className={status.trackerReady ? "home-check ready" : "home-check"}>
            <span>{status.trackerReady ? "✓" : "4"}</span>
            <div>
              <strong>Job tracker ready</strong>
              <p>{status.trackerReady ? "Tracker rows are available." : "Run automation to create tracker rows."}</p>
            </div>
          </div>
        </div>

        {errorMessage && <p className="applix-setup-status">{errorMessage}</p>}
        {successMessage && <p className="applix-setup-status success">{successMessage}</p>}
        {loading && <p className="applix-setup-status">Loading setup...</p>}

        <div className="applix-home-actions">
          {latestCampaign ? (
            <button
              className="applix-setup-primary"
              type="button"
              onClick={() => launchApplixTest(latestCampaign.id)}
              disabled={Boolean(launchingCampaignId) || !status.gmailReady || !status.resumeReady}
            >
              {launchingCampaignId ? "Running..." : "Start automation"}
            </button>
          ) : (
            <Link className="applix-setup-primary" href="/campaign/new">Start automation</Link>
          )}

          <div className="home-action-row">
            <Link className="applix-setup-outline" href="/tracker">View tracker</Link>
            <Link className="applix-setup-outline" href="/resume-canvas">Edit resume</Link>
          </div>

          {!status.gmailReady && (
            <button className="applix-setup-outline" type="button" onClick={connectGmail} disabled={connectingGmail || !email}>
              {connectingGmail ? "Opening Gmail..." : "Connect Gmail"}
            </button>
          )}
        </div>

        {latestCampaign && (
          <div className="home-campaign-card">
            <p className="applix-setup-kicker">Latest campaign</p>
            <strong>{latestCampaign.name}</strong>
            <p>{getCampaignRole(latestCampaign)}{getCampaignLocation(latestCampaign) ? ` in ${getCampaignLocation(latestCampaign)}` : ""}</p>
          </div>
        )}

        {launchResult && (
          <details className="home-dev-details">
            <summary>Developer details</summary>
            <pre>{shortJson({
              version: launchResult.version,
              ok: launchResult.ok,
              sent_count: launchResult.sent_count,
              gmail_send_status: launchResult.gmail_send_status,
              gmail_error: launchResult.gmail_error,
              user_identifier: launchResult.user_identifier,
              errors: launchResult.errors,
            })}</pre>
          </details>
        )}
      </section>
    </main>
  );
}
