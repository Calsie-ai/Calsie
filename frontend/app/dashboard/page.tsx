"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "../../lib/supabaseClient";

type Campaign = {
  id: string;
  name: string;
  location: string | null;
  target_business_type: string | null;
  search: { target_role?: string; target_location?: string | null } | null;
  outreach: { daily_cap?: number; hourly_cap?: number; campaign_days?: number; starts_at?: string; mode?: string } | null;
  status: string;
  created_at: string;
};

type HomeStatus = {
  resumeReady: boolean;
  gmailReady: boolean;
  aiReady: boolean;
  trackerReady: boolean;
};

function getCampaignRole(campaign: Campaign) {
  return campaign.search?.target_role || campaign.target_business_type || "Target not set";
}

function getCampaignLocation(campaign: Campaign) {
  return campaign.search?.target_location || campaign.location || "";
}

function StatusDot({ ready, children }: { ready: boolean; children: ReactNode }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "8px",
        color: ready ? "rgba(220, 255, 240, .96)" : "rgba(255, 255, 255, .62)",
        fontSize: "clamp(12px, 1.8vw, 14px)",
        fontWeight: 850,
        whiteSpace: "nowrap",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: "9px",
          height: "9px",
          borderRadius: "999px",
          background: ready ? "#8fffd2" : "rgba(255,255,255,.34)",
          boxShadow: ready ? "0 0 18px rgba(143,255,210,.7)" : "none",
        }}
      />
      {children}
    </span>
  );
}

