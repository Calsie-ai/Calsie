"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseClient } from "../../../lib/supabaseClient";

const roleSuggestions = [
  "Support Worker",
  "Disability Support Worker",
  "Community Support Worker",
  "Retail Assistant",
  "Kitchen Hand",
  "Cleaner",
  "Warehouse Worker",
  "Admin Assistant",
  "Customer Service",
  "Security Guard",
  "Barista",
  "Driver",
];

const locationSuggestions = [
  "Sydney NSW",
  "Berala NSW",
  "Parramatta NSW",
  "Bankstown NSW",
  "Blacktown NSW",
  "Liverpool NSW",
  "Chatswood NSW",
  "Burwood NSW",
  "Strathfield NSW",
  "Auburn NSW",
  "Granville NSW",
  "Remote Australia",
  "Anywhere in Australia",
];

const jobTypeOptions = ["Casual", "Part-time", "Full-time", "Contract", "Internship"];
const workModeOptions = ["On-site", "Hybrid", "Remote"];
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
const tailoringOptions = ["Tailor message only", "Tailor resume and message", "Use my resume only"];

const DAILY_JOB_LIMIT = 24;
const DAILY_EMAIL_LIMIT = 24;
const HOURLY_EMAIL_LIMIT = 1;
const CAMPAIGN_DAYS = 30;
const TOTAL_CAP = 720;
const APPROVAL_MODE = "Ask me before applying";

const checkboxListStyle = { display: "grid", gap: "10px", marginTop: "10px" };
const checkboxRowStyle = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "flex-start",
  gap: "10px",
  width: "100%",
  textAlign: "left" as const,
  lineHeight: 1.35,
  fontWeight: 600,
};
const checkboxInputStyle = {
  width: "18px",
  minWidth: "18px",
  maxWidth: "18px",
  height: "18px",
  margin: "2px 0 0",
  padding: 0,
  flex: "0 0 18px",
  display: "inline-block",
};

function toggleSelection(values: string[], option: string) {
  return values.includes(option) ? values.filter((value) => value !== option) : [...values, option];
}

