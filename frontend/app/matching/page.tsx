"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

type MatchJob = {
  id: string;
  title: string;
  company: string;
  location: string;
  salary: string;
  type: string;
  description: string;
  tags: string[];
  logo: string;
  match: number;
  applyUrl?: string | null;
  contactEmail?: string | null;
};

type ResumeProfile = {
  full_name: string;
  target_role: string;
  industry: string;
  industry_specialisation: string;
  target_keywords: string[];
  phone: string;
  email: string;
  location: string;
  profile_summary: string;
  skills: string[];
  work_experience: any[];
  education_locked: any[];
  certifications_locked: any[];
};

type ResumeDraft = {
  summary: string;
  skills: string[];
  bullets: string[];
  coverNote: string;
};

type FlowState = "idle" | "generating" | "draft" | "editing" | "approved" | "email" | "opened";
type JobInteractionAction = "viewed" | "skipped" | "saved" | "resume_created" | "application_prepared" | "sent" | "failed";

const fallbackProfile: ResumeProfile = {
  full_name: "Your Name",
  target_role: "Applicant",
  industry: "",
  industry_specialisation: "",
  target_keywords: [],
  phone: "Add phone in profile",
  email: "Add email in profile",
  location: "Sydney",
  profile_summary: "",
  skills: [],
  work_experience: [],
  education_locked: [],
  certifications_locked: [],
};

