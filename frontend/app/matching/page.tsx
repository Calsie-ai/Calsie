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
};

type ResumeProfile = {
  full_name: string;
  target_role: string;
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

type FlowState = "idle" | "generating" | "draft" | "editing" | "approved" | "email" | "sent";

const fallbackProfile: ResumeProfile = {
  full_name: "Your Name",
  target_role: "Applicant",
  phone: "Add phone in profile",
  email: "Add email in profile",
  location: "Add location in profile",
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

  useEffect(() => {
    loadEverything();
  }, []);

  async function loadEverything() {
    setLoading(true);
    await Promise.all([loadProfile(), loadJobs()]);
    setLoading(false);
  }

  async function loadProfile() {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;

    if (!user) {
      setProfile(fallbackProfile);
      return;
    }

    const { data: resumeRow } = await supabase
      .from("resume_profiles")
      .select("full_name,target_role,phone,email,location,profile_summary,skills,work_experience,education_locked,certifications_locked")
      .eq("profile_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (resumeRow) {
      setProfile({
        full_name: resumeRow.full_name || "Your Name",
        target_role: resumeRow.target_role || "Applicant",
        phone: resumeRow.phone || "Add phone in profile",
        email: resumeRow.email || user.email || "Add email in profile",
        location: resumeRow.location || "Add location in profile",
        profile_summary: resumeRow.profile_summary || "",
        skills: Array.isArray(resumeRow.skills) ? resumeRow.skills : [],
        work_experience: Array.isArray(resumeRow.work_experience) ? resumeRow.work_experience : [],
        education_locked: Array.isArray(resumeRow.education_locked) ? resumeRow.education_locked : [],
        certifications_locked: Array.isArray(resumeRow.certifications_locked) ? resumeRow.certifications_locked : [],
      });
      return;
    }

    const { data: profileRow } = await supabase
      .from("profiles")
      .select("full_name,email,phone,location")
      .eq("id", user.id)
      .maybeSingle();

    setProfile({
      ...fallbackProfile,
      full_name: profileRow?.full_name || "Your Name",
      phone: profileRow?.phone || "Add phone in profile",
      email: profileRow?.email || user.email || "Add email in profile",
      location: profileRow?.location || "Add location in profile",
    });
  }

  async function loadJobs() {
    setResumeDraft(null);
    setFlowState("idle");
    setAiMessage("");
    try {
      const response = await fetch("/api/jobs?role=support%20worker&location=Sydney&country=au", { cache: "no-store" });
      const data = await response.json();
      setJobs(data.jobs || []);
      setSource(data.source || "unknown");
      setMessage(data.message || "Jobs loaded.");
      setIndex(0);
    } catch (error: any) {
      setMessage(error?.message || "Could not load jobs.");
      setJobs([]);
    }
  }

  const job = jobs[index];

  function resetForNext(newIndex: number) {
    setResumeDraft(null);
    setFlowState("idle");
    setAiMessage("");
    setIndex(newIndex);
  }

  function nextJob() {
    if (jobs.length) resetForNext((index + 1) % jobs.length);
  }

  function previousJob() {
    if (jobs.length) resetForNext(index === 0 ? jobs.length - 1 : index - 1);
  }

  async function createResumeDraft() {
    if (!job) return;

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

  function updateResumeField(key: keyof ResumeDraft, value: string) {
    setResumeDraft((current) => {
      if (!current) return current;
      if (key === "skills" || key === "bullets") {
        return {
          ...current,
          [key]: value
            .split("\n")
            .map((item) => item.trim())
            .filter(Boolean),
        };
      }
      return { ...current, [key]: value };
    });
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
          <span>{source === "adzuna" ? "Live Adzuna jobs" : message}</span>
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
          </div>

          <section style={styles.sectionBox}>
            <h2>Job summary</h2>
            <p>{trimText(job.description || "No description provided.", 460)}</p>
          </section>

          <section style={styles.sectionBoxLight}>
            <h2>Signals</h2>
            <div style={styles.tags}>
              {(job.tags || []).slice(0, 5).map((tag) => <span key={tag} style={styles.tag}>{tag}</span>)}
            </div>
          </section>

          <section style={styles.kitBox}>
            <p style={styles.kitLabel}>Application kit</p>
            <h2>Create tailored resume</h2>
            <p>Applix uses your saved profile, this job ad, and OpenAI to create a targeted resume, cover note, and application steps.</p>
            <button onClick={createResumeDraft} disabled={flowState === "generating"} style={styles.primaryButton}>
              {flowState === "generating" ? "Generating..." : "Create AI resume draft"}
            </button>
          </section>

          {aiMessage && <div style={styles.aiMessage}>{aiMessage}</div>}

          {resumeDraft && (
            <section style={styles.resumePanel}>
              <h2 style={styles.greenTitle}>Resume ready for {job.title}</h2>

              {flowState === "editing" && (
                <section style={styles.editorPanel}>
                  <div style={styles.editorHeader}>
                    <div>
                      <p style={styles.kitLabel}>Live resume editor</p>
                      <h2 style={styles.editorTitle}>Edit the draft below</h2>
                    </div>
                    <button onClick={() => setFlowState("draft")} style={styles.smallDarkButton}>Done editing</button>
                  </div>

                  <label style={styles.editorLabel}>
                    Profile summary
                    <textarea
                      style={styles.textarea}
                      value={resumeDraft.summary}
                      onChange={(event) => updateResumeField("summary", event.target.value)}
                    />
                  </label>

                  <label style={styles.editorLabel}>
                    Key skills - one per line
                    <textarea
                      style={styles.textarea}
                      value={resumeDraft.skills.join("\n")}
                      onChange={(event) => updateResumeField("skills", event.target.value)}
                    />
                  </label>

                  <label style={styles.editorLabel}>
                    Experience bullets - one per line
                    <textarea
                      style={styles.textarea}
                      value={resumeDraft.bullets.join("\n")}
                      onChange={(event) => updateResumeField("bullets", event.target.value)}
                    />
                  </label>

                  <label style={styles.editorLabel}>
                    Email / cover note
                    <textarea
                      style={styles.textarea}
                      value={resumeDraft.coverNote}
                      onChange={(event) => updateResumeField("coverNote", event.target.value)}
                    />
                  </label>
                </section>
              )}

              <article style={styles.resumePaper}>
                <header style={styles.paperHeader}>
                  <h1>{profile.full_name}</h1>
                  <strong>{job.title}</strong>
                  <p>{profile.phone} | {profile.email} | {profile.location}</p>
                </header>

                <PaperSection title="Profile">
                  <p>{resumeDraft.summary}</p>
                </PaperSection>

                <PaperSection title="Key skills">
                  <ul>{resumeDraft.skills.map((skill) => <li key={skill}>{skill}</li>)}</ul>
                </PaperSection>

                <PaperSection title="Work experience">
                  {profile.work_experience.length ? (
                    profile.work_experience.slice(0, 2).map((item, itemIndex) => (
                      <div key={itemIndex}>
                        <h3>{item.job_title || job.title}</h3>
                        <strong>{item.company || "Previous employer"}</strong>
                        <ul>{resumeDraft.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>
                      </div>
                    ))
                  ) : (
                    <ul>{resumeDraft.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>
                  )}
                </PaperSection>

                {!!profile.education_locked.length && (
                  <PaperSection title="Education">
                    {profile.education_locked.map((item, itemIndex) => <p key={itemIndex}>{item.qualification || item.institution || "Education item"} {item.institution ? `- ${item.institution}` : ""} {item.year || ""}</p>)}
                  </PaperSection>
                )}

                {!!profile.certifications_locked.length && (
                  <PaperSection title="Certifications">
                    <ul>{profile.certifications_locked.map((item, itemIndex) => <li key={itemIndex}>{item.name || item.provider || "Certification"}</li>)}</ul>
                  </PaperSection>
                )}
              </article>

              <div style={styles.resumeActions}>
                <button onClick={() => setFlowState(flowState === "editing" ? "draft" : "editing")} style={styles.secondaryButton}>
                  {flowState === "editing" ? "Save edits" : "Edit Resume"}
                </button>
                <button onClick={() => window.print()} style={styles.secondaryButton}>Download PDF</button>
                <button onClick={() => setFlowState("approved")} style={styles.approveButton}>Approve Resume</button>
              </div>

              {flowState === "approved" && (
                <div style={styles.approvedBox}>
                  <strong>Resume approved. Next, prepare the email draft.</strong>
                  <button onClick={() => setFlowState("email")} style={styles.smallButton}>Prepare Email</button>
                </div>
              )}

              {(flowState === "email" || flowState === "sent") && (
                <section style={styles.emailDraft}>
                  <h2>Email draft</h2>
                  <p><strong>Subject:</strong> Application for {job.title} - {profile.full_name}</p>
                  <div style={styles.emailBody}>{resumeDraft.coverNote}</div>
                  {job.applyUrl && <p><strong>Apply URL:</strong> <a href={job.applyUrl} target="_blank">Open job application</a></p>}
                  <button onClick={() => setFlowState("sent")} style={styles.approveButton}>{flowState === "sent" ? "Application Sent" : "Send Application"}</button>
                </section>
              )}
            </section>
          )}

          <div style={styles.actions}>
            <button onClick={previousJob} style={styles.secondaryButton}>Previous</button>
            <button onClick={nextJob} style={styles.secondaryButton}>Skip</button>
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

function createFallbackDraft(job: MatchJob, profile: ResumeProfile): ResumeDraft {
  const cleanTags = (job.tags || []).filter((tag) => tag !== "Adzuna" && tag !== "Live job");
  const baseSkills = profile.skills.length ? profile.skills : ["Client communication", "Documentation", "Safe work practices"];

  return {
    summary:
      profile.profile_summary ||
      `Reliable ${job.title} candidate with practical experience, strong communication, and a client-focused approach. Interested in ${job.company} and ready to support the requirements of this role.`,
    skills: Array.from(new Set([...cleanTags, ...baseSkills, "Reliable shift attendance"])).slice(0, 8),
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
  sectionBox: { marginTop: 22, padding: 20, borderRadius: 22, background: "#f8fafc", color: "#334155", lineHeight: 1.7 },
  sectionBoxLight: { marginTop: 14, padding: 20, borderRadius: 22, border: "1px solid #e5e7eb" },
  tags: { display: "flex", flexWrap: "wrap" as const, gap: 8 },
  tag: { borderRadius: 999, background: "#f1f5f9", padding: "8px 12px", fontWeight: 800, color: "#475569" },
  kitBox: { marginTop: 16, padding: 22, borderRadius: 24, background: "#111827", color: "white", lineHeight: 1.6 },
  kitLabel: { margin: 0, textTransform: "uppercase" as const, letterSpacing: 1.5, fontSize: 12, fontWeight: 900, color: "#94a3b8" },
  aiMessage: { marginTop: 14, padding: 14, borderRadius: 18, background: "#eef2ff", color: "#3730a3", fontWeight: 900 },
  resumePanel: { marginTop: 16, padding: 22, borderRadius: 24, border: "1px solid #d1fae5", background: "#f0fdf4" },
  greenTitle: { margin: "0 0 14px", color: "#047857" },
  editorPanel: { marginBottom: 16, padding: 18, borderRadius: 22, background: "#ffffff", border: "1px solid #bbf7d0" },
  editorHeader: { display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start", marginBottom: 14 },
  editorTitle: { margin: "6px 0 0", color: "#111827" },
  editorLabel: { display: "grid", gap: 8, marginTop: 12, color: "#334155", fontWeight: 900 },
  textarea: { minHeight: 110, border: "1px solid #d1d5db", borderRadius: 16, padding: 13, fontFamily: "Arial, Helvetica, sans-serif", fontSize: 14, lineHeight: 1.5, resize: "vertical" as const },
  smallDarkButton: { border: 0, borderRadius: 999, background: "#111827", color: "white", padding: "10px 14px", fontWeight: 900, cursor: "pointer" },
  resumePaper: { background: "white", border: "1px solid #e5e7eb", borderRadius: 14, padding: 22, color: "#111827" },
  paperHeader: { textAlign: "center" as const, borderBottom: "2px solid #111827", paddingBottom: 14, marginBottom: 18 },
  paperSection: { borderBottom: "1px solid #e5e7eb", paddingBottom: 12, marginBottom: 14, lineHeight: 1.6 },
  resumeActions: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14 },
  approveButton: { gridColumn: "1 / -1", display: "block", textAlign: "center" as const, border: 0, borderRadius: 999, background: "#22c55e", color: "white", padding: "15px 18px", fontWeight: 900, cursor: "pointer" },
  approvedBox: { marginTop: 14, padding: 16, borderRadius: 18, background: "#dcfce7", color: "#166534" },
  smallButton: { display: "block", marginTop: 12, border: 0, borderRadius: 999, background: "#166534", color: "white", padding: "10px 14px", fontWeight: 900, cursor: "pointer" },
  emailDraft: { marginTop: 14, padding: 18, borderRadius: 22, background: "#ecfdf5", border: "1px solid #bbf7d0" },
  emailBody: { whiteSpace: "pre-line" as const, background: "white", border: "1px solid #e5e7eb", borderRadius: 16, padding: 16, lineHeight: 1.7 },
  actions: { display: "grid", gridTemplateColumns: "1fr 1fr 1.3fr", gap: 12, marginTop: 20 },
  primaryButton: { display: "block", textAlign: "center" as const, border: 0, borderRadius: 999, background: "#111827", color: "white", padding: "15px 18px", fontWeight: 900, textDecoration: "none", cursor: "pointer" },
  secondaryButton: { display: "block", textAlign: "center" as const, border: "1px solid #e5e7eb", borderRadius: 999, background: "white", color: "#111827", padding: "15px 18px", fontWeight: 900, textDecoration: "none", cursor: "pointer" },
  emptyCard: { background: "white", borderRadius: 26, padding: 26, border: "1px solid #e5e7eb" },
};
