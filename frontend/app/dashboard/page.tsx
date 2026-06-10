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
  outreach: { daily_cap?: number } | null;
  status: string;
  created_at: string;
};

function getCampaignRole(campaign: Campaign) {
  return campaign.search?.target_role || campaign.target_business_type || "Target not set";
}

function getCampaignLocation(campaign: Campaign) {
  return campaign.search?.target_location || campaign.location || "";
}

function getDailyCap(campaign: Campaign) {
  return campaign.outreach?.daily_cap || 25;
}

export default function DashboardPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function loadDashboard() {
      setLoading(true);
      setErrorMessage("");

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

        {loading && <p className="muted">Loading your campaigns...</p>}
        {errorMessage && <p className="error-text">{errorMessage}</p>}

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

              return (
                <article className="campaign-row" key={campaign.id}>
                  <div>
                    <h3>{campaign.name}</h3>
                    <p>{role}{location ? ` in ${location}` : ""}</p>
                  </div>
                  <div className="campaign-meta">
                    <span>{campaign.status}</span>
                    <span>{dailyCap}/day</span>
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