export default function MatchingPage() {
  const [jobs, setJobs] = useState<MatchJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState("");
  const [message, setMessage] = useState("");
  const [index, setIndex] = useState(0);
  const [profile, setProfile] = useState<ResumeProfile>(fallbackProfile);
  const [resumeDraft, setResumeDraft] = useState<ResumeDraft | null>(null);
  const [flowState, setFlowState] = useState<FlowState>("idle");
  const [aiMessage, setAiMessage] = useState("");
  const [showFullDescription, setShowFullDescription] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [savedJobIds, setSavedJobIds] = useState<string[]>([]);

  useEffect(() => {
    loadEverything();
  }, []);

  useEffect(() => {
    if (job?.contactEmail) setRecipientEmail(job.contactEmail);
    if (job) recordJobInteraction("viewed", job, false);
  }, [index, jobs]);

  async function loadEverything() {
    setLoading(true);
    const loadedProfile = await loadProfile();
    await loadJobs(loadedProfile);
    setLoading(false);
  }

  async function loadProfile() {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;

    if (!user) {
      setProfile(fallbackProfile);
      return fallbackProfile;
    }

    const userEmail = user.email || "";
    const authName = getAuthUserName(user);

    const { data: resumeRow } = await supabase
      .from("resume_profiles")
      .select("full_name,target_role,industry,industry_specialisation,target_keywords,phone,email,location,profile_summary,skills,work_experience,education_locked,certifications_locked")
      .eq("profile_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (resumeRow) {
      const loadedProfile = {
        full_name: resumeRow.full_name || authName,
        target_role: resumeRow.target_role || "Applicant",
        industry: resumeRow.industry || "",
        industry_specialisation: resumeRow.industry_specialisation || "",
        target_keywords: Array.isArray(resumeRow.target_keywords) ? resumeRow.target_keywords : [],
        phone: resumeRow.phone || "Add phone in profile",
        email: resumeRow.email || userEmail || "Add email in profile",
        location: resumeRow.location || "Sydney",
        profile_summary: resumeRow.profile_summary || "",
        skills: Array.isArray(resumeRow.skills) ? resumeRow.skills : [],
        work_experience: Array.isArray(resumeRow.work_experience) ? resumeRow.work_experience : [],
        education_locked: Array.isArray(resumeRow.education_locked) ? resumeRow.education_locked : [],
        certifications_locked: Array.isArray(resumeRow.certifications_locked) ? resumeRow.certifications_locked : [],
      };
      setProfile(loadedProfile);
      return loadedProfile;
    }

    const { data: profileRow } = await supabase
      .from("profiles")
      .select("full_name,email,phone,location")
      .eq("id", user.id)
      .maybeSingle();

    const loadedProfile = {
      ...fallbackProfile,
      full_name: profileRow?.full_name || authName,
      phone: profileRow?.phone || "Add phone in profile",
      email: profileRow?.email || userEmail || "Add email in profile",
      location: profileRow?.location || "Sydney",
    };

    setProfile(loadedProfile);
    return loadedProfile;
  }

  async function loadJobs(profileForSearch = profile) {
    setResumeDraft(null);
    setFlowState("idle");
    setAiMessage("");
    setShowFullDescription(false);
    setRecipientEmail("");

    const params = new URLSearchParams({
      role: profileForSearch.target_role || "support worker",
      location: profileForSearch.location || "Sydney",
      country: "au",
      max_days: "30",
    });

    if (profileForSearch.industry) params.set("industry", profileForSearch.industry);
    if (profileForSearch.industry_specialisation) params.set("specialisation", profileForSearch.industry_specialisation);
    if (profileForSearch.target_keywords.length) params.set("keywords", profileForSearch.target_keywords.join(" "));

    try {
      const response = await fetch(`/api/jobs?${params.toString()}`, { cache: "no-store" });
      const data = await response.json();
      setJobs(data.jobs || []);
      setSource(data.source || "unknown");
      setMessage(data.message || `Jobs loaded for ${data.query || profileForSearch.target_role}.`);
      setIndex(0);
      if (data.jobs?.[0]?.contactEmail) setRecipientEmail(data.jobs[0].contactEmail);
    } catch (error: any) {
      setMessage(error?.message || "Could not load jobs.");
      setJobs([]);
    }
  }

  const job = jobs[index];
  const jobDescription = job?.description || "No description provided.";
  const isLongDescription = jobDescription.length > 460;
  const isEditing = flowState === "editing";
  const currentJobKey = getJobKey(job);
  const isCurrentJobSaved = currentJobKey ? savedJobIds.includes(currentJobKey) : false;
  const emailSubject = job ? `Application for ${job.title} - ${profile.full_name}` : "Application";
  const emailBody = resumeDraft ? buildEmailBody(resumeDraft, profile, job) : "";
  const mailtoUrl = `mailto:${encodeURIComponent(recipientEmail)}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
  const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(recipientEmail)}&su=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;

  function resetForNext(newIndex: number) {
    setResumeDraft(null);
    setFlowState("idle");
    setAiMessage("");
    setShowFullDescription(false);
    setRecipientEmail(jobs[newIndex]?.contactEmail || "");
    setIndex(newIndex);
  }

  function nextJob() {
    if (jobs.length) resetForNext((index + 1) % jobs.length);
  }

  function previousJob() {
    if (jobs.length) resetForNext(index === 0 ? jobs.length - 1 : index - 1);
  }

  async function recordJobInteraction(action: JobInteractionAction, targetJob = job, showMessage = true) {
    if (!targetJob) return;

    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;

      const { error } = await supabase.from("job_interactions").insert({
        user_id: user?.id || null,
        job_id: getJobKey(targetJob),
        job_title: targetJob.title || null,
        company: targetJob.company || null,
        action,
      });

      if (error) throw error;

      if (showMessage && action === "saved") setAiMessage("Job saved. Applix will remember this match.");
    } catch (error) {
      if (showMessage) {
        setAiMessage("Action saved on this screen. Add the job_interactions table in Supabase to save it permanently.");
      }
    }
  }

  async function saveCurrentJob() {
    if (!job || !currentJobKey) return;
    setSavedJobIds((current) => current.includes(currentJobKey) ? current : [...current, currentJobKey]);
    await recordJobInteraction("saved");
  }

  async function skipCurrentJob() {
    await recordJobInteraction("skipped", job, false);
    nextJob();
  }

  async function createResumeDraft() {
    if (!job) return;

    await recordJobInteraction("resume_created", job, false);
    setFlowState("generating");
    setAiMessage("Generating tailored resume with OpenAI...");

    try {
      const response = await fetch("/api/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job, profile }),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "OpenAI resume generation failed.");
      }

      setResumeDraft(data.draft);
      setAiMessage(`Generated with ${data.model || "OpenAI"}.`);
      setFlowState("draft");
    } catch (error: any) {
      setAiMessage(error?.message || "Could not generate with OpenAI. Using basic draft instead.");
      setResumeDraft(createFallbackDraft(job, profile));
      setFlowState("draft");
    }
  }

  function updateProfileField(key: "full_name" | "phone" | "email" | "location" | "target_role", value: string) {
    setProfile((current) => ({ ...current, [key]: value }));
  }

  function updateResumeField(key: keyof ResumeDraft, value: string) {
    setResumeDraft((current) => {
      if (!current) return current;
      if (key === "skills" || key === "bullets") {
        return {
          ...current,
          [key]: value.split("\n").map((item) => item.trim()).filter(Boolean),
        };
      }
      return { ...current, [key]: value };
    });
  }

  function validateEmailDraft(event: React.MouseEvent<HTMLAnchorElement>) {
    if (!recipientEmail.includes("@")) {
      event.preventDefault();
      setAiMessage("No hiring email found in this job ad. Add the employer email first, or use Visit jobsite.");
      return;
    }
    setFlowState("opened");
    recordJobInteraction("application_prepared", job, false);
  }

  if (loading) return <main style={styles.loading}>Loading job matches...</main>;

  if (!job) {
    return (
      <main style={styles.main}>
        <section style={styles.shell}>
          <Link href="/" style={styles.back}>Back home</Link>
          <div style={styles.emptyCard}>
            <h1>No jobs loaded</h1>
            <p>{message}</p>
            <button onClick={loadEverything} style={styles.primaryButton}>Try again</button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main style={styles.main}>
      <section style={styles.shell}>
        <header style={styles.header}>
          <Link href="/" style={styles.back}>Back home</Link>
          <div style={styles.headerCenter}>
            <strong>Applix Matching</strong>
            <span>{index + 1} of {jobs.length}</span>
          </div>
          <button onClick={loadEverything} style={styles.refresh}>Refresh</button>
        </header>

        <div style={styles.statusBar}>
          <span style={source === "adzuna" ? styles.liveDot : styles.demoDot} />
          <span>{source === "adzuna" ? `Live Adzuna jobs for ${profile.target_role}` : message}</span>
        </div>

        <article style={styles.jobCard}>
          <div style={styles.topRow}>
            <div>
              <p style={styles.company}>{job.company || "Company not listed"}</p>
              <h1 style={styles.title}>{job.title || "Untitled job"}</h1>
            </div>
            <div style={styles.match}>{job.match || 75}%</div>
          </div>

          <div style={styles.metaRow}>
            <span>{job.location || "Location not listed"}</span>
            <span>{job.salary || "Salary not listed"}</span>
            <span>{job.type || "Job type not listed"}</span>
            {isCurrentJobSaved && <span style={styles.savedPill}>Saved</span>}
          </div>

          {job.contactEmail && <div style={styles.contactFound}>Hiring email found: {job.contactEmail}</div>}
          {job.applyUrl && <a href={job.applyUrl} target="_blank" rel="noreferrer" style={styles.jobsiteButton}>Visit jobsite</a>}

          <section style={styles.sectionBox}>
            <h2>Job summary</h2>
            <p>{showFullDescription ? jobDescription : trimText(jobDescription, 460)}</p>
            {isLongDescription && <button onClick={() => setShowFullDescription(!showFullDescription)} style={styles.readMoreButton}>{showFullDescription ? "Show less" : "Read more"}</button>}
          </section>

          <section style={styles.sectionBoxLight}>
            <h2>Signals</h2>
            <div style={styles.tags}>{(job.tags || []).slice(0, 5).map((tag) => <span key={tag} style={styles.tag}>{tag}</span>)}</div>
          </section>

          <section style={styles.kitBox}>
            <p style={styles.kitLabel}>Application kit</p>
            <h2>Create tailored resume</h2>
            <p>Applix uses your saved profile, this job ad, and OpenAI to create a targeted resume, cover note, and application steps.</p>
            <button onClick={createResumeDraft} disabled={flowState === "generating"} style={styles.primaryButton}>{flowState === "generating" ? "Generating..." : "Create AI resume draft"}</button>
          </section>

          {aiMessage && <div style={styles.aiMessage}>{aiMessage}</div>}

          {resumeDraft && (
            <section style={styles.resumePanel}>
              <h2 style={styles.greenTitle}>Resume ready for {job.title}</h2>
              {isEditing && <div style={styles.editableHint}>Editing is on. Type directly inside the resume below, then press Save edits.</div>}

              <article style={isEditing ? styles.resumePaperEditing : styles.resumePaper}>
                <header style={styles.paperHeader}>
                  {isEditing ? (
                    <>
                      <input aria-label="Full name" style={styles.paperNameInput} value={profile.full_name} onChange={(event) => updateProfileField("full_name", event.target.value)} />
                      <input aria-label="Target role" style={styles.paperRoleInput} value={profile.target_role || job.title} onChange={(event) => updateProfileField("target_role", event.target.value)} />
                      <div style={styles.contactGrid}>
                        <input aria-label="Phone" style={styles.paperInput} value={profile.phone} onChange={(event) => updateProfileField("phone", event.target.value)} />
                        <input aria-label="Email" style={styles.paperInput} value={profile.email} onChange={(event) => updateProfileField("email", event.target.value)} />
                        <input aria-label="Location" style={styles.paperInput} value={profile.location} onChange={(event) => updateProfileField("location", event.target.value)} />
                      </div>
                    </>
                  ) : (
                    <><h1>{profile.full_name}</h1><strong>{job.title || profile.target_role}</strong><p>{profile.phone} | {profile.email} | {profile.location}</p></>
                  )}
                </header>

                <PaperSection title="Profile">
                  {isEditing ? <textarea aria-label="Profile summary" style={styles.paperTextarea} value={resumeDraft.summary} onChange={(event) => updateResumeField("summary", event.target.value)} /> : <p>{resumeDraft.summary}</p>}
                </PaperSection>

                <PaperSection title="Key skills">
                  {isEditing ? <textarea aria-label="Key skills" style={styles.paperTextarea} value={resumeDraft.skills.join("\n")} onChange={(event) => updateResumeField("skills", event.target.value)} /> : <ul>{resumeDraft.skills.map((skill) => <li key={skill}>{skill}</li>)}</ul>}
                </PaperSection>

                <PaperSection title="Work experience">
                  {isEditing ? (
                    <textarea aria-label="Experience bullets" style={styles.paperTextarea} value={resumeDraft.bullets.join("\n")} onChange={(event) => updateResumeField("bullets", event.target.value)} />
                  ) : profile.work_experience.length ? profile.work_experience.slice(0, 2).map((item, itemIndex) => (
                    <div key={itemIndex}><h3>{item.job_title || job.title}</h3><strong>{item.company || "Previous employer"}</strong><ul>{resumeDraft.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul></div>
                  )) : <ul>{resumeDraft.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>}
                </PaperSection>

                {!!profile.education_locked.length && <PaperSection title="Education">{profile.education_locked.map((item, itemIndex) => <p key={itemIndex}>{item.qualification || item.institution || "Education item"} {item.institution ? `- ${item.institution}` : ""} {item.year || ""}</p>)}</PaperSection>}
                {!!profile.certifications_locked.length && <PaperSection title="Certifications"><ul>{profile.certifications_locked.map((item, itemIndex) => <li key={itemIndex}>{item.name || item.provider || "Certification"}</li>)}</ul></PaperSection>}
              </article>

              {isEditing && (
                <section style={styles.editorPanel}>
                  <label style={styles.editorLabel}>Email / cover note<textarea style={styles.textarea} value={resumeDraft.coverNote} onChange={(event) => updateResumeField("coverNote", event.target.value)} /></label>
                </section>
              )}

              <div style={styles.resumeActions}>
                <button onClick={() => setFlowState(isEditing ? "draft" : "editing")} style={styles.secondaryButton}>{isEditing ? "Save edits" : "Edit Resume"}</button>
                <button onClick={() => window.print()} style={styles.secondaryButton}>Download PDF</button>
                <button onClick={() => setFlowState("approved")} style={styles.approveButton}>Approve Resume</button>
              </div>

              {flowState === "approved" && <div style={styles.approvedBox}><strong>Resume approved. Next, prepare the Gmail draft.</strong><button onClick={() => setFlowState("email")} style={styles.smallButton}>Prepare Gmail draft</button></div>}

              {(flowState === "email" || flowState === "opened") && (
                <section style={styles.emailDraft}>
                  <h2>Gmail draft</h2>
                  <p style={styles.helperText}>If Adzuna includes a hiring email in the job description, Applix fills it below. Gmail web opens reliably in Chrome; the app button uses your device default email app.</p>
                  <label style={styles.editorLabel}>Employer email<input style={styles.input} value={recipientEmail} onChange={(event) => setRecipientEmail(event.target.value)} placeholder="employer email" /></label>
                  <p><strong>Subject:</strong> {emailSubject}</p>
                  <div style={styles.emailBody}>{emailBody}</div>
                  <div style={styles.emailButtons}>
                    <a href={gmailUrl} target="_blank" rel="noreferrer" onClick={validateEmailDraft} style={styles.approveButton}>{flowState === "opened" ? "Gmail opened" : "Open Gmail web"}</a>
                    <a href={mailtoUrl} onClick={validateEmailDraft} style={styles.secondaryButton}>Open email app</a>
                  </div>
                </section>
              )}
            </section>
          )}

          <div style={styles.actions}>
            <button onClick={previousJob} style={styles.secondaryButton}>Previous</button>
            <button onClick={skipCurrentJob} style={styles.secondaryButton}>Skip</button>
            <button onClick={saveCurrentJob} style={isCurrentJobSaved ? styles.savedButton : styles.secondaryButton}>{isCurrentJobSaved ? "Saved" : "Save Job"}</button>
            <button onClick={resumeDraft ? nextJob : createResumeDraft} style={styles.primaryButton}>{resumeDraft ? "Next job" : "Create resume"}</button>
          </div>
        </article>
      </section>
    </main>
  );
}

function PaperSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section style={styles.paperSection}><h2>{title}</h2>{children}</section>;
}

function getJobKey(job?: MatchJob) {
  if (!job) return "";
  return String(job.id || `${job.company}-${job.title}-${job.location}`);
}

function getAuthUserName(user: any) {
  const metadata = user?.user_metadata || {};
  const metadataName = metadata.full_name || metadata.name || metadata.display_name;
  if (metadataName) return String(metadataName);

  const email = String(user?.email || "");
  const prefix = email.split("@")[0];
  if (prefix) {
    return prefix
      .replace(/[._-]+/g, " ")
      .split(" ")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  return "Your Name";
}

function createFallbackDraft(job: MatchJob, profile: ResumeProfile): ResumeDraft {
  const cleanTags = (job.tags || []).filter((tag) => tag !== "Adzuna" && tag !== "Live job");
  const baseSkills = profile.skills.length ? profile.skills : ["Client communication", "Documentation", "Safe work practices"];

  return {
    summary: profile.profile_summary || `Reliable ${job.title} candidate with practical experience, strong communication, and a client-focused approach. Interested in ${job.company} and ready to support the requirements of this role.`,
    skills: Array.from(new Set([...cleanTags, ...baseSkills, ...profile.target_keywords, "Reliable shift attendance"])).slice(0, 8),
    bullets: buildExperienceBullets(job, profile),
    coverNote: `Dear Hiring Manager,\n\nI am interested in the ${job.title} position at ${job.company}. My experience, skills, and reliability align with this opportunity.\n\nKind regards,\n${profile.full_name}`,
  };
}

function buildExperienceBullets(job: MatchJob, profile: ResumeProfile) {
  const firstExperience = profile.work_experience[0];
  if (firstExperience?.description) {
    return String(firstExperience.description).split("\n").map((item) => item.trim()).filter(Boolean).slice(0, 4);
  }

  return [
    `Performed duties relevant to the ${job.title} role with reliability and care.`,
    "Communicated clearly with clients, families, coordinators, and team members.",
    "Followed instructions, maintained safety, and completed clear notes or documentation.",
  ];
}

function buildEmailBody(resumeDraft: ResumeDraft, profile: ResumeProfile, job?: MatchJob) {
  return `${resumeDraft.coverNote}\n\n---\nResume\n\n${profile.full_name}\n${job?.title || profile.target_role}\n${profile.phone} | ${profile.email} | ${profile.location}\n\nProfile\n${resumeDraft.summary}\n\nKey skills\n${resumeDraft.skills.map((skill) => `- ${skill}`).join("\n")}\n\nExperience\n${resumeDraft.bullets.map((bullet) => `- ${bullet}`).join("\n")}`;
}

function trimText(value: string, limit: number) {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit).trim()}...`;
}

