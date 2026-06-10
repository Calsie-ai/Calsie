"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseClient } from "../../../lib/supabaseClient";

export default function NewCampaignPage() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [name, setName] = useState("");
  const [targetRole, setTargetRole] = useState("");
  const [targetLocation, setTargetLocation] = useState("");
  const [dailyCap, setDailyCap] = useState(100);
  const [hourlyCap, setHourlyCap] = useState(5);
  const [campaignDays, setCampaignDays] = useState(10);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingUser, setCheckingUser] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function checkUser() {
      try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase.auth.getUser();

        if (error || !data.user) {
          router.replace("/");
          return;
        }

        setUserId(data.user.id);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Could not check login.");
      } finally {
        setCheckingUser(false);
      }
    }

    checkUser();
  }, [router]);

  async function createCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setLoading(true);

    try {
      if (!userId) {
        setErrorMessage("Please sign in again before creating a campaign.");
        return;
      }

      const supabase = getSupabaseClient();
      const { error } = await supabase.from("campaigns").insert({
        user_id: userId,
        name: name.trim(),
        location: targetLocation.trim() || null,
        target_business_type: targetRole.trim(),
        search: {
          target_role: targetRole.trim(),
          target_location: targetLocation.trim() || null,
          fetch_frequency: "daily",
          campaign_days: campaignDays,
          notes: notes.trim() || null,
        },
        filters: {
          location: targetLocation.trim() || null,
          notes: notes.trim() || null,
        },
        outreach: {
          gmail_consent_required: true,
          hourly_cap: hourlyCap,
          daily_cap: dailyCap,
          campaign_days: campaignDays,
          total_cap: dailyCap * campaignDays,
          notes: notes.trim() || null,
        },
        status: "draft",
      });

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      router.push("/dashboard");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not create campaign.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="dashboard-card narrow-card">
        <p className="eyebrow">New campaign</p>
        <h1>Tell Applix what to target</h1>
        <p className="muted">Applix will fetch fresh leads every day and prepare outreach with safe limits.</p>

        {checkingUser ? (
          <p className="muted">Checking your login...</p>
        ) : (
          <form className="campaign-form" onSubmit={createCampaign}>
            <label>
              Campaign name
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Entry level IT campaign" required />
            </label>

            <label>
              Target role
              <input value={targetRole} onChange={(event) => setTargetRole(event.target.value)} placeholder="IT Assistant, Trainee, Data Entry" required />
            </label>

            <label>
              Target location
              <input value={targetLocation} onChange={(event) => setTargetLocation(event.target.value)} placeholder="Sydney, NSW" />
            </label>

            <label>
              Emails per hour
              <input type="number" min="1" max="10" value={hourlyCap} onChange={(event) => setHourlyCap(Number(event.target.value))} required />
            </label>

            <label>
              Emails per day
              <input type="number" min="1" max="100" value={dailyCap} onChange={(event) => setDailyCap(Number(event.target.value))} required />
            </label>

            <label>
              Campaign days
              <input type="number" min="1" max="30" value={campaignDays} onChange={(event) => setCampaignDays(Number(event.target.value))} required />
            </label>

            <div className="empty-state">
              <h2>Sending plan</h2>
              <p>Google consent required first. Limit: {hourlyCap} emails/hour, {dailyCap} emails/day, for {campaignDays} days. Fresh leads will be fetched every day.</p>
            </div>

            <label>
              Notes / campaign details
              <textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Company type, filters, tone, exclusions, job boards, notes..." rows={5} />
            </label>

            {errorMessage && <p className="error-text">{errorMessage}</p>}

            <div className="form-actions">
              <Link className="ghost-link" href="/dashboard">Back</Link>
              <button className="primary-button" type="submit" disabled={loading}>{loading ? "Saving..." : "Save campaign"}</button>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}
