"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "../../lib/supabaseClient";

type Campaign = {
  id: string;
  name: string;
  target_role: string;
  target_location: string | null;
  daily_cap: number;
  status: string;
  created_at: string;
};

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
          .select("id,name,target_role,target_location,daily_cap,status,created_at")
          .eq("user_id", userData.user.id)
          .order("created_at", { ascending: false });

        if (error) {
          setErrorMessage(error.message);
          return;
        }

        setCampaigns(data || []);
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
            {campaigns.map((campaign) => (
              <article className="campaign-row" key={campaign.id}>
                <div>
                  <h3>{campaign.name}</h3>
                  <p>{campaign.target_role}{campaign.target_location ? ` in ${campaign.target_location}` : ""}</p>
                </div>
                <div className="campaign-meta">
                  <span>{campaign.status}</span>
                  <span>{campaign.daily_cap}/day</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