export default function NewCampaignPage() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [name, setName] = useState("");
  const [targetRole, setTargetRole] = useState("");
  const [targetLocation, setTargetLocation] = useState("");
  const [jobTypes, setJobTypes] = useState<string[]>(["Casual", "Part-time"]);
  const [workModes, setWorkModes] = useState<string[]>(["On-site"]);
  const [postedWithin, setPostedWithin] = useState("Last 30 days");
  const [requirements, setRequirements] = useState<string[]>([]);
  const [tailoringMode, setTailoringMode] = useState("Tailor message only");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingUser, setCheckingUser] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const campaignSummary = useMemo(() => {
    const role = targetRole.trim() || "your selected role";
    const area = targetLocation.trim() || "your target area";
    const selectedTypes = jobTypes.length ? jobTypes.join(", ") : "any job type";
    const selectedModes = workModes.length ? workModes.join(", ") : "any work mode";
    const selectedRequirements = requirements.length ? requirements.join(", ") : "no extra requirements";
    return `Applix will look for ${selectedTypes} ${role} opportunities around ${area}, ${selectedModes.toLowerCase()}, posted ${postedWithin.toLowerCase()}, with ${selectedRequirements}. It will prepare up to 24 applications per day, release one each hour, and require your approval before sending for up to 30 days.`;
  }, [jobTypes, postedWithin, requirements, targetLocation, targetRole, workModes]);

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
          work_modes: workModes,
          posted_within: postedWithin,
          fetch_frequency: "daily",
          campaign_days: CAMPAIGN_DAYS,
          daily_job_limit: DAILY_JOB_LIMIT,
          notes: notes.trim() || null,
        },
        filters: {
          location: targetLocation.trim() || null,
          job_types: jobTypes,
          work_modes: workModes,
          posted_within: postedWithin,
          requirements,
          notes: notes.trim() || null,
        },
        outreach: {
          scheduled: true,
          active: true,
          gmail_consent_required: true,
          require_email: true,
          require_user_approval: true,
          approval_mode: APPROVAL_MODE,
          daily_job_limit: DAILY_JOB_LIMIT,
          daily_email_limit: DAILY_EMAIL_LIMIT,
          hourly_email_limit: HOURLY_EMAIL_LIMIT,
          daily_cap: DAILY_EMAIL_LIMIT,
          hourly_cap: HOURLY_EMAIL_LIMIT,
          campaign_days: CAMPAIGN_DAYS,
          total_cap: TOTAL_CAP,
          test_mode: false,
          tailoring_mode: tailoringMode,
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
      <section className="dashboard-card narrow-card" style={{ display: "grid", gap: "18px" }}>
        <div style={{ textAlign: "left" }}>
          <p className="eyebrow">Create campaign</p>
          <h1>Let&apos;s start with your job search</h1>
          <p className="muted" style={{ maxWidth: "620px" }}>
            Build one 30-day Applix campaign. Applix prepares up to 24 applications each day and sends no more than one approved application per hour.
          </p>
        </div>

        {checkingUser ? (
          <p className="muted">Checking your login...</p>
        ) : (
          <form className="campaign-form" onSubmit={createCampaign} style={{ display: "grid", gap: "22px" }}>
            <div style={{ display: "grid", gap: "14px" }}>
              <h2 style={{ margin: 0 }}>Campaign details</h2>

              <label>
                Campaign name <span aria-hidden="true">*</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="E.g. Sydney Support Worker Campaign"
                  required
                />
              </label>

              <label>
                What role are you targeting? <span aria-hidden="true">*</span>
                <input
                  value={targetRole}
                  onChange={(event) => setTargetRole(event.target.value)}
                  placeholder="Start typing, e.g. Support Worker"
                  list="applix-role-suggestions"
                  required
                />
                <datalist id="applix-role-suggestions">
                  {roleSuggestions.map((option) => <option key={option} value={option} />)}
                </datalist>
              </label>

              <label>
                Target area / location <span aria-hidden="true">*</span>
                <input
                  value={targetLocation}
                  onChange={(event) => setTargetLocation(event.target.value)}
                  placeholder="Start typing, e.g. Sydney NSW"
                  list="applix-location-suggestions"
                  required
                />
                <datalist id="applix-location-suggestions">
                  {locationSuggestions.map((option) => <option key={option} value={option} />)}
                </datalist>
                <small className="muted">Suggestions appear while typing. Users can still write any suburb, city, or remote area.</small>
              </label>
            </div>

            <div style={{ display: "grid", gap: "14px" }}>
              <h2 style={{ margin: 0 }}>Job filters</h2>

              <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                <legend>Job type</legend>
                <div style={checkboxListStyle}>
                  {jobTypeOptions.map((option) => (
                    <label key={option} style={checkboxRowStyle}>
                      <input
                        type="checkbox"
                        checked={jobTypes.includes(option)}
                        onChange={() => setJobTypes((current) => toggleSelection(current, option))}
                        style={checkboxInputStyle}
                      />
                      <span>{option}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                <legend>Work mode</legend>
                <div style={checkboxListStyle}>
                  {workModeOptions.map((option) => (
                    <label key={option} style={checkboxRowStyle}>
                      <input
                        type="checkbox"
                        checked={workModes.includes(option)}
                        onChange={() => setWorkModes((current) => toggleSelection(current, option))}
                        style={checkboxInputStyle}
                      />
                      <span>{option}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <label>
                Jobs posted within
                <select value={postedWithin} onChange={(event) => setPostedWithin(event.target.value)}>
                  {postedWithinOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
            </div>

            <div style={{ display: "grid", gap: "14px" }}>
              <h2 style={{ margin: 0 }}>Requirements</h2>
              <p className="muted" style={{ margin: 0 }}>Select anything important. Leave blank if you do not want to filter too much.</p>
              <div style={checkboxListStyle}>
                {requirementOptions.map((option) => (
                  <label key={option} style={checkboxRowStyle}>
                    <input
                      type="checkbox"
                      checked={requirements.includes(option)}
                      onChange={() => setRequirements((current) => toggleSelection(current, option))}
                      style={checkboxInputStyle}
                    />
                    <span>{option}</span>
                  </label>
                ))}
              </div>
            </div>

            <div style={{ display: "grid", gap: "14px" }}>
              <h2 style={{ margin: 0 }}>Campaign pace</h2>
              <div className="empty-state" style={{ textAlign: "left", width: "100%", display: "grid", gap: "8px" }}>
                <strong>24 applications per day</strong>
                <span>One approved application per hour</span>
                <span>30-day campaign · Up to 720 applications</span>
                <span>You must approve applications before they can be sent.</span>
              </div>

              <label>
                AI tailoring
                <select value={tailoringMode} onChange={(event) => setTailoringMode(event.target.value)}>
                  {tailoringOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
            </div>

            <label>
              Extra instructions
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="E.g. student friendly, no driver licence, night shift, exclude agencies, apply only within 30 minutes from home..."
                rows={5}
              />
            </label>

            <div className="empty-state" style={{ textAlign: "left", width: "100%" }}>
              <h2>Campaign preview</h2>
              <p>{campaignSummary}</p>
            </div>

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
