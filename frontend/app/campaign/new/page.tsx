"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseClient } from "../../../lib/supabaseClient";

const roleOptions = [
  "Support Worker",
  "Disability Support Worker",
  "Retail Assistant",
  "Kitchen Hand",
  "Cleaner",
  "Warehouse Worker",
  "Admin Assistant",
  "Customer Service",
  "Security Guard",
  "Barista",
  "Driver",
  "Other",
];

const locationOptions = [
  "Sydney NSW",
  "Berala NSW",
  "Parramatta NSW",
  "Bankstown NSW",
  "Blacktown NSW",
  "Liverpool NSW",
  "Chatswood NSW",
  "Remote",
  "Anywhere in Australia",
  "Other",
];

const jobTypeOptions = ["Casual", "Part-time", "Full-time", "Contract", "Internship", "Remote", "Hybrid", "On-site"];
const postedWithinOptions = ["Last 24 hours", "Last 3 days", "Last 7 days", "Last 14 days", "Last 30 days"];
const requirementOptions = [
  "No experience required",
  "Student friendly",
  "Visa friendly",
  "Driver licence required",
  "No driver licence needed",
  "Morning shift",
  "Night shift",
  "Weekend work",
  "Immediate start",
  "Training provided",
  "NDIS related",
  "Police check",
  "Working With Children Check",
  "First Aid",
  "Own car",
];
const dailyLimitOptions = [10, 25, 50, 100];
const tailoringOptions = ["Tailor message only", "Tailor resume and message", "Use my resume only"];
const approvalModeOptions = ["Ask me before applying", "Auto-apply to strong matches", "Save matches only"];

function toggleSelection(values: string[], option: string) {
  return values.includes(option) ? values.filter((value) => value !== option) : [...values, option];
}

