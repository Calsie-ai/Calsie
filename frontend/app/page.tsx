"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import MapRadiusSelector, { type MapSelection } from "../components/MapRadiusSelector";

const APPLIX_DRAFT_CACHE_KEY = "applixLaunchFormCache";

type ResumeSnapshot = {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  summary: string;
  skills: string;
  experience: string;
  certificates: string;
};

type CampaignDraft = {
  targetRole: string;
  industry: string;
  selectedAddress: string;
  placeId: string;
  latitude: number | null;
  longitude: number | null;
  radiusKm: number;
  resumeName: string;
  resumeSource: "inline_form" | "applix_profile" | "not_ready";
  resumeSnapshot: ResumeSnapshot;
  dailyLimit: number;
  campaignDays: number;
  emailConsent: boolean;
  createdAt: string;
};

type LaunchFormCache = {
  step: number;
  targetRole: string;
  industry: string;
  plan: "gentle" | "full";
  aiConsent: boolean;
  emailConsent: boolean;
  resume: ResumeSnapshot;
  mapSelection: MapSelection;
  savedAt: string;
};

const emptyResume: ResumeSnapshot = {
  fullName: "",
  email: "",
  phone: "",
  location: "",
  summary: "",
  skills: "",
  experience: "",
  certificates: "",
};

const defaultMapSelection: MapSelection = {
  selectedAddress: "",
  placeId: "",
  latitude: null,
  longitude: null,
  radiusKm: 20,
};

const steps = [
  {
    key: "start",
    label: "Start",
    title: "Start Applix",
    sideTitle: "What happens here?",
    sideCopy:
      "Applix starts by learning what kind of work you want and where it should look. You do not need an account yet. You can test the flow first.",
  },
  {
    key: "role",
    label: "Target role",
    title: "Select target role",
    sideTitle: "Choose the work",
    sideCopy:
      "Tell Applix the role you want and the type of companies you want it to approach. Keep it simple and natural, like Support Worker near NDIS providers.",
  },
  {
    key: "resume",
    label: "Resume",
    title: "Fill resume details",
    sideTitle: "Your resume memory",
    sideCopy:
      "This becomes the truth Applix uses. It can improve the wording later, but your facts stay locked: name, contact details, experience, skills, and checks.",
  },
  {
    key: "level",
    label: "Level",
    title: "Select Applix level",
    sideTitle: "Choose your pace",
    sideCopy:
      "Start small or go bigger. Applix can prepare a light run of 10 approaches per day, or a stronger run of 100 per day for 10 days.",
  },
  {
    key: "consent",
    label: "Consent",
    title: "AI and email consent",
    sideTitle: "You stay in control",
    sideCopy:
      "Applix asks permission before using AI to write messages or tailor resume wording. Email access is only for sending approved messages on your behalf.",
  },
  {
    key: "launch",
    label: "Launch",
    title: "Launch Applix",
    sideTitle: "Final step",
    sideCopy:
      "Create your Applix account to save this setup, then land in the dashboard where you can review companies, approve messages, and control sending.",
  },
];

function readLaunchCache(): LaunchFormCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(APPLIX_DRAFT_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LaunchFormCache>;
    return {
      step: typeof parsed.step === "number" ? Math.min(Math.max(parsed.step, 0), steps.length - 1) : 0,
      targetRole: parsed.targetRole || "",
      industry: parsed.industry || "",
      plan: parsed.plan === "full" ? "full" : "gentle",
      aiConsent: Boolean(parsed.aiConsent),
      emailConsent: Boolean(parsed.emailConsent),
      resume: { ...emptyResume, ...(parsed.resume || {}) },
      mapSelection: { ...defaultMapSelection, ...(parsed.mapSelection || {}) },
      savedAt: parsed.savedAt || "",
    };
  } catch {
    return null;
  }
}