function defaultStartTime() {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  date.setMinutes(0, 0, 0);
  return date.toISOString().slice(0, 16);
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
  const [scheduling, setScheduling] = useState(false);
  const [scheduleStartsAt, setScheduleStartsAt] = useState(defaultStartTime);
  const [dailyCap, setDailyCap] = useState(25);
  const [hourlyCap, setHourlyCap] = useState(10);

  const latestCampaign = campaigns[0];
  const isScheduled = latestCampaign?.status === "scheduled" || latestCampaign?.outreach?.mode === "scheduled";
  const canSchedule = Boolean(latestCampaign && status.resumeReady && status.gmailReady && !scheduling);

  const scheduleLabel = useMemo(() => {
    if (!latestCampaign) return "Create campaign first";
    if (!status.resumeReady) return "Upload resume first";
    if (!status.gmailReady) return "Connect Gmail first";
    if (scheduling) return "Scheduling...";
    return isScheduled ? "Update schedule" : "Schedule email sends";
  }, [latestCampaign, status.resumeReady, status.gmailReady, scheduling, isScheduled]);

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

        const latest = loadedCampaigns[0];
        if (latest?.outreach?.starts_at) setScheduleStartsAt(String(latest.outreach.starts_at).slice(0, 16));
        if (latest?.outreach?.daily_cap) setDailyCap(Number(latest.outreach.daily_cap));
        if (latest?.outreach?.hourly_cap) setHourlyCap(Number(latest.outreach.hourly_cap));

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

        let trackerReady = false;
        if (loadedCampaigns.length > 0) {
          const { count: trackerCount } = await supabase
            .from("outreach_queue")
            .select("id", { count: "exact", head: true })
            .in("campaign_id", loadedCampaigns.map((campaign) => campaign.id));
          trackerReady = Boolean((trackerCount || 0) > 0);
        }

        setStatus({
          resumeReady: Boolean(resumeData?.resume_file_path),
          gmailReady,
          aiReady: true,
          trackerReady,
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

  async function scheduleCampaign() {
    if (!latestCampaign) {
      router.push("/campaign/new");
      return;
    }

    setScheduling(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const supabase = getSupabaseClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      if (!accessToken) {
        throw new Error("Missing login session. Please sign in again.");
      }

      const startsAt = scheduleStartsAt ? new Date(scheduleStartsAt).toISOString() : new Date().toISOString();
      const response = await fetch("/api/applix/schedule-campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          access_token: accessToken,
          campaign_id: latestCampaign.id,
          enabled: true,
          starts_at: startsAt,
          timezone: "Australia/Sydney",
          daily_cap: dailyCap,
          hourly_cap: hourlyCap,
          campaign_days: latestCampaign.outreach?.campaign_days || 14,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Could not schedule email sends.");
      }

      setCampaigns((current) => current.map((campaign) => (
        campaign.id === latestCampaign.id
          ? { ...campaign, status: "scheduled", outreach: { ...(campaign.outreach || {}), ...data.schedule } }
          : campaign
      )));
      setSuccessMessage(`Scheduled. Applix will send up to ${hourlyCap} emails per hour and ${dailyCap} per day.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not schedule email sends.");
    } finally {
      setScheduling(false);
    }
  }

  return (
    <main className="applix-home-shell" style={{ gridTemplateRows: "auto 1fr auto", paddingTop: "24px" }}>
      <header
        style={{
          position: "relative",
          zIndex: 2,
          width: "min(980px, 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "16px",
        }}
      >
        <div style={{ display: "inline-flex", alignItems: "center", gap: "12px" }}>
          <img src="/applix-logo.svg" alt="Applix logo" style={{ width: "54px", height: "54px", objectFit: "contain" }} />
          <div style={{ textAlign: "left" }}>
            <strong style={{ display: "block", color: "#ff7fa8", letterSpacing: ".18em", fontSize: "16px" }}>APPLIX</strong>
            <span style={{ color: "rgba(255,255,255,.62)", fontSize: "12px", fontWeight: 800 }}>Approved by Sajan</span>
          </div>
        </div>

        <button className="home-signout" type="button" onClick={signOut} style={{ position: "static" }}>Sign out</button>
      </header>

      <section
        className="applix-home-center"
        style={{ alignContent: "center", paddingTop: "12px", width: "min(760px, 100%)" }}
      >
        <img
          src="/applix-logo.svg"
          alt="Applix logo"
          style={{ width: "clamp(230px, 34vw, 390px)", height: "auto", display: "block", objectFit: "contain", marginBottom: "-20px", filter: "drop-shadow(0 24px 52px rgba(0, 0, 0, .45))" }}
        />

        <p style={{ margin: "0 0 8px", color: "#ff7fa8", fontSize: "clamp(32px, 6vw, 64px)", lineHeight: .9, fontWeight: 950, letterSpacing: ".16em", textShadow: "0 0 22px rgba(255, 80, 180, .28)" }}>
          APPLIX
        </p>
        <h1 style={{ fontSize: "clamp(36px, 6.8vw, 72px)", letterSpacing: "-2px" }}>{isScheduled ? "Email sending is scheduled" : "Your job automation is ready"}</h1>
        {email && <p className="applix-home-copy" style={{ marginTop: "16px" }}>Signed in as {email}</p>}
      </section>

      <section className="applix-home-bottom" style={{ width: "min(760px, 100%)", gap: "14px" }}>
        {errorMessage && <p className="applix-setup-status">{errorMessage}</p>}
        {successMessage && <p className="applix-setup-status success">{successMessage}</p>}
        {loading && <p className="applix-setup-status">Loading setup...</p>}

        <div className="applix-home-actions" style={{ gap: "14px" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: "10px",
              padding: "12px",
              borderRadius: "24px",
              border: "1px solid rgba(255,255,255,.16)",
              background: "rgba(255,255,255,.08)",
              backdropFilter: "blur(18px)",
            }}
          >
            <label style={{ display: "grid", gap: "6px", color: "rgba(255,255,255,.72)", fontSize: "12px", fontWeight: 900 }}>
              Start time
              <input type="datetime-local" value={scheduleStartsAt} onChange={(event) => setScheduleStartsAt(event.target.value)} style={{ minWidth: 0, border: 0, borderRadius: "14px", padding: "12px", background: "rgba(0,0,0,.3)", color: "white" }} />
            </label>
            <label style={{ display: "grid", gap: "6px", color: "rgba(255,255,255,.72)", fontSize: "12px", fontWeight: 900 }}>
              Per hour
              <input type="number" min="1" max="50" value={hourlyCap} onChange={(event) => setHourlyCap(Number(event.target.value))} style={{ minWidth: 0, border: 0, borderRadius: "14px", padding: "12px", background: "rgba(0,0,0,.3)", color: "white" }} />
            </label>
            <label style={{ display: "grid", gap: "6px", color: "rgba(255,255,255,.72)", fontSize: "12px", fontWeight: 900 }}>
              Per day
              <input type="number" min="1" max="200" value={dailyCap} onChange={(event) => setDailyCap(Number(event.target.value))} style={{ minWidth: 0, border: 0, borderRadius: "14px", padding: "12px", background: "rgba(0,0,0,.3)", color: "white" }} />
            </label>
          </div>

          {latestCampaign ? (
            <button
              className="applix-setup-primary"
              type="button"
              onClick={scheduleCampaign}
              disabled={!canSchedule}
              style={{ gap: "12px" }}
            >
              <img src="/applix-logo.svg" alt="" aria-hidden="true" style={{ width: "58px", height: "58px", objectFit: "contain" }} />
              {scheduleLabel}
            </button>
          ) : (
            <Link className="applix-setup-primary" href="/campaign/new" style={{ gap: "12px" }}>
              <img src="/applix-logo.svg" alt="" aria-hidden="true" style={{ width: "58px", height: "58px", objectFit: "contain" }} />
              Create campaign first
            </Link>
          )}

          <div className="home-action-row">
            <Link className="applix-setup-outline" href="/tracker">View tracker</Link>
            <Link className="applix-setup-outline" href="/resume-canvas">Upload/Update Resume</Link>
          </div>

          {!status.gmailReady && (
            <button className="applix-setup-outline" type="button" onClick={connectGmail} disabled={connectingGmail || !email}>
              {connectingGmail ? "Opening Gmail..." : "Connect Gmail"}
            </button>
          )}
        </div>

        <div
          aria-label="Setup status"
          style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "10px 18px", padding: "14px 18px", border: "1px solid rgba(255,255,255,.18)", borderRadius: "999px", background: "rgba(255,255,255,.08)", backdropFilter: "blur(18px)", boxShadow: "inset 0 1px 0 rgba(255,255,255,.14), 0 18px 45px rgba(0,0,0,.14)" }}
        >
          <StatusDot ready={status.resumeReady}>Resume ready</StatusDot>
          <StatusDot ready={status.gmailReady}>Gmail connected</StatusDot>
          <StatusDot ready={status.trackerReady}>Tracker ready</StatusDot>
        </div>

        {latestCampaign && (
          <div className="home-campaign-card" style={{ padding: "14px 18px" }}>
            <p className="applix-setup-kicker" style={{ marginBottom: "8px" }}>Latest campaign</p>
            <strong>{latestCampaign.name}</strong>
            <p>{getCampaignRole(latestCampaign)}{getCampaignLocation(latestCampaign) ? ` in ${getCampaignLocation(latestCampaign)}` : ""}</p>
            {isScheduled && <p style={{ marginTop: "8px", color: "#8fffd2", fontWeight: 900 }}>Scheduled sender is active.</p>}
          </div>
        )}
      </section>
    </main>
  );
}
