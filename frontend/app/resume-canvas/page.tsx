"use client";

import Link from "next/link";
import { ChangeEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const CACHE_KEY = "applixChatLaunchCache";

type ResumeState = {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  resumeSummary: string;
  skills: string;
  experience: string;
  certificates: string;
};

type CampaignState = {
  targetRole?: string;
  companyType?: string;
  targetArea?: string;
  radiusKm?: number;
  plan?: "gentle" | "full";
  aiConsent?: boolean;
  emailConsent?: boolean;
  fullName?: string;
  email?: string;
  phone?: string;
  resumeSummary?: string;
  skills?: string;
  experience?: string;
  certificates?: string;
};

const emptyResume: ResumeState = {
  fullName: "",
  email: "",
  phone: "",
  location: "",
  resumeSummary: "",
  skills: "",
  experience: "",
  certificates: "",
};

function readCampaign(): CampaignState {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveCampaign(updates: Partial<CampaignState>) {
  if (typeof window === "undefined") return;
  const current = readCampaign();
  window.localStorage.setItem(CACHE_KEY, JSON.stringify({ ...current, ...updates }));
}

export default function ResumeCanvasPage() {
  const router = useRouter();
  const [resume, setResume] = useState<ResumeState>(emptyResume);
  const [campaign, setCampaign] = useState<CampaignState>({});
  const [status, setStatus] = useState("Upload a resume or edit the canvas directly.");
  const [parsing, setParsing] = useState(false);

  const dailyLimit = campaign.plan === "full" ? 100 : 10;

  useEffect(() => {
    const saved = readCampaign();
    setCampaign(saved);
    setResume({
      fullName: saved.fullName || "",
      email: saved.email || "",
      phone: saved.phone || "",
      location: saved.targetArea || "",
      resumeSummary: saved.resumeSummary || "",
      skills: saved.skills || "",
      experience: saved.experience || "",
      certificates: saved.certificates || "",
    });
  }, []);

  useEffect(() => {
    saveCampaign({
      fullName: resume.fullName,
      email: resume.email,
      phone: resume.phone,
      resumeSummary: resume.resumeSummary,
      skills: resume.skills,
      experience: resume.experience,
      certificates: resume.certificates,
    });
  }, [resume]);

  function update(field: keyof ResumeState, value: string) {
    setResume((current) => ({ ...current, [field]: value }));
    setStatus("Saved in this browser.");
  }

  async function uploadResume(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || parsing) return;

    setParsing(true);
    setStatus(`Parsing ${file.name}...`);

    try {
      const formData = new FormData();
      formData.append("resume", file);

      const response = await fetch("/api/applix/parse-resume", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || "Could not parse resume.");
      }

      const parsed = data.parsed || {};
      const nextResume = {
        fullName: parsed.fullName || resume.fullName,
        email: parsed.email || resume.email,
        phone: parsed.phone || resume.phone,
        location: parsed.location || resume.location || campaign.targetArea || "",
        resumeSummary: parsed.resumeSummary || resume.resumeSummary,
        skills: parsed.skills || resume.skills,
        experience: parsed.experience || resume.experience,
        certificates: parsed.certificates || resume.certificates,
      };
      setResume(nextResume);

      const filled = data.filledCount ?? Object.values(nextResume).filter(Boolean).length;
      const aiText = data.usedOpenAI ? "OpenAI parsed it" : "Fallback parser filled what it could";
      setStatus(`${aiText}. Filled ${filled} fields from ${data.filename || file.name}. Review and edit the canvas.`);
    } catch (error: any) {
      setStatus(error?.message || "Resume parsing failed. Try DOCX, TXT, or a text-based PDF.");
    } finally {
      setParsing(false);
      event.target.value = "";
    }
  }

  function launch() {
    const draft = {
      targetRole: campaign.targetRole || "",
      industry: campaign.companyType || "",
      selectedAddress: campaign.targetArea || resume.location || "",
      placeId: "chat-area",
      latitude: null,
      longitude: null,
      radiusKm: campaign.radiusKm || 20,
      resumeName: resume.fullName || "Applix resume",
      resumeSource: "resume_canvas_document",
      resumeSnapshot: {
        fullName: resume.fullName,
        email: resume.email,
        phone: resume.phone,
        location: resume.location || campaign.targetArea || "",
        summary: resume.resumeSummary,
        skills: resume.skills,
        experience: resume.experience,
        certificates: resume.certificates,
      },
      dailyLimit,
      campaignDays: 10,
      emailConsent: Boolean(campaign.emailConsent),
      createdAt: new Date().toISOString(),
    };

    sessionStorage.setItem("applixCampaignDraft", JSON.stringify(draft));
    saveCampaign({
      fullName: resume.fullName,
      email: resume.email,
      phone: resume.phone,
      resumeSummary: resume.resumeSummary,
      skills: resume.skills,
      experience: resume.experience,
      certificates: resume.certificates,
    });
    router.push("/login?next=/dashboard");
  }

  return (
    <main style={styles.main}>
      <header style={styles.topbar}>
        <Link href="/" style={styles.backLink}>← Back to Applix chat</Link>
        <div style={styles.status}>{status}</div>
        <button style={styles.launchTop} onClick={launch}>Save master & continue</button>
      </header>

      <section style={styles.shell}>
        <aside style={styles.sidePanel}>
          <p style={styles.eyebrow}>Campaign</p>
          <h1 style={styles.sideTitle}>Resume Canvas</h1>
          <p style={styles.sideCopy}>Upload your existing resume to autofill this white document, then edit anything. This becomes your master source of truth.</p>

          <label style={styles.uploadBox}>
            <input
              type="file"
              accept=".pdf,.doc,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
              onChange={uploadResume}
              style={styles.fileInput}
              disabled={parsing}
            />
            <strong>{parsing ? "Parsing resume..." : "Upload PDF / DOCX / TXT"}</strong>
            <span>Applix will fill the canvas automatically.</span>
          </label>

          <div style={styles.memoryBox}>
            <strong>Target role</strong><span>{campaign.targetRole || "Not set"}</span>
            <strong>Company type</strong><span>{campaign.companyType || "Not set"}</span>
            <strong>Area</strong><span>{campaign.targetArea ? `${campaign.targetArea} (${campaign.radiusKm || 20}km)` : "Not set"}</span>
            <strong>Pace</strong><span>{dailyLimit}/day for 10 days</span>
          </div>
          <p style={styles.note}>Certificates can be uploaded later. For now, type certificate names or let Applix extract them from the resume.</p>
        </aside>

        <section style={styles.paperWrap}>
          <article style={styles.paper}>
            <input
              style={styles.nameInput}
              value={resume.fullName}
              onChange={(event) => update("fullName", event.target.value)}
              placeholder="Your Full Name"
            />
            <div style={styles.contactRow}>
              <input style={styles.inlineInput} value={resume.email} onChange={(event) => update("email", event.target.value)} placeholder="email@example.com" />
              <span>•</span>
              <input style={styles.inlineInput} value={resume.phone} onChange={(event) => update("phone", event.target.value)} placeholder="Phone" />
              <span>•</span>
              <input style={styles.inlineInput} value={resume.location} onChange={(event) => update("location", event.target.value)} placeholder="Location" />
            </div>

            <SectionTitle title="Profile" />
            <textarea
              style={styles.paragraphInput}
              value={resume.resumeSummary}
              onChange={(event) => update("resumeSummary", event.target.value)}
              placeholder="Write a short professional summary. Example: Motivated support worker with experience in person-centred care..."
            />

            <SectionTitle title="Skills" />
            <textarea
              style={styles.paragraphInput}
              value={resume.skills}
              onChange={(event) => update("skills", event.target.value)}
              placeholder="Type skills separated by commas or lines. Example: Communication, documentation, client support, teamwork..."
            />

            <SectionTitle title="Experience" />
            <textarea
              style={styles.experienceInput}
              value={resume.experience}
              onChange={(event) => update("experience", event.target.value)}
              placeholder={"Add your experience like a resume. Example:\nCompany Name — Role\nDates\n- Responsibility or achievement\n- Responsibility or achievement"}
            />

            <SectionTitle title="Certificates / Checks" />
            <textarea
              style={styles.paragraphInput}
              value={resume.certificates}
              onChange={(event) => update("certificates", event.target.value)}
              placeholder="Type certificate/check names. Example: First Aid, CPR, Police Check, WWCC, NDIS Worker Screening, or None."
            />
          </article>
        </section>
      </section>
    </main>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <h2 style={styles.sectionTitle}>{title}</h2>;
}

const styles = {
  main: { minHeight: "100vh", background: "#e7e9ef", color: "#111827", fontFamily: "Arial, Helvetica, sans-serif", padding: 18 },
  topbar: { maxWidth: 1220, margin: "0 auto 18px", display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 18, background: "#ffffff", border: "1px solid #d8dee9", boxShadow: "0 10px 30px rgba(15,23,42,.08)" },
  backLink: { color: "#111827", textDecoration: "none", fontWeight: 900 },
  status: { marginLeft: "auto", color: "#64748b", fontSize: 13, fontWeight: 800, maxWidth: 520, textAlign: "right" as const },
  launchTop: { border: 0, borderRadius: 999, padding: "12px 18px", background: "#111827", color: "white", fontWeight: 900, cursor: "pointer" },
  shell: { maxWidth: 1220, margin: "0 auto", display: "grid", gridTemplateColumns: "320px minmax(0, 1fr)", gap: 22, alignItems: "start" },
  sidePanel: { position: "sticky" as const, top: 18, background: "#111827", color: "white", borderRadius: 24, padding: 22, boxShadow: "0 20px 50px rgba(15,23,42,.18)" },
  eyebrow: { margin: 0, color: "#5ee7ff", fontSize: 11, letterSpacing: 2, fontWeight: 900, textTransform: "uppercase" as const },
  sideTitle: { margin: "12px 0", fontSize: 34, lineHeight: 1, letterSpacing: -1.2 },
  sideCopy: { color: "#cbd5e1", lineHeight: 1.5, fontWeight: 700 },
  uploadBox: { display: "grid", gap: 7, marginTop: 18, padding: 16, borderRadius: 18, background: "rgba(94,231,255,.1)", border: "1px dashed rgba(94,231,255,.55)", cursor: "pointer" },
  fileInput: { display: "none" },
  memoryBox: { display: "grid", gridTemplateColumns: "110px 1fr", gap: 9, marginTop: 18, padding: 14, borderRadius: 16, background: "rgba(255,255,255,.07)", color: "#dbeafe", fontSize: 13, lineHeight: 1.4 },
  note: { marginTop: 18, color: "#ffd08a", lineHeight: 1.5, fontWeight: 800, fontSize: 13 },
  paperWrap: { display: "flex", justifyContent: "center" },
  paper: { width: "min(100%, 820px)", minHeight: "calc(100vh - 120px)", background: "#ffffff", padding: "54px 64px", boxShadow: "0 25px 70px rgba(15,23,42,.16)", border: "1px solid #dde3ee" },
  nameInput: { width: "100%", border: 0, borderBottom: "2px solid #111827", padding: "0 0 10px", fontSize: 38, fontWeight: 900, letterSpacing: -1.3, outline: "none", textAlign: "center" as const, color: "#111827" },
  contactRow: { display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 12, color: "#64748b", flexWrap: "wrap" as const },
  inlineInput: { border: 0, minWidth: 130, textAlign: "center" as const, color: "#334155", fontWeight: 700, outline: "none", fontSize: 14 },
  sectionTitle: { margin: "30px 0 10px", paddingBottom: 7, borderBottom: "1.5px solid #111827", color: "#111827", textTransform: "uppercase" as const, letterSpacing: 1.4, fontSize: 15 },
  paragraphInput: { width: "100%", minHeight: 86, border: "1px solid transparent", borderRadius: 8, padding: 10, resize: "vertical" as const, outline: "none", fontFamily: "Arial, Helvetica, sans-serif", fontSize: 15, lineHeight: 1.55, color: "#111827", background: "#fbfdff" },
  experienceInput: { width: "100%", minHeight: 190, border: "1px solid transparent", borderRadius: 8, padding: 10, resize: "vertical" as const, outline: "none", fontFamily: "Arial, Helvetica, sans-serif", fontSize: 15, lineHeight: 1.55, color: "#111827", background: "#fbfdff" },
};
