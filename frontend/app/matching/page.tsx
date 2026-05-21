"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type FlowState = "empty" | "resume" | "edit" | "approved" | "email" | "sent";

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

const mockUser = {
  fullName: "Demo Applicant",
  phone: "0400 000 000",
  email: "applicant@example.com",
  location: "Sydney NSW",
  education: "Certificate III in Individual Support - TAFE NSW, 2023",
  certificates: ["First Aid", "CPR", "NDIS Worker Screening Check"],
};

export default function MatchingPage() {
  const [jobs, setJobs] = useState<MatchJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchMessage, setFetchMessage] = useState("");
  const [source, setSource] = useState("");
  const [index, setIndex] = useState(0);
  const [flowState, setFlowState] = useState<FlowState>("empty");
  const [summary, setSummary] = useState("");
  const [skillsText, setSkillsText] = useState("");
  const [experienceText, setExperienceText] = useState("");

  useEffect(() => {
    loadJobs();
  }, []);

  async function loadJobs() {
    setLoading(true);
    setFetchMessage("");

    try {
      const response = await fetch("/api/jobs?role=support%20worker&location=Sydney&country=au", {
        cache: "no-store",
      });
      const data = await response.json();
      setJobs(data.jobs || []);
      setSource(data.source || "unknown");
      setFetchMessage(data.message || (data.ok ? "Jobs loaded." : data.error || "Could not load jobs."));
      setIndex(0);
      resetResume();
    } catch (error: any) {
      setFetchMessage(error?.message || "Could not load jobs.");
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }

  const job = jobs[index];
  const skills = useMemo(() => skillsText.split("\n").map((item) => item.trim()).filter(Boolean), [skillsText]);
  const bullets = useMemo(() => experienceText.split("\n").map((item) => item.trim()).filter(Boolean), [experienceText]);

  function resetResume() {
    setFlowState("empty");
    setSummary("");
    setSkillsText("");
    setExperienceText("");
  }

  function createResume() {
    if (!job) return;
    setSummary(`Reliable ${job.title} with practical experience supporting clients with daily routines, communication, documentation, and safe person-centred support. Strong interest in ${job.company} and the requirements of this role.`);
    setSkillsText(Array.from(new Set([...job.tags, "Client documentation", "Communication", "Safe routines"])).join("\n"));
    setExperienceText([
      `Supported clients with daily living, appointments, transport, and community access relevant to ${job.title} duties.`,
      "Followed care plans and maintained clear communication with clients, families, and care teams.",
      "Completed support notes and helped clients work toward independence, safety, and personal goals.",
    ].join("\n"));
    setFlowState("resume");
  }

  function nextJob() {
    resetResume();
    if (jobs.length) setIndex((index + 1) % jobs.length);
  }

  if (loading) return <main style={styles.main}>Fetching jobs...</main>;

  if (!job) {
    return (
      <main style={styles.main}>
        <section style={styles.shell}>
          <article style={styles.card}>
            <h1>No jobs loaded.</h1>
            <p style={styles.description}>{fetchMessage || "The job API returned no jobs."}</p>
            <button onClick={loadJobs} style={styles.createButton}>Retry job fetch</button>
          </article>
        </section>
      </main>
    );
  }

  return (
    <main style={styles.main}>
      <section style={styles.shell}>
        <header style={styles.header}>
          <Link href="/" style={styles.backLink}>← Home</Link>
          <strong>Applix Matching</strong>
          <span style={styles.count}>{index + 1}/{jobs.length}</span>
        </header>

        <div style={source === "adzuna" ? styles.liveBox : styles.warningBox}>
          {source === "adzuna" ? "Live Adzuna jobs loaded." : fetchMessage}
          <button onClick={loadJobs} style={styles.refreshButton}>Refresh</button>
        </div>

        <article style={styles.card}>
          <div style={styles.heroCard}>
            <div style={styles.logo}>{job.logo}</div>
            <span style={styles.match}>{job.match}% match</span>
            <h1 style={styles.title}>{job.title}</h1>
            <p style={styles.company}>{job.company}</p>
          </div>

          <div style={styles.chips}>
            {[job.location, job.salary, job.type].filter(Boolean).map((item) => <span key={item} style={styles.chip}>{item}</span>)}
          </div>

          <section style={styles.infoBox}>
            <h2 style={styles.infoTitle}>Why it matches</h2>
            <p style={styles.description}>{job.description}</p>
            <div style={styles.tags}>{job.tags.map((tag) => <span key={tag} style={styles.tag}>{tag}</span>)}</div>
          </section>

          <section style={styles.kitBox}>
            <h2 style={styles.infoTitle}>Tailored resume</h2>
            <p style={styles.description}>Create a resume under this card from the current job data.</p>
            <button onClick={createResume} style={styles.createButton}>Create Resume</button>
          </section>

          {flowState !== "empty" && (
            <section style={styles.resumeArea}>
              <h2 style={styles.readyTitle}>Resume ready for {job.title}</h2>
              {flowState === "edit" ? (
                <div style={styles.editBox}>
                  <label style={styles.editLabel}>Profile summary<textarea style={styles.textarea} value={summary} onChange={(event) => setSummary(event.target.value)} /></label>
                  <label style={styles.editLabel}>Skills - one per line<textarea style={styles.textarea} value={skillsText} onChange={(event) => setSkillsText(event.target.value)} /></label>
                  <label style={styles.editLabel}>Experience bullets - one per line<textarea style={styles.textarea} value={experienceText} onChange={(event) => setExperienceText(event.target.value)} /></label>
                  <button onClick={() => setFlowState("resume")} style={styles.createButton}>Save Resume Edits</button>
                </div>
              ) : (
                <article style={styles.resumePaper}>
                  <header style={styles.paperHeader}>
                    <h1 style={styles.paperName}>{mockUser.fullName}</h1>
                    <p style={styles.paperRole}>{job.title}</p>
                    <p style={styles.paperContact}>{mockUser.phone} | {mockUser.email} | {mockUser.location}</p>
                  </header>
                  <Section title="Profile"><p style={styles.paperText}>{summary}</p></Section>
                  <Section title="Key Skills"><ul style={styles.paperList}>{skills.map((skill) => <li key={skill}>{skill}</li>)}</ul></Section>
                  <Section title="Work Experience"><h3 style={styles.paperJobTitle}>Support Worker</h3><p style={styles.paperMeta}>Community and Care Pty Ltd | 2023 - Present</p><ul style={styles.paperList}>{bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul></Section>
                  <Section title="Education"><p style={styles.paperText}>{mockUser.education}</p></Section>
                  <Section title="Certifications"><ul style={styles.paperList}>{mockUser.certificates.map((item) => <li key={item}>{item}</li>)}</ul></Section>
                </article>
              )}

              <div style={styles.resumeActions}>
                <button onClick={() => setFlowState("edit")} style={styles.secondaryAction}>Edit Resume</button>
                <button onClick={() => window.print()} style={styles.secondaryAction}>Download PDF</button>
                <button onClick={() => setFlowState("approved")} style={styles.approveButton}>Approve Resume</button>
              </div>

              {flowState === "approved" && <div style={styles.approvedBox}>Resume approved. Next, prepare the email draft.<button onClick={() => setFlowState("email")} style={styles.inlineButton}>Prepare Email</button></div>}

              {(flowState === "email" || flowState === "sent") && (
                <section style={styles.emailDraft}>
                  <h2 style={styles.infoTitle}>Email draft</h2>
                  <p><strong>Subject:</strong> Application for {job.title} - {mockUser.fullName}</p>
                  <div style={styles.emailBody}>Dear Hiring Manager,<br /><br />Please find attached my resume for the {job.title} position at {job.company}.<br /><br />Kind regards,<br />{mockUser.fullName}</div>
                  {job.applyUrl && <p><strong>Apply URL:</strong> <a href={job.applyUrl} target="_blank">Open job application</a></p>}
                  <button onClick={() => setFlowState("sent")} style={styles.sendButton}>{flowState === "sent" ? "Application Sent" : "Send Application"}</button>
                </section>
              )}
            </section>
          )}
        </article>

        <footer style={styles.footer}>
          <button onClick={nextJob} style={styles.skipButton}>Skip</button>
          <button onClick={flowState === "empty" ? createResume : nextJob} style={styles.interestedButton}>{flowState === "empty" ? "Create Resume" : "Next Job"}</button>
        </footer>
      </section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section style={styles.paperSection}><h2 style={styles.paperSectionTitle}>{title}</h2>{children}</section>;
}

const styles = {
  main: { minHeight: "100vh", background: "linear-gradient(135deg, #fff7ed 0%, #f5f3ff 45%, #e0f2fe 100%)", fontFamily: "Arial, Helvetica, sans-serif", padding: 20 },
  shell: { maxWidth: 560, margin: "0 auto", minHeight: "calc(100vh - 40px)", display: "flex", flexDirection: "column" as const },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 4px 18px" },
  backLink: { color: "#111827", textDecoration: "none", fontWeight: 800 },
  count: { color: "#6b7280", fontWeight: 700 },
  warningBox: { display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a", borderRadius: 18, padding: 12, fontWeight: 800, marginBottom: 12, lineHeight: 1.5 },
  liveBox: { display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", background: "#dcfce7", color: "#166534", border: "1px solid #bbf7d0", borderRadius: 18, padding: 12, fontWeight: 800, marginBottom: 12, lineHeight: 1.5 },
  refreshButton: { border: 0, borderRadius: 999, background: "white", padding: "8px 12px", fontWeight: 900, cursor: "pointer" },
  card: { flex: 1, background: "white", borderRadius: 34, padding: 16, boxShadow: "0 24px 70px rgba(15,23,42,0.18)" },
  heroCard: { minHeight: 280, borderRadius: 28, padding: 24, color: "white", background: "linear-gradient(135deg, #7c3aed 0%, #ec4899 60%, #fb923c 100%)", display: "flex", flexDirection: "column" as const, justifyContent: "flex-end" },
  logo: { width: 72, height: 72, borderRadius: 24, background: "rgba(255,255,255,0.22)", display: "grid", placeItems: "center", fontSize: 34, marginBottom: "auto" },
  match: { alignSelf: "flex-start", padding: "7px 11px", borderRadius: 999, background: "rgba(255,255,255,0.24)", fontWeight: 900, fontSize: 13 },
  title: { margin: "14px 0 6px", fontSize: 34, lineHeight: 1 },
  company: { margin: 0, fontSize: 18, opacity: 0.88 },
  chips: { display: "flex", flexWrap: "wrap" as const, gap: 8, marginTop: 16 },
  chip: { borderRadius: 999, background: "#f3f4f6", padding: "9px 13px", fontWeight: 700 },
  infoBox: { marginTop: 16, borderRadius: 24, background: "#f8fafc", padding: 18 },
  infoTitle: { margin: 0, fontSize: 18 },
  description: { color: "#64748b", lineHeight: 1.6, margin: "8px 0 0" },
  tags: { display: "flex", flexWrap: "wrap" as const, gap: 8, marginTop: 14 },
  tag: { borderRadius: 999, background: "white", padding: "7px 10px", fontSize: 13, fontWeight: 800, color: "#475569" },
  kitBox: { marginTop: 14, border: "1px solid #e5e7eb", borderRadius: 24, padding: 18 },
  createButton: { width: "100%", marginTop: 14, border: 0, borderRadius: 999, padding: 14, background: "#111827", color: "white", fontWeight: 900, fontSize: 15, cursor: "pointer" },
  resumeArea: { marginTop: 16, borderRadius: 24, background: "#f8fafc", padding: 16, border: "1px solid #e5e7eb" },
  readyTitle: { margin: 0, color: "#166534", fontSize: 20 },
  editBox: { marginTop: 14, display: "grid", gap: 12 },
  editLabel: { display: "grid", gap: 8, fontWeight: 900, color: "#334155" },
  textarea: { minHeight: 100, border: "1px solid #d1d5db", borderRadius: 16, padding: 12, fontSize: 14, fontFamily: "Arial, Helvetica, sans-serif" },
  resumePaper: { marginTop: 14, background: "white", border: "1px solid #e5e7eb", borderRadius: 10, padding: 22, boxShadow: "0 16px 40px rgba(15,23,42,0.08)" },
  paperHeader: { textAlign: "center" as const, borderBottom: "2px solid #111827", paddingBottom: 14, marginBottom: 18 },
  paperName: { margin: 0, fontSize: 28, letterSpacing: -1 },
  paperRole: { margin: "7px 0 0", fontWeight: 900, color: "#334155" },
  paperContact: { margin: "8px 0 0", color: "#64748b", fontSize: 12 },
  paperSection: { marginBottom: 16 },
  paperSectionTitle: { margin: "0 0 8px", fontSize: 13, letterSpacing: 1, textTransform: "uppercase" as const, borderBottom: "1px solid #e5e7eb", paddingBottom: 6 },
  paperText: { color: "#334155", lineHeight: 1.55, margin: 0 },
  paperJobTitle: { margin: 0, fontSize: 16 },
  paperMeta: { margin: "4px 0 8px", color: "#64748b", fontWeight: 800 },
  paperList: { color: "#334155", lineHeight: 1.6, paddingLeft: 18 },
  resumeActions: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 },
  secondaryAction: { border: "1px solid #d1d5db", background: "white", color: "#111827", borderRadius: 999, padding: 13, fontWeight: 900, cursor: "pointer", textDecoration: "none" },
  approveButton: { gridColumn: "1 / -1", border: 0, background: "#22c55e", color: "white", borderRadius: 999, padding: 13, fontWeight: 900, cursor: "pointer" },
  approvedBox: { marginTop: 14, borderRadius: 18, background: "#dcfce7", color: "#166534", padding: 14, fontWeight: 900, lineHeight: 1.5 },
  inlineButton: { marginTop: 10, display: "block", border: 0, borderRadius: 999, padding: "10px 14px", background: "#166534", color: "white", fontWeight: 900, cursor: "pointer" },
  emailDraft: { marginTop: 14, border: "1px solid #bbf7d0", background: "#f0fdf4", borderRadius: 22, padding: 16, color: "#334155" },
  emailBody: { background: "white", border: "1px solid #e5e7eb", borderRadius: 16, padding: 14, lineHeight: 1.6 },
  sendButton: { width: "100%", border: 0, borderRadius: 999, padding: 14, background: "#22c55e", color: "white", fontWeight: 900, cursor: "pointer" },
  footer: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, paddingTop: 14 },
  skipButton: { border: 0, borderRadius: 999, background: "white", color: "#ef4444", padding: 18, fontWeight: 900, fontSize: 16, cursor: "pointer" },
  interestedButton: { border: 0, borderRadius: 999, background: "#22c55e", color: "white", padding: 18, fontWeight: 900, fontSize: 16, cursor: "pointer" },
};
