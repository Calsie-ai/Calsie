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

function getEmail(row: QueueRow) {
  return row.recipient_email || row.contact_email || row.email || "-";
}

function getStatus(row: QueueRow) {
  return row.status || "queued";
}

export default function TrackerPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const campaignById = useMemo(() => {
    return campaigns.reduce<Record<string, Campaign>>((map, campaign) => {
      map[campaign.id] = campaign;
      return map;
    }, {});
  }, [campaigns]);

  useEffect(() => {
    async function loadTracker() {
      setLoading(true);
      setErrorMessage("");

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
          .select("id,name,target_business_type,location,status,created_at")
          .eq("user_id", userData.user.id)
          .order("created_at", { ascending: false });

        if (campaignError) {
          throw new Error(campaignError.message);
        }

        const loadedCampaigns = (campaignData || []) as Campaign[];
        setCampaigns(loadedCampaigns);

        if (loadedCampaigns.length === 0) {
          setRows([]);
          return;
        }

        const campaignIds = loadedCampaigns.map((campaign) => campaign.id);
        const { data: queueData, error: queueError } = await supabase
          .from("outreach_queue")
          .select("*")
          .in("campaign_id", campaignIds)
          .order("created_at", { ascending: false });

        if (queueError) {
          throw new Error(queueError.message);
        }

        setRows((queueData || []) as QueueRow[]);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Could not load tracker data.");
      } finally {
        setLoading(false);
      }
    }

    loadTracker();
  }, [router]);

  return (
    <main className="applix-home-shell" style={{ gridTemplateRows: "auto 1fr", overflow: "auto", paddingTop: "24px" }}>
      <header
        style={{
          position: "relative",
          zIndex: 2,
          width: "min(1100px, 100%)",
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

      <section style={{ position: "relative", zIndex: 1, width: "min(1100px, 100%)", padding: "38px 0 26px" }}>
        <div style={{ textAlign: "center", marginBottom: "24px" }}>
          <p className="applix-setup-kicker" style={{ marginBottom: "10px" }}>Live Supabase data</p>
          <h1 style={{ margin: 0, fontSize: "clamp(38px, 7vw, 76px)", lineHeight: .95, letterSpacing: "-2px" }}>Job tracker</h1>
          {email && <p className="applix-home-copy" style={{ marginTop: "12px" }}>Signed in as {email}</p>}
        </div>

        {errorMessage && <p className="applix-setup-status">{errorMessage}</p>}
        {loading && <p className="applix-setup-status">Loading tracker...</p>}

        {!loading && !errorMessage && rows.length === 0 && (
          <div className="home-campaign-card" style={{ padding: "28px", textAlign: "center" }}>
            <img src="/applix-logo.svg" alt="" aria-hidden="true" style={{ width: "110px", height: "110px", objectFit: "contain", marginBottom: "8px" }} />
            <h2 style={{ margin: "0 0 10px", fontSize: "clamp(28px, 5vw, 44px)" }}>Tracker is warming up</h2>
            <p style={{ margin: "0 auto 20px", maxWidth: "560px", color: "rgba(255,255,255,.72)", lineHeight: 1.5 }}>
              Your campaigns are connected. Tracker rows will appear here after Applix creates outreach queue items or sends the first batch.
            </p>
            <Link className="applix-setup-primary" href="/dashboard" style={{ minHeight: "64px", fontSize: "22px" }}>
              Start automation
            </Link>
          </div>
        )}

        {!loading && !errorMessage && rows.length > 0 && (
          <div className="home-campaign-card" style={{ padding: "0", overflow: "hidden", textAlign: "left" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr .8fr .9fr", gap: "0", padding: "14px 18px", borderBottom: "1px solid rgba(255,255,255,.14)", color: "rgba(255,255,255,.62)", fontSize: "12px", fontWeight: 900, letterSpacing: ".12em", textTransform: "uppercase" }}>
              <span>Company</span>
              <span>Email</span>
              <span>Campaign</span>
              <span>Status</span>
              <span>Date</span>
            </div>

            {rows.map((row) => {
              const campaign = row.campaign_id ? campaignById[row.campaign_id] : undefined;
              return (
                <div key={row.id} style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr .8fr .9fr", gap: "0", padding: "16px 18px", borderBottom: "1px solid rgba(255,255,255,.1)", alignItems: "center" }}>
                  <strong style={{ color: "white" }}>{getCompany(row)}</strong>
                  <span style={{ color: "rgba(255,255,255,.72)", overflow: "hidden", textOverflow: "ellipsis" }}>{getEmail(row)}</span>
                  <span style={{ color: "rgba(255,255,255,.72)" }}>{campaign?.name || "Campaign"}</span>
                  <span style={{ color: "#8fffd2", fontWeight: 900 }}>{getStatus(row)}</span>
                  <span style={{ color: "rgba(255,255,255,.62)" }}>{displayDate(row.sent_at || row.created_at)}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
