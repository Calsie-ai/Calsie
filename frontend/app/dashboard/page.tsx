"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

type ResumeSnapshot = {
  fullName?: string;
  email?: string;
  phone?: string;
  location?: string;
  summary?: string;
  skills?: string;
  experience?: string;
  certificates?: string;
};

type CampaignDraft = {
  targetRole?: string;
  industry?: string;
  selectedAddress?: string;
  placeId?: string;
  latitude?: number | null;
  longitude?: number | null;
  radiusKm?: number;
  resumeName?: string;
  resumeSource?: string;
  resumeSnapshot?: ResumeSnapshot;
  dailyLimit?: number;
  campaignDays?: number;
  emailConsent?: boolean;
  createdAt?: string;
};

type ReviewLead = {
  company: string;
  role: string;
  email: string;
  status: string;
};

const emptyDraft: CampaignDraft = {
  targetRole: "",
  industry: "",
  selectedAddress: "",
  radiusKm: 20,
  dailyLimit: 10,
  campaignDays: 10,
  emailConsent: false,
  resumeSnapshot: {},
};

function readStoredDraft(): CampaignDraft {
  if (typeof window === "undefined") return emptyDraft;

  const directDraft = window.sessionStorage.getItem("applixCampaignDraft");
  if (directDraft) {
    try {
      return { ...emptyDraft, ...JSON.parse(directDraft) };
    } catch {
      return emptyDraft;
    }
  }

  const chatCache = window.localStorage.getItem("applixChatLaunchCache");
  if (chatCache) {
    try {
      const chat = JSON.parse(chatCache);
      return {
        ...emptyDraft,
        targetRole: chat.targetRole || "",
        industry: chat.companyType || "",
        selectedAddress: chat.targetArea || "",
        radiusKm: chat.radiusKm || 20,
        resumeName: chat.fullName || "Applix resume",
        resumeSource: "chat_form",
        resumeSnapshot: {
          fullName: chat.fullName || "",
          email: chat.email || "",
          phone: chat.phone || "",
          location: chat.targetArea || "",
          summary: chat.resumeSummary || "",
          skills: chat.skills || "",
          experience: chat.experience || "",
          certificates: chat.certificates || "",
        },
        dailyLimit: chat.plan === "full" ? 100 : 10,
        campaignDays: 10,
        emailConsent: Boolean(chat.emailConsent),
        createdAt: new Date().toISOString(),
      };
    } catch {
      return emptyDraft;
    }
  }

  return emptyDraft;
}