export default function NewCampaignPage() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [name, setName] = useState("");
  const [targetRole, setTargetRole] = useState("Support Worker");
  const [targetLocation, setTargetLocation] = useState("Sydney NSW");
  const [jobTypes, setJobTypes] = useState<string[]>(["Casual", "Part-time"]);
  const [postedWithin, setPostedWithin] = useState("Last 30 days");
  const [requirements, setRequirements] = useState<string[]>(["Student friendly", "No driver licence needed"]);
  const [dailyCap, setDailyCap] = useState(100);
  const hourlyCap = 5;
  const campaignDays = 10;
  const [tailoringMode, setTailoringMode] = useState("Tailor message only");
  const [approvalMode, setApprovalMode] = useState("Ask me before applying");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingUser, setCheckingUser] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const campaignSummary = useMemo(() => {
    const selectedTypes = jobTypes.length ? jobTypes.join(", ") : "any";
    const selectedRequirements = requirements.length ? requirements.join(", ") : "no extra requirements";
    return `Find ${selectedTypes} ${targetRole || "jobs"} around ${targetLocation || "my area"}, posted ${postedWithin.toLowerCase()}, with ${selectedRequirements}.`;
  }, [jobTypes, postedWithin, requirements, targetLocation, targetRole]);

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
          job_types: jobTypes,
          posted_within: postedWithin,
          fetch_frequency: "daily",
          campaign_days: campaignDays,
          notes: notes.trim() || null,
        },
        filters: {
          location: targetLocation.trim() || null,
          job_types: jobTypes,
          posted_within: postedWithin,
          requirements,
          notes: notes.trim() || null,
        },
        outreach: {
          gmail_consent_required: true,
          hourly_cap: hourlyCap,
          daily_cap: dailyCap,
          campaign_days: campaignDays,
          total_cap: dailyCap * campaignDays,
          tailoring_mode: tailoringMode,
          approval_mode: approvalMode,
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
      <section className="dashboard-card narrow-card" style={{ textAlign: "center", display: "grid", justifyItems: "center" }}>
        <p className="eyebrow" style={{ textAlign: "center" }}>Create campaign</p>
        <h1 style={{ textAlign: "center" }}>Create your Applix campaign</h1>
        <p className="muted" style={{ textAlign: "center", maxWidth: "560px" }}>
          Tell Applix what kind of opportunities you want. Setup takes around 2 minutes.
        </p>

        {checkingUser ? (
          <p className="muted">Checking your login...</p>
        ) : (
          <form className="campaign-form" onSubmit={createCampaign} style={{ width: "100%", display: "grid", gap: "18px", justifyItems: "center", textAlign: "center" }}>
            <div className="empty-state" style={{ width: "100%", textAlign: "left", lineHeight: 1.9 }}>
              <p style={{ margin: 0 }}>
                Hi Applix, I want to create a campaign called
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Sydney Support Worker Campaign"
                  required
                  style={{ textAlign: "center", margin: "0 8px", maxWidth: "320px" }}
                />
                .
              </p>

              <p style={{ margin: "14px 0 0" }}>
                I want to find opportunities as a
                <select value={targetRole} onChange={(event) => setTargetRole(event.target.value)} required style={{ margin: "0 8px", maxWidth: "260px" }}>
                  {roleOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
                around
                <select value={targetLocation} onChange={(event) => setTargetLocation(event.target.value)} style={{ margin: "0 8px", maxWidth: "260px" }}>
                  {locationOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
                .
              </p>

              <p style={{ margin: "14px 0 0" }}>
                I am looking for
                <select
                  multiple
                  value={jobTypes}
                  onChange={(event) => setJobTypes(Array.from(event.target.selectedOptions, (option) => option.value))}
                  style={{ margin: "0 8px", minHeight: "112px", verticalAlign: "middle" }}
                >
                  {jobTypeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
                jobs posted within
                <select value={postedWithin} onChange={(event) => setPostedWithin(event.target.value)} style={{ margin: "0 8px", maxWidth: "220px" }}>
                  {postedWithinOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
                .
              </p>

              <div style={{ marginTop: "16px" }}>
                <p style={{ margin: "0 0 8px" }}>My important requirements are</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {requirementOptions.map((option) => {
                    const selected = requirements.includes(option);
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setRequirements((current) => toggleSelection(current, option))}
                        className={selected ? "primary-button" : "ghost-link"}
                        style={{ padding: "8px 12px", borderRadius: "999px" }}
                      >
                        {option}
                      </button>
                    );
                  })}
                </div>
              </div>

              <p style={{ margin: "18px 0 0" }}>
                I want Applix to prepare
                <select value={dailyCap} onChange={(event) => setDailyCap(Number(event.target.value))} style={{ margin: "0 8px", maxWidth: "180px" }}>
                  {dailyLimitOptions.map((option) => <option key={option} value={option}>{option} per day</option>)}
                </select>
                applications per day.
              </p>
            </div>

            <label style={{ width: "100%", textAlign: "center" }}>
              AI tailoring
              <select value={tailoringMode} onChange={(event) => setTailoringMode(event.target.value)}>
                {tailoringOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>

            <label style={{ width: "100%", textAlign: "center" }}>
              Before applying
              <select value={approvalMode} onChange={(event) => setApprovalMode(event.target.value)}>
                {approvalModeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>

            <div className="empty-state" style={{ textAlign: "center", width: "100%" }}>
              <h2>Campaign preview</h2>
              <p>{campaignSummary}</p>
            </div>

            <label style={{ width: "100%", textAlign: "center" }}>
              Extra instructions
              <textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Part-time only, no driver licence, student friendly, night shift, exclude agencies..." rows={5} style={{ textAlign: "center" }} />
            </label>

            {errorMessage && <p className="error-text">{errorMessage}</p>}

            <div className="form-actions" style={{ width: "100%" }}>
              <Link className="ghost-link" href="/dashboard">Back</Link>
              <button className="primary-button" type="submit" disabled={loading}>{loading ? "Creating campaign..." : "Create Campaign"}</button>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}
