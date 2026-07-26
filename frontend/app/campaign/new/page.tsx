"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../providers/AuthProvider";
import { getSupabaseClient } from "../../../lib/supabaseClient";
import { loginPathFor } from "../../../lib/navigation";
import {
  claimPendingIntentForUser,
  consumePendingIntentAfterSuccess,
  discardPendingIntent,
  pendingIntentMatchesWorkflow,
  readPendingIntent,
  savePendingIntent,
  type PendingIntentV1,
} from "../../../lib/pendingIntent";

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
  const { status, user } = useAuth();
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
  const [errorMessage, setErrorMessage] = useState("");
  const [pendingIntent, setPendingIntent] = useState<PendingIntentV1 | null>(null);
  const [unclaimedIntent, setUnclaimedIntent] = useState<PendingIntentV1 | null>(null);
  const [draftRestored, setDraftRestored] = useState(false);
  const intentIdRef = useRef("");
  const dirtyRef = useRef(false);
  const restorationAttemptedRef = useRef(false);

  const campaignSummary = useMemo(() => {
    const role = targetRole.trim() || "your selected role";
    const area = targetLocation.trim() || "your target area";
    const selectedTypes = jobTypes.length ? jobTypes.join(", ") : "any job type";
    const selectedModes = workModes.length ? workModes.join(", ") : "any work mode";
    const selectedRequirements = requirements.length ? requirements.join(", ") : "no extra requirements";
    return `Applix will look for ${selectedTypes} ${role} opportunities around ${area}, ${selectedModes.toLowerCase()}, posted ${postedWithin.toLowerCase()}, with ${selectedRequirements}. It will prepare up to 24 applications per day, release one each hour, and require your approval before sending for up to 30 days.`;
  }, [jobTypes, postedWithin, requirements, targetLocation, targetRole, workModes]);

  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated") {
      if (dirtyRef.current) {
        const saved = persistCampaignDraft("create_campaign");
        if (saved) intentIdRef.current = saved.id;
      }
      router.replace(loginPathFor("/campaign/new?restoreIntent=1"));
      return;
    }
    if (!user || restorationAttemptedRef.current) return;
    restorationAttemptedRef.current = true;
    const intent = readPendingIntent();
    if (
      intent?.type !== "create_campaign"
      || !pendingIntentMatchesWorkflow(intent, "/campaign/new")
      || (intent.userHint && intent.userHint !== user.id)
    ) return;

    intentIdRef.current = intent.id;
    if (!intent.userHint) {
      setUnclaimedIntent(intent);
      return;
    }
    restoreCampaignDraft(intent);
  }, [router, status, user]);

  useEffect(() => {
    if (status !== "authenticated" || !user || !dirtyRef.current) return;
    const saved = persistCampaignDraft("editing");
    if (saved) {
      intentIdRef.current = saved.id;
      setPendingIntent(saved);
    }
  }, [jobTypes, name, notes, postedWithin, requirements, status, tailoringMode, targetLocation, targetRole, user, workModes]);

  function restoreCampaignDraft(intent: PendingIntentV1) {
    const values = intent.formValues || {};
    const nextJobTypes = Array.isArray(values.jobTypes)
      ? values.jobTypes.filter((value): value is string => typeof value === "string" && jobTypeOptions.includes(value))
      : [];
    const nextWorkModes = Array.isArray(values.workModes)
      ? values.workModes.filter((value): value is string => typeof value === "string" && workModeOptions.includes(value))
      : [];
    const nextRequirements = Array.isArray(values.requirements)
      ? values.requirements.filter((value): value is string => typeof value === "string" && requirementOptions.includes(value))
      : [];

    dirtyRef.current = false;
    setName(typeof values.name === "string" ? values.name : "");
    setTargetRole(typeof values.targetRole === "string" ? values.targetRole : "");
    setTargetLocation(typeof values.targetLocation === "string" ? values.targetLocation : "");
    setJobTypes(nextJobTypes);
    setWorkModes(nextWorkModes);
    setPostedWithin(typeof values.postedWithin === "string" && postedWithinOptions.includes(values.postedWithin) ? values.postedWithin : "Last 30 days");
    setRequirements(nextRequirements);
    setTailoringMode(typeof values.tailoringMode === "string" && tailoringOptions.includes(values.tailoringMode) ? values.tailoringMode : "Tailor message only");
    setNotes(typeof values.notes === "string" ? values.notes : "");
    setPendingIntent(intent);
    setUnclaimedIntent(null);
    setDraftRestored(true);
  }

  function persistCampaignDraft(intendedAction: string) {
    return savePendingIntent({
      id: intentIdRef.current || undefined,
      type: "create_campaign",
      returnPath: "/campaign/new?restoreIntent=1",
      panel: "campaign",
      formValues: {
        name,
        targetRole,
        targetLocation,
        jobTypes,
        workModes,
        postedWithin,
        requirements,
        tailoringMode,
        notes,
      },
      currentStep: "campaign_form",
      intendedAction,
      userHint: user?.id || pendingIntent?.userHint,
    });
  }

  function markDraftDirty() {
    dirtyRef.current = true;
  }

  function restoreUnclaimedDraft() {
    if (!unclaimedIntent || !user) return;
    const claimed = claimPendingIntentForUser(unclaimedIntent.id, user.id);
    if (!claimed) {
      setErrorMessage("This draft was replaced in another tab and could not be restored.");
      setUnclaimedIntent(null);
      return;
    }
    restoreCampaignDraft(claimed);
  }

  function discardDraft(intent: PendingIntentV1) {
    if (!discardPendingIntent(intent.id)) {
      setErrorMessage("This draft was already replaced in another tab.");
      return;
    }
    intentIdRef.current = "";
    dirtyRef.current = false;
    setPendingIntent(null);
    setUnclaimedIntent(null);
    setDraftRestored(false);
    setName("");
    setTargetRole("");
    setTargetLocation("");
    setJobTypes(["Casual", "Part-time"]);
    setWorkModes(["On-site"]);
    setPostedWithin("Last 30 days");
    setRequirements([]);
    setTailoringMode("Tailor message only");
    setNotes("");
  }

  async function createCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setLoading(true);

    try {
      const savedIntent = persistCampaignDraft("create_campaign");
      if (!user) {
        router.replace(loginPathFor("/campaign/new?restoreIntent=1"));
        return;
      }
      if (savedIntent) {
        intentIdRef.current = savedIntent.id;
        setPendingIntent(savedIntent);
      }

      const supabase = getSupabaseClient();
      const { error } = await supabase.from("campaigns").insert({
        user_id: user.id,
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

      if (savedIntent) consumePendingIntentAfterSuccess(savedIntent.id);
      router.push("/dashboard?panel=overview");
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

        {unclaimedIntent ? (
          <div className="empty-state" role="status" aria-live="polite" style={{ textAlign: "left", width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <span>A campaign draft is ready. Restore it to this account?</span>
            <span style={{ display: "flex", gap: 8 }}>
              <button type="button" className="primary-button" onClick={restoreUnclaimedDraft}>Restore draft</button>
              <button type="button" className="ghost-link" onClick={() => discardDraft(unclaimedIntent)}>Discard draft</button>
            </span>
          </div>
        ) : null}

        {draftRestored && pendingIntent ? (
          <div className="empty-state" role="status" aria-live="polite" style={{ textAlign: "left", width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <span>Your campaign draft has been restored.</span>
            <button type="button" className="ghost-link" onClick={() => discardDraft(pendingIntent)}>Discard draft</button>
          </div>
        ) : null}

        {status === "loading" ? (
          <p className="muted">Checking your login...</p>
        ) : (
          <form className="campaign-form" onSubmit={createCampaign} style={{ display: "grid", gap: "22px" }}>
            <div style={{ display: "grid", gap: "14px" }}>
              <h2 style={{ margin: 0 }}>Campaign details</h2>

              <label>
                Campaign name <span aria-hidden="true">*</span>
                <input
                  value={name}
                  onChange={(event) => { markDraftDirty(); setName(event.target.value); }}
                  placeholder="E.g. Sydney Support Worker Campaign"
                  required
                />
              </label>

              <label>
                What role are you targeting? <span aria-hidden="true">*</span>
                <input
                  value={targetRole}
                  onChange={(event) => { markDraftDirty(); setTargetRole(event.target.value); }}
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
                  onChange={(event) => { markDraftDirty(); setTargetLocation(event.target.value); }}
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
                        onChange={() => { markDraftDirty(); setJobTypes((current) => toggleSelection(current, option)); }}
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
                        onChange={() => { markDraftDirty(); setWorkModes((current) => toggleSelection(current, option)); }}
                        style={checkboxInputStyle}
                      />
                      <span>{option}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <label>
                Jobs posted within
                <select value={postedWithin} onChange={(event) => { markDraftDirty(); setPostedWithin(event.target.value); }}>
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
                      onChange={() => { markDraftDirty(); setRequirements((current) => toggleSelection(current, option)); }}
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
                <select value={tailoringMode} onChange={(event) => { markDraftDirty(); setTailoringMode(event.target.value); }}>
                  {tailoringOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
            </div>

            <label>
              Extra instructions
              <textarea
                value={notes}
                onChange={(event) => { markDraftDirty(); setNotes(event.target.value); }}
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
              <Link className="ghost-link" href="/dashboard?panel=templates">Back</Link>
              <button className="primary-button" type="submit" disabled={loading}>{loading ? "Creating campaign..." : "Create Campaign"}</button>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}