const styles = {
  loading: { minHeight: "100vh", display: "grid", placeItems: "center", fontFamily: "Arial, Helvetica, sans-serif", background: "#f6f7fb", color: "#111827" },
  main: { minHeight: "100vh", background: "#f6f7fb", color: "#111827", fontFamily: "Arial, Helvetica, sans-serif", padding: 20 },
  shell: { maxWidth: 860, margin: "0 auto" },
  header: { display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 16, padding: "14px 0 22px" },
  headerCenter: { display: "grid", gap: 4, textAlign: "center" as const },
  back: { color: "#111827", textDecoration: "none", fontWeight: 800 },
  refresh: { justifySelf: "end", border: "1px solid #e5e7eb", background: "white", borderRadius: 999, padding: "10px 14px", fontWeight: 800, cursor: "pointer" },
  statusBar: { display: "flex", alignItems: "center", gap: 10, marginBottom: 14, padding: "12px 14px", background: "white", border: "1px solid #e5e7eb", borderRadius: 18, fontWeight: 800, color: "#334155" },
  liveDot: { width: 10, height: 10, borderRadius: 999, background: "#22c55e" },
  demoDot: { width: 10, height: 10, borderRadius: 999, background: "#f59e0b" },
  jobCard: { background: "white", border: "1px solid #e5e7eb", borderRadius: 28, padding: 26, boxShadow: "0 18px 50px rgba(15,23,42,0.08)" },
  topRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 18 },
  company: { margin: 0, color: "#64748b", fontWeight: 900, fontSize: 17 },
  title: { margin: "8px 0 0", fontSize: "clamp(34px, 6vw, 54px)", lineHeight: 1, letterSpacing: -2 },
  match: { minWidth: 70, textAlign: "center" as const, borderRadius: 18, padding: "12px 10px", background: "#ecfdf5", color: "#047857", fontWeight: 900, fontSize: 20 },
  metaRow: { display: "flex", flexWrap: "wrap" as const, gap: 10, marginTop: 22 },
  savedPill: { borderRadius: 999, background: "#dcfce7", color: "#166534", padding: "8px 12px", fontWeight: 900 },
  contactFound: { display: "inline-block", marginTop: 18, marginRight: 10, borderRadius: 999, background: "#dcfce7", color: "#166534", padding: "13px 18px", fontWeight: 900 },
  jobsiteButton: { display: "inline-block", marginTop: 18, borderRadius: 999, background: "#2563eb", color: "white", padding: "13px 18px", fontWeight: 900, textDecoration: "none" },
  sectionBox: { marginTop: 22, padding: 20, borderRadius: 22, background: "#f8fafc", color: "#334155", lineHeight: 1.7 },
  readMoreButton: { border: 0, background: "transparent", color: "#2563eb", fontWeight: 900, padding: "8px 0 0", cursor: "pointer" },
  sectionBoxLight: { marginTop: 14, padding: 20, borderRadius: 22, border: "1px solid #e5e7eb" },
  tags: { display: "flex", flexWrap: "wrap" as const, gap: 8 },
  tag: { borderRadius: 999, background: "#f1f5f9", padding: "8px 12px", fontWeight: 800, color: "#475569" },
  kitBox: { marginTop: 16, padding: 22, borderRadius: 24, background: "#111827", color: "white", lineHeight: 1.6 },
  kitLabel: { margin: 0, textTransform: "uppercase" as const, letterSpacing: 1.5, fontSize: 12, fontWeight: 900, color: "#94a3b8" },
  aiMessage: { marginTop: 14, padding: 14, borderRadius: 18, background: "#eef2ff", color: "#3730a3", fontWeight: 900 },
  resumePanel: { marginTop: 16, padding: 22, borderRadius: 24, border: "1px solid #d1fae5", background: "#f0fdf4" },
  greenTitle: { margin: "0 0 14px", color: "#047857" },
  editableHint: { marginBottom: 12, padding: 12, borderRadius: 16, background: "#dcfce7", color: "#166534", fontWeight: 900 },
  editorPanel: { marginTop: 16, padding: 18, borderRadius: 22, background: "#ffffff", border: "1px solid #bbf7d0" },
  editorHeader: { display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start", marginBottom: 14 },
  editorTitle: { margin: "6px 0 0", color: "#111827" },
  editorLabel: { display: "grid", gap: 8, marginTop: 12, color: "#334155", fontWeight: 900 },
  contactGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 },
  input: { border: "1px solid #d1d5db", borderRadius: 16, padding: 13, fontFamily: "Arial, Helvetica, sans-serif", fontSize: 15 },
  helperText: { color: "#166534", lineHeight: 1.6, fontWeight: 800 },
  textarea: { minHeight: 110, border: "1px solid #d1d5db", borderRadius: 16, padding: 13, fontFamily: "Arial, Helvetica, sans-serif", fontSize: 14, lineHeight: 1.5, resize: "vertical" as const },
  smallDarkButton: { border: 0, borderRadius: 999, background: "#111827", color: "white", padding: "10px 14px", fontWeight: 900, cursor: "pointer" },
  resumePaper: { background: "white", border: "1px solid #e5e7eb", borderRadius: 14, padding: 22, color: "#111827" },
  resumePaperEditing: { background: "white", border: "2px solid #22c55e", borderRadius: 14, padding: 22, color: "#111827" },
  paperHeader: { textAlign: "center" as const, borderBottom: "2px solid #111827", paddingBottom: 14, marginBottom: 18 },
  paperSection: { borderBottom: "1px solid #e5e7eb", paddingBottom: 12, marginBottom: 14, lineHeight: 1.6 },
  paperNameInput: { width: "100%", border: "1px solid #bbf7d0", borderRadius: 12, padding: 10, textAlign: "center" as const, fontSize: 28, fontWeight: 900, marginBottom: 8 },
  paperRoleInput: { width: "100%", border: "1px solid #bbf7d0", borderRadius: 12, padding: 10, textAlign: "center" as const, fontSize: 16, fontWeight: 900, marginBottom: 8 },
  paperInput: { width: "100%", border: "1px solid #bbf7d0", borderRadius: 12, padding: 10, fontFamily: "Arial, Helvetica, sans-serif", fontSize: 14 },
  paperTextarea: { width: "100%", minHeight: 120, border: "1px solid #bbf7d0", borderRadius: 12, padding: 12, fontFamily: "Arial, Helvetica, sans-serif", fontSize: 14, lineHeight: 1.5, resize: "vertical" as const },
  resumeActions: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14 },
  approveButton: { gridColumn: "1 / -1", display: "block", textAlign: "center" as const, border: 0, borderRadius: 999, background: "#22c55e", color: "white", padding: "15px 18px", fontWeight: 900, cursor: "pointer", textDecoration: "none" },
  approvedBox: { marginTop: 14, padding: 16, borderRadius: 18, background: "#dcfce7", color: "#166534" },
  smallButton: { display: "block", marginTop: 12, border: 0, borderRadius: 999, background: "#166534", color: "white", padding: "10px 14px", fontWeight: 900, cursor: "pointer" },
  emailDraft: { marginTop: 14, padding: 18, borderRadius: 22, background: "#ecfdf5", border: "1px solid #bbf7d0" },
  emailBody: { whiteSpace: "pre-line" as const, background: "white", border: "1px solid #e5e7eb", borderRadius: 16, padding: 16, lineHeight: 1.7 },
  emailButtons: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14 },
  actions: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1.3fr", gap: 12, marginTop: 20 },
  primaryButton: { display: "block", textAlign: "center" as const, border: 0, borderRadius: 999, background: "#111827", color: "white", padding: "15px 18px", fontWeight: 900, textDecoration: "none", cursor: "pointer" },
  secondaryButton: { display: "block", textAlign: "center" as const, border: "1px solid #e5e7eb", borderRadius: 999, background: "white", color: "#111827", padding: "15px 18px", fontWeight: 900, textDecoration: "none", cursor: "pointer" },
  savedButton: { display: "block", textAlign: "center" as const, border: "1px solid #bbf7d0", borderRadius: 999, background: "#dcfce7", color: "#166534", padding: "15px 18px", fontWeight: 900, textDecoration: "none", cursor: "pointer" },
  emptyCard: { background: "white", borderRadius: 26, padding: 26, border: "1px solid #e5e7eb" },
};