export default function DashboardPage() {
  const [draft, setDraft] = useState<CampaignDraft>(emptyDraft);
  const [userEmail, setUserEmail] = useState("");
  const [status, setStatus] = useState("Loading Applix dashboard...");
  const [routeStatus, setRouteStatus] = useState("Waiting for review");
  const [leads] = useState<ReviewLead[]>([
    { company: "Aequalis Disability Services", role: "Disability Support Worker", email: "admin@aequalisds.com.au", status: "Draft needed" },
    { company: "Right At Home", role: "Support Worker", email: "Email not found yet", status: "Needs enrichment" },
    { company: "EnableU", role: "Support Worker", email: "Email not found yet", status: "Needs enrichment" },
  ]);

  const hasSetup = Boolean(draft.targetRole || draft.industry || draft.selectedAddress);
  const resume = draft.resumeSnapshot || {};
  const dailyLimit = draft.dailyLimit || 10;
  const campaignDays = draft.campaignDays || 10;
  const targetTotal = dailyLimit * campaignDays;

  const readyChecklist = useMemo(
    () => [
      { label: "Target role", ok: Boolean(draft.targetRole) },
      { label: "Company type", ok: Boolean(draft.industry) },
      { label: "Target area", ok: Boolean(draft.selectedAddress) },
      { label: "Resume contact", ok: Boolean(resume.fullName && resume.email) },
      { label: "Email consent", ok: Boolean(draft.emailConsent) },
    ],
    [draft, resume]
  );

  useEffect(() => {
    const stored = readStoredDraft();
    setDraft(stored);
    setStatus(stored.targetRole ? "Setup restored. Review before starting job hunt." : "No setup found. Start from the Applix chat first.");

    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email || "");
    });
  }, []);

  async function startJobHuntRoute() {
    if (!hasSetup) {
      setStatus("No Applix setup found. Go back and answer the chat first.");
      return;
    }

    setRouteStatus("Queued for Supabase job hunting route");
    setStatus("First version queued locally. Next we connect this button to Supabase Edge Function + OpenAI parser.");

    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("applixCampaignDraft", JSON.stringify(draft));
      window.sessionStorage.setItem("applixLastCampaignStatus", "queued_review");
    }
  }

  return (
    <main style={styles.main}>
      <section style={styles.shell}>
        <header style={styles.header}>
          <Link href="/" style={styles.backLink}>← New Applix chat</Link>
          <p style={styles.badge}>Applix review board</p>
          <h1 style={styles.title}>Review before Applix moves.</h1>
          <p style={styles.subtitle}>This is the control room. Applix can hunt companies, prepare drafts, and tailor editable resume wording — but nothing is sent until you approve it.</p>
          {userEmail && <p style={styles.userLine}>Signed in as {userEmail}</p>}
        </header>

        <section style={styles.grid}>
          <Metric label="Daily pace" value={`${dailyLimit}/day`} />
          <Metric label="Run length" value={`${campaignDays} days`} />
          <Metric label="Target reach" value={`${targetTotal}`} />
          <Metric label="Route" value={routeStatus} small />
        </section>

        <section style={styles.twoColumn}>
          <article style={styles.card}>
            <p style={styles.cardLabel}>Campaign setup</p>
            <h2 style={styles.cardTitle}>{draft.targetRole || "No target role yet"}</h2>
            <div style={styles.summaryList}>
              <Row label="Companies" value={draft.industry || "Not selected"} />
              <Row label="Area" value={draft.selectedAddress ? `${draft.selectedAddress} (${draft.radiusKm || 20}km)` : "Not selected"} />
              <Row label="Resume" value={draft.resumeName || resume.fullName || "Not added"} />
              <Row label="Email consent" value={draft.emailConsent ? "Allowed later, approval required" : "Not allowed yet"} />
            </div>
          </article>

          <article style={styles.card}>
            <p style={styles.cardLabel}>Ready check</p>
            <h2 style={styles.cardTitle}>Before job hunting starts</h2>
            <div style={styles.checkList}>
              {readyChecklist.map((item) => (
                <div key={item.label} style={styles.checkRow}>
                  <span style={item.ok ? styles.okDot : styles.waitDot}>{item.ok ? "✓" : "!"}</span>
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
            <button style={styles.primaryButton} onClick={startJobHuntRoute}>Start Supabase job hunt route</button>
            <p style={styles.muted}>{status}</p>
          </article>
        </section>

        <section style={styles.card}>
          <p style={styles.cardLabel}>Review queue</p>
          <h2 style={styles.cardTitle}>Companies and drafts to approve</h2>
          <div style={styles.boardGrid}>
            <ReviewColumn title="1. Found companies" items={leads.map((lead) => `${lead.company} — ${lead.role}`)} />
            <ReviewColumn title="2. Email drafts" items={["Waiting for OpenAI draft route", "Subject + body will appear here", "User approves before send"]} />
            <ReviewColumn title="3. Resume tailoring" items={["Editable summary", "Editable skills block", "Truth stays locked from resume"]} />
            <ReviewColumn title="4. Approval/send" items={["Approve selected emails", "5 per hour sending pace", "Gmail consent required"]} />
          </div>
        </section>

        <section style={styles.card}>
          <p style={styles.cardLabel}>Resume source of truth</p>
          <div style={styles.resumeBox}>
            <h3>{resume.fullName || "Name not added"}</h3>
            <p>{resume.email || "email not added"} {resume.phone ? `• ${resume.phone}` : ""}</p>
            <p>{resume.summary || "Resume summary will appear here."}</p>
            <p><strong>Skills:</strong> {resume.skills || "Not added"}</p>
            <p><strong>Experience:</strong> {resume.experience || "Not added"}</p>
            <p><strong>Certificates/checks:</strong> {resume.certificates || "Not added"}</p>
          </div>
        </section>
      </section>
    </main>
  );
}

function Metric({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <article style={styles.metric}>
      <p style={styles.cardLabel}>{label}</p>
      <h2 style={small ? styles.metricSmallValue : styles.metricValue}>{value}</h2>
    </article>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.row}>
      <strong>{label}</strong>
      <span>{value}</span>
    </div>
  );
}

function ReviewColumn({ title, items }: { title: string; items: string[] }) {
  return (
    <article style={styles.reviewColumn}>
      <h3>{title}</h3>
      {items.map((item) => <p key={item}>{item}</p>)}
    </article>
  );
}

const styles = {
  main: { minHeight: "100vh", background: "radial-gradient(circle at 18% 14%, rgba(255,138,61,.16), transparent 24%), radial-gradient(circle at 72% 24%, rgba(94,231,255,.1), transparent 26%), linear-gradient(135deg,#080403,#050914 42%,#07070b)", color: "#f8fafc", fontFamily: "Arial, Helvetica, sans-serif", padding: "46px 24px" },
  shell: { maxWidth: 1180, margin: "0 auto" },
  header: { padding: 38, borderRadius: 28, background: "linear-gradient(135deg, rgba(9,13,24,.96), rgba(16,26,48,.96) 55%, rgba(31,21,80,.92))", border: "1px solid rgba(255,138,61,.34)", boxShadow: "0 24px 70px rgba(0,0,0,.28)" },
  backLink: { color: "#ffd08a", textDecoration: "none", fontWeight: 900 },
  badge: { width: "fit-content", margin: "28px 0 16px", padding: "10px 18px", borderRadius: 999, background: "rgba(255,138,61,.1)", border: "1px solid rgba(255,138,61,.28)", color: "#ffd08a", fontWeight: 900 },
  title: { maxWidth: 760, margin: "0 0 16px", fontSize: "clamp(40px, 6vw, 76px)", lineHeight: .98, letterSpacing: -3, textTransform: "uppercase" as const },
  subtitle: { maxWidth: 780, color: "#d6def0", fontSize: 20, lineHeight: 1.6, margin: 0, fontWeight: 700 },
  userLine: { margin: "18px 0 0", color: "#7dd3fc", fontWeight: 900 },
  grid: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 18, marginTop: 22 },
  metric: { padding: 24, borderRadius: 24, background: "rgba(15,23,42,.78)", border: "1px solid rgba(94,231,255,.14)", boxShadow: "0 20px 50px rgba(0,0,0,.18)" },
  metricValue: { margin: 0, fontSize: 34, letterSpacing: -1.2, color: "#ffffff" },
  metricSmallValue: { margin: 0, fontSize: 18, lineHeight: 1.35, color: "#ffffff" },
  twoColumn: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 22, marginTop: 22 },
  card: { marginTop: 22, padding: 28, borderRadius: 26, background: "rgba(15,23,42,.78)", border: "1px solid rgba(255,138,61,.22)", boxShadow: "0 20px 50px rgba(0,0,0,.18)" },
  cardLabel: { margin: "0 0 10px", color: "#5ee7ff", fontSize: 12, textTransform: "uppercase" as const, letterSpacing: 1.2, fontWeight: 900 },
  cardTitle: { margin: 0, fontSize: 28, letterSpacing: -1, color: "#ffffff" },
  muted: { margin: "14px 0 0", color: "#9ca3af", fontWeight: 700, lineHeight: 1.55 },
  summaryList: { display: "grid", gap: 12, marginTop: 18 },
  row: { display: "grid", gridTemplateColumns: "120px 1fr", gap: 12, color: "#cbd5e1", lineHeight: 1.5 },
  checkList: { display: "grid", gap: 10, marginTop: 18 },
  checkRow: { display: "flex", alignItems: "center", gap: 10, color: "#cbd5e1", fontWeight: 800 },
  okDot: { display: "grid", placeItems: "center", width: 24, height: 24, borderRadius: 999, background: "rgba(34,197,94,.18)", color: "#86efac", fontWeight: 900 },
  waitDot: { display: "grid", placeItems: "center", width: 24, height: 24, borderRadius: 999, background: "rgba(255,138,61,.18)", color: "#ffd08a", fontWeight: 900 },
  primaryButton: { width: "100%", marginTop: 20, padding: "16px 20px", border: 0, borderRadius: 999, background: "linear-gradient(135deg,#ff8a3d,#5ee7ff)", color: "#090d18", fontWeight: 900, cursor: "pointer" },
  boardGrid: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 14, marginTop: 18 },
  reviewColumn: { minHeight: 210, padding: 16, borderRadius: 18, background: "rgba(2,6,23,.66)", border: "1px solid rgba(255,255,255,.1)" },
  resumeBox: { marginTop: 16, padding: 18, borderRadius: 18, background: "rgba(2,6,23,.66)", color: "#cbd5e1", lineHeight: 1.6, fontWeight: 700 },
};