export default function HomePage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [targetRole, setTargetRole] = useState("");
  const [industry, setIndustry] = useState("");
  const [plan, setPlan] = useState<"gentle" | "full">("gentle");
  const [aiConsent, setAiConsent] = useState(false);
  const [emailConsent, setEmailConsent] = useState(false);
  const [resume, setResume] = useState<ResumeSnapshot>(emptyResume);
  const [mapSelection, setMapSelection] = useState<MapSelection>(defaultMapSelection);
  const [error, setError] = useState("");
  const [cacheStatus, setCacheStatus] = useState("Draft autosaves in this browser.");
  const [cacheLoaded, setCacheLoaded] = useState(false);

  const activeStep = steps[step];
  const dailyLimit = plan === "gentle" ? 10 : 100;
  const campaignDays = 10;

  useEffect(() => {
    const cache = readLaunchCache();
    if (cache) {
      setStep(cache.step);
      setTargetRole(cache.targetRole);
      setIndustry(cache.industry);
      setPlan(cache.plan);
      setAiConsent(cache.aiConsent);
      setEmailConsent(cache.emailConsent);
      setResume(cache.resume);
      setMapSelection(cache.mapSelection);
      setCacheStatus("Restored your saved Applix draft from this browser.");
    }
    setCacheLoaded(true);
  }, []);

  useEffect(() => {
    if (!cacheLoaded || typeof window === "undefined") return;

    const cache: LaunchFormCache = {
      step,
      targetRole,
      industry,
      plan,
      aiConsent,
      emailConsent,
      resume,
      mapSelection,
      savedAt: new Date().toISOString(),
    };

    window.localStorage.setItem(APPLIX_DRAFT_CACHE_KEY, JSON.stringify(cache));
    setCacheStatus("Saved in this browser.");
  }, [cacheLoaded, step, targetRole, industry, plan, aiConsent, emailConsent, resume, mapSelection]);

  function clearSavedDraft() {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(APPLIX_DRAFT_CACHE_KEY);
      window.sessionStorage.removeItem("applixCampaignDraft");
    }
    setStep(0);
    setTargetRole("");
    setIndustry("");
    setPlan("gentle");
    setAiConsent(false);
    setEmailConsent(false);
    setResume(emptyResume);
    setMapSelection(defaultMapSelection);
    setError("");
    setCacheStatus("Saved draft cleared.");
  }

  function updateResume(field: keyof ResumeSnapshot, value: string) {
    setResume((current) => ({ ...current, [field]: value }));
  }

  function validateCurrentStep() {
    setError("");

    if (step === 1) {
      if (!targetRole.trim()) return "Tell Applix what work you want.";
      if (!industry.trim()) return "Tell Applix what kind of companies to look for.";
      if (!mapSelection.selectedAddress.trim()) return "Add the target area where Applix should look.";
    }

    if (step === 2) {
      if (!resume.fullName.trim() || !resume.email.trim() || !resume.phone.trim()) return "Add your name, email, and phone.";
      if (!resume.summary.trim() || !resume.skills.trim()) return "Add your summary and skills.";
    }

    if (step === 4) {
      if (!aiConsent) return "Allow Applix to prepare AI-written messages and resume wording first.";
      if (!emailConsent) return "Allow Applix to ask for email access later. Nothing sends without approval.";
    }

    return "";
  }

  function nextStep() {
    const issue = validateCurrentStep();
    if (issue) {
      setError(issue);
      return;
    }
    setStep((current) => Math.min(current + 1, steps.length - 1));
  }

  function previousStep() {
    setError("");
    setStep((current) => Math.max(current - 1, 0));
  }

  function createDraft() {
    const issue = validateCurrentStep();
    if (issue) {
      setError(issue);
      return;
    }

    const draft: CampaignDraft = {
      targetRole: targetRole.trim(),
      industry: industry.trim(),
      selectedAddress: mapSelection.selectedAddress,
      placeId: mapSelection.placeId,
      latitude: mapSelection.latitude,
      longitude: mapSelection.longitude,
      radiusKm: mapSelection.radiusKm,
      resumeName: resume.fullName.trim() || "Inline Applix resume",
      resumeSource: "inline_form",
      resumeSnapshot: resume,
      dailyLimit,
      campaignDays,
      emailConsent,
      createdAt: new Date().toISOString(),
    };

    sessionStorage.setItem("applixCampaignDraft", JSON.stringify(draft));
    localStorage.setItem(APPLIX_DRAFT_CACHE_KEY, JSON.stringify({
      step,
      targetRole,
      industry,
      plan,
      aiConsent,
      emailConsent,
      resume,
      mapSelection,
      savedAt: new Date().toISOString(),
    }));
    router.push("/login?next=/dashboard");
  }

  return (
    <main style={styles.main}>
      <header style={styles.header}>
        <Link href="/" style={styles.logoMark}>A</Link>
        <div style={styles.headerText}>ARTIFICIAL SYMBIOTIC SUPER INTELLIGENCE</div>
        <nav style={styles.navLinks}>
          <Link href="/" style={styles.navLink}>Symbiotes</Link>
          <Link href="/profile" style={styles.navLink}>Resume Memory</Link>
          <Link href="/login" style={styles.navLink}>Applix Account</Link>
        </nav>
      </header>

      <section style={styles.hero}>
        <aside style={styles.sidePanel}>
          <p style={styles.eyebrow}>ASSI ECOSYSTEM / APPLIX SYMBIOTE</p>
          <h1 style={styles.sideTitle}>Tell Applix what work you want.</h1>
          <p style={styles.leadLine}>It finds the companies, writes the approach, and helps you reach them every day.</p>
          <p style={styles.symbioteLine}>Applix is the job-hunt symbiote from ASSI — a small worker beside you that searches, writes, remembers, and prepares your next move while you stay in control.</p>

          <div style={styles.explainBox}>
            <span style={styles.stepBadge}>STEP {step + 1} / {steps.length}</span>
            <h2 style={styles.explainTitle}>{activeStep.sideTitle}</h2>
            <p style={styles.explainText}>{activeStep.sideCopy}</p>
          </div>

          <div style={styles.statsGrid}>
            <div style={styles.statCard}><strong style={styles.statNumber}>{dailyLimit}</strong><span style={styles.statText}>a day</span></div>
            <div style={styles.statCard}><strong style={styles.statNumber}>10</strong><span style={styles.statText}>days</span></div>
            <div style={styles.statCard}><strong style={styles.statNumber}>✓</strong><span style={styles.statText}>approval</span></div>
          </div>
        </aside>

        <section id="launch" style={styles.launchCard}>
          <div style={styles.windowDots}>
            <span style={{ ...styles.dot, background: "#ff8a3d" }} />
            <span style={{ ...styles.dot, background: "#5ee7ff" }} />
            <span style={{ ...styles.dot, background: "#8b5cf6" }} />
          </div>

          <div style={styles.cacheBar}>
            <span>{cacheStatus}</span>
            <button type="button" style={styles.clearButton} onClick={clearSavedDraft}>Clear draft</button>
          </div>

          <div style={styles.stepNav}>
            {steps.map((item, index) => (
              <button
                key={item.key}
                type="button"
                style={index === step ? styles.activeStepPill : styles.stepPill}
                onClick={() => setStep(index)}
              >
                {index + 1}. {item.label}
              </button>
            ))}
          </div>

          <div style={styles.formHeader}>
            <p style={styles.formEyebrow}>LAUNCH APPLIX</p>
            <h2 style={styles.formTitle}>{activeStep.title}</h2>
          </div>

          {step === 0 && (
            <section style={styles.sectionCard}>
              <h3 style={styles.panelTitle}>Start campaign</h3>
              <p style={styles.panelText}>Applix will help you approach companies in a chosen area using your resume details. You can set it up first, then sign up at the end to save everything.</p>
              <div style={styles.previewGrid}>
                <div style={styles.previewCard}>Find companies</div>
                <div style={styles.previewCard}>Prepare messages</div>
                <div style={styles.previewCard}>Wait for approval</div>
              </div>
            </section>
          )}

          {step === 1 && (
            <section style={styles.sectionCard}>
              <label style={styles.label}>What work do you want?
                <input style={styles.input} value={targetRole} onChange={(event) => setTargetRole(event.target.value)} placeholder="Support Worker, Admin Assistant, Social Worker" />
              </label>
              <label style={styles.label}>What kind of companies should Applix look for?
                <input style={styles.input} value={industry} onChange={(event) => setIndustry(event.target.value)} placeholder="NDIS providers, aged care, healthcare, local offices" />
              </label>
              <MapRadiusSelector value={mapSelection} onChange={setMapSelection} />
            </section>
          )}

          {step === 2 && (
            <section style={styles.resumeSheet}>
              <div style={styles.resumeHeader}>
                <div>
                  <p style={styles.sheetKicker}>Resume form</p>
                  <h3 style={styles.resumeName}>{resume.fullName || "Your Name"}</h3>
                </div>
                <div style={styles.resumeContact}>{resume.email || "email@example.com"}<br />{resume.phone || "04xx xxx xxx"}<br />{resume.location || "Your suburb"}</div>
              </div>

              <div style={styles.twoColumnGrid}>
                <label style={styles.smallLabel}>Full name<input style={styles.input} value={resume.fullName} onChange={(event) => updateResume("fullName", event.target.value)} placeholder="Your name" /></label>
                <label style={styles.smallLabel}>Email<input style={styles.input} value={resume.email} onChange={(event) => updateResume("email", event.target.value)} placeholder="you@gmail.com" /></label>
                <label style={styles.smallLabel}>Phone<input style={styles.input} value={resume.phone} onChange={(event) => updateResume("phone", event.target.value)} placeholder="04xx xxx xxx" /></label>
                <label style={styles.smallLabel}>Suburb<input style={styles.input} value={resume.location} onChange={(event) => updateResume("location", event.target.value)} placeholder="Sydney NSW" /></label>
              </div>

              <label style={styles.smallLabel}>Profile summary<textarea style={styles.textarea} value={resume.summary} onChange={(event) => updateResume("summary", event.target.value)} placeholder="Reliable support worker with experience in personal care, community access, and clear communication." /></label>
              <label style={styles.smallLabel}>Skills<textarea style={styles.textarea} value={resume.skills} onChange={(event) => updateResume("skills", event.target.value)} placeholder="Personal care, NDIS support, community access, documentation, teamwork" /></label>
              <label style={styles.smallLabel}>Experience<textarea style={styles.textarea} value={resume.experience} onChange={(event) => updateResume("experience", event.target.value)} placeholder="Where you worked, what you did, and any real achievements." /></label>
              <label style={styles.smallLabel}>Certificates / checks<textarea style={styles.textarea} value={resume.certificates} onChange={(event) => updateResume("certificates", event.target.value)} placeholder="First Aid, CPR, WWCC, Police Check, NDIS module, licences" /></label>
            </section>
          )}

          {step === 3 && (
            <section style={styles.sectionCard}>
              <div style={styles.planGrid}>
                <button type="button" style={plan === "gentle" ? styles.activePlanCard : styles.planCard} onClick={() => setPlan("gentle")}>
                  <strong>10 applications/day</strong>
                  <span>For 10 days</span>
                  <small>Gentle start. Better for testing and first users.</small>
                </button>
                <button type="button" style={plan === "full" ? styles.activePlanCard : styles.planCard} onClick={() => setPlan("full")}>
                  <strong>100 applications/day</strong>
                  <span>For 10 days</span>
                  <small>Full Applix run. More reach, more review work.</small>
                </button>
              </div>
            </section>
          )}

          {step === 4 && (
            <section style={styles.sectionCard}>
              <label style={styles.consentRow}>
                <input type="checkbox" checked={aiConsent} onChange={(event) => setAiConsent(event.target.checked)} />
                <span><strong>Allow AI writing support</strong><br />Applix can write email drafts and tailor editable resume wording. Your facts stay locked.</span>
              </label>
              <label style={styles.consentRow}>
                <input type="checkbox" checked={emailConsent} onChange={(event) => setEmailConsent(event.target.checked)} />
                <span><strong>Allow email access request later</strong><br />Applix may ask for permission to send approved emails on your behalf. Nothing sends without approval.</span>
              </label>
            </section>
          )}

          {step === 5 && (
            <section style={styles.sectionCard}>
              <h3 style={styles.panelTitle}>Ready to launch</h3>
              <p style={styles.panelText}>Create your Applix account to save this setup and open your dashboard.</p>
              <div style={styles.summaryCard}>
                <span>Work: {targetRole || "Not selected"}</span>
                <span>Companies: {industry || "Not selected"}</span>
                <span>Area: {mapSelection.selectedAddress || "Not selected"}</span>
                <span>Level: {dailyLimit} applications/day for {campaignDays} days</span>
              </div>
            </section>
          )}

          {error && <p style={styles.errorText}>{error}</p>}

          <div style={styles.buttonRow}>
            {step > 0 && <button style={styles.backButton} type="button" onClick={previousStep}>Back</button>}
            {step < steps.length - 1 ? (
              <button style={styles.launchButton} type="button" onClick={nextStep}>Continue</button>
            ) : (
              <button style={styles.launchButton} type="button" onClick={createDraft}>Launch Applix & sign up</button>
            )}
          </div>

          <p style={styles.disclaimer}>Applix prepares your reach-outs first. Nothing goes out until you approve it.</p>
        </section>
      </section>
    </main>
  );
}

const styles = {
  main: { minHeight: "100vh", background: "radial-gradient(circle at 18% 14%, rgba(255, 138, 61, 0.18), transparent 24%), radial-gradient(circle at 72% 24%, rgba(94, 231, 255, 0.1), transparent 26%), linear-gradient(135deg, #080403 0%, #050914 42%, #07070b 100%)", color: "#f8fafc", fontFamily: "Arial, Helvetica, sans-serif", padding: "34px 24px 64px" },
  header: { maxWidth: 1180, margin: "0 auto 44px", display: "flex", alignItems: "center", gap: 14, color: "#f8fafc", flexWrap: "wrap" as const },
  logoMark: { display: "grid", placeItems: "center", width: 30, height: 30, borderRadius: 9, background: "#17100b", border: "1px solid rgba(255, 154, 76, 0.7)", color: "#ffc27a", textDecoration: "none", fontWeight: 900 },
  headerText: { fontSize: 10, letterSpacing: 2, fontWeight: 900, color: "#cbd5e1" },
  navLinks: { marginLeft: "auto", display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" as const },
  navLink: { color: "#cbd5e1", textDecoration: "none", fontSize: 12, fontWeight: 900 },
  hero: { maxWidth: 1180, margin: "0 auto", display: "grid", gridTemplateColumns: "minmax(280px, 0.86fr) minmax(420px, 1fr)", gap: 28, alignItems: "start" },
  sidePanel: { position: "sticky" as const, top: 24, padding: "24px 0 0" },
  eyebrow: { margin: "0 0 18px", color: "#7dd3fc", fontSize: 11, fontWeight: 900, letterSpacing: 2.2 },
  sideTitle: { maxWidth: 620, margin: 0, fontSize: "clamp(44px, 6vw, 76px)", lineHeight: 0.9, letterSpacing: -3, textTransform: "uppercase" as const, textShadow: "4px 4px 0 rgba(255, 138, 61, 0.25), -3px -2px 0 rgba(94, 231, 255, 0.18)" },
  leadLine: { maxWidth: 560, margin: "24px 0 0", color: "#f8fafc", fontSize: 20, lineHeight: 1.48, fontWeight: 900 },
  symbioteLine: { maxWidth: 560, margin: "18px 0 0", color: "#b6c2d5", fontSize: 15, lineHeight: 1.75, fontWeight: 700 },
  explainBox: { marginTop: 28, padding: 18, borderRadius: 20, background: "rgba(15, 23, 42, 0.72)", border: "1px solid rgba(255, 138, 61, 0.35)" },
  stepBadge: { color: "#5ee7ff", fontSize: 11, letterSpacing: 1.5, fontWeight: 900 },
  explainTitle: { margin: "10px 0 8px", color: "#ffffff" },
  explainText: { margin: 0, color: "#cbd5e1", lineHeight: 1.6, fontWeight: 700 },
  statsGrid: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, marginTop: 20 },
  statCard: { padding: 16, borderRadius: 18, background: "rgba(15, 23, 42, 0.72)", border: "1px solid rgba(255, 138, 61, 0.35)" },
  statNumber: { display: "block", fontSize: 30, lineHeight: 1, color: "#ffffff" },
  statText: { display: "block", marginTop: 8, color: "#cbd5e1", fontWeight: 900, fontSize: 12 },
  launchCard: { borderRadius: 22, padding: 0, background: "linear-gradient(180deg, rgba(13, 18, 31, 0.98), rgba(8, 12, 20, 0.98))", boxShadow: "0 30px 90px rgba(0, 0, 0, 0.38)", border: "1px solid rgba(255, 138, 61, 0.45)", overflow: "hidden" },
  windowDots: { display: "flex", alignItems: "center", gap: 6, padding: "12px 14px", borderBottom: "1px solid rgba(255, 138, 61, 0.28)" },
  dot: { width: 8, height: 8, borderRadius: 999, display: "block" },
  cacheBar: { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", padding: "12px 18px", color: "#cbd5e1", background: "rgba(94,231,255,0.06)", borderBottom: "1px solid rgba(94,231,255,0.14)", fontSize: 12, fontWeight: 800 },
  clearButton: { border: "1px solid rgba(255,255,255,0.14)", background: "transparent", color: "#ffd08a", borderRadius: 999, padding: "7px 10px", fontWeight: 900, cursor: "pointer" },
  stepNav: { display: "flex", gap: 8, overflowX: "auto" as const, padding: "14px 18px", borderBottom: "1px solid rgba(255, 138, 61, 0.18)" },
  stepPill: { whiteSpace: "nowrap" as const, border: "1px solid rgba(255,255,255,0.12)", borderRadius: 999, background: "transparent", color: "#9ca3af", padding: "9px 12px", fontWeight: 900, cursor: "pointer" },
  activeStepPill: { whiteSpace: "nowrap" as const, border: 0, borderRadius: 999, background: "linear-gradient(135deg, #ff8a3d, #ffd08a)", color: "#120804", padding: "9px 12px", fontWeight: 900, cursor: "pointer" },
  formHeader: { padding: "24px 24px 6px" },
  formEyebrow: { margin: "0 0 8px", color: "#5ee7ff", fontWeight: 900, textTransform: "uppercase" as const, letterSpacing: 1.8, fontSize: 11 },
  formTitle: { margin: 0, color: "#ffffff", fontSize: 34, letterSpacing: -1.2, lineHeight: 1.05 },
  sectionCard: { margin: "18px 24px 0", padding: 18, borderRadius: 18, background: "rgba(2, 6, 23, 0.55)", border: "1px solid rgba(94, 231, 255, 0.18)" },
  panelTitle: { margin: "0 0 8px", color: "#ffffff", fontSize: 20, fontWeight: 900 },
  panelText: { margin: 0, color: "#9ca3af", lineHeight: 1.55, fontWeight: 700 },
  previewGrid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 16 },
  previewCard: { padding: 14, borderRadius: 16, background: "rgba(255, 138, 61, 0.12)", color: "#ffd08a", fontWeight: 900, textAlign: "center" as const },
  label: { display: "grid", gap: 9, marginTop: 16, color: "#e5e7eb", fontWeight: 900 },
  smallLabel: { display: "grid", gap: 8, marginTop: 14, color: "#e5e7eb", fontWeight: 900, fontSize: 13 },
  input: { width: "100%", border: "1px solid rgba(255, 138, 61, 0.26)", borderRadius: 14, padding: "15px 16px", outline: "none", color: "#ffffff", background: "rgba(2, 6, 23, 0.75)", fontWeight: 800 },
  textarea: { width: "100%", minHeight: 88, resize: "vertical" as const, border: "1px solid rgba(255, 138, 61, 0.26)", borderRadius: 14, padding: "15px 16px", outline: "none", color: "#ffffff", background: "rgba(2, 6, 23, 0.75)", fontWeight: 800, fontFamily: "Arial, Helvetica, sans-serif" },
  resumeSheet: { margin: "18px 24px 0", padding: 20, borderRadius: 18, background: "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(2,6,23,0.55))", border: "1px solid rgba(255,255,255,0.16)" },
  resumeHeader: { display: "flex", justifyContent: "space-between", gap: 16, paddingBottom: 16, borderBottom: "1px solid rgba(255,255,255,0.14)", flexWrap: "wrap" as const },
  sheetKicker: { margin: 0, color: "#5ee7ff", fontSize: 11, fontWeight: 900, letterSpacing: 1.8 },
  resumeName: { margin: "8px 0 0", color: "#ffffff", fontSize: 28, letterSpacing: -1 },
  resumeContact: { color: "#cbd5e1", lineHeight: 1.6, fontWeight: 800, textAlign: "right" as const },
  twoColumnGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 4 },
  planGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 },
  planCard: { display: "grid", gap: 8, padding: 18, borderRadius: 18, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(15,23,42,0.8)", color: "#e5e7eb", textAlign: "left" as const, cursor: "pointer" },
  activePlanCard: { display: "grid", gap: 8, padding: 18, borderRadius: 18, border: "1px solid rgba(255,138,61,0.7)", background: "rgba(255,138,61,0.16)", color: "#ffffff", textAlign: "left" as const, cursor: "pointer" },
  consentRow: { display: "flex", gap: 12, alignItems: "flex-start", padding: 16, borderRadius: 16, background: "rgba(15,23,42,0.82)", color: "#cbd5e1", fontWeight: 700, lineHeight: 1.5, marginTop: 12 },
  summaryCard: { marginTop: 16, padding: 16, borderRadius: 16, background: "rgba(15,23,42,0.82)", display: "grid", gap: 10, color: "#cbd5e1", fontWeight: 800 },
  errorText: { margin: "14px 24px 0", color: "#fecaca", fontWeight: 900, lineHeight: 1.45 },
  buttonRow: { display: "flex", gap: 12, margin: "24px 24px 0" },
  backButton: { flex: 0.4, padding: "17px 20px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.16)", background: "transparent", color: "#ffffff", fontWeight: 900, cursor: "pointer" },
  launchButton: { flex: 1, padding: "17px 24px", border: 0, borderRadius: 999, background: "linear-gradient(135deg, #ff8a3d, #5ee7ff)", color: "#090d18", fontWeight: 900, fontSize: 18, cursor: "pointer", boxShadow: "0 20px 40px rgba(255, 138, 61, 0.22)" },
  disclaimer: { margin: "14px 24px 24px", color: "#9ca3af", fontSize: 13, lineHeight: 1.5, fontWeight: 800 },
};
