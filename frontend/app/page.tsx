"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type CampaignDraft = {
  targetRole: string;
  industry: string;
  radius: string;
  resumeName: string;
  resumeSource: "applix_profile" | "uploaded_file" | "not_ready";
  dailyLimit: number;
  campaignDays: number;
  createdAt: string;
};

export default function HomePage() {
  const router = useRouter();
  const [targetRole, setTargetRole] = useState("");
  const [industry, setIndustry] = useState("");
  const [radius, setRadius] = useState("20");
  const [resumeName, setResumeName] = useState("");
  const [useApplixResume, setUseApplixResume] = useState(true);
  const [error, setError] = useState("");

  function createDraft() {
    const cleanRole = targetRole.trim();
    const cleanIndustry = industry.trim();

    if (!cleanRole) {
      setError("Add the target job or role first.");
      return;
    }

    if (!cleanIndustry) {
      setError("Add the desired industry or company type first.");
      return;
    }

    const draft: CampaignDraft = {
      targetRole: cleanRole,
      industry: cleanIndustry,
      radius,
      resumeName: useApplixResume ? "Applix resume profile" : resumeName || "Resume not attached yet",
      resumeSource: useApplixResume ? "applix_profile" : resumeName ? "uploaded_file" : "not_ready",
      dailyLimit: 25,
      campaignDays: 30,
      createdAt: new Date().toISOString(),
    };

    sessionStorage.setItem("applixCampaignDraft", JSON.stringify(draft));
    router.push("/campaign/draft");
  }

  return (
    <main style={styles.main}>
      <section style={styles.hero}>
        <div style={styles.copyPanel}>
          <p style={styles.badge}>Applix by ASSI</p>
          <h1 style={styles.title}>Launch your 30-day AI job hunt.</h1>
          <p style={styles.subtitle}>
            Fill your resume inside Applix, choose your target role, select your search radius,
            and Applix will prepare a focused outreach campaign to relevant local companies.
          </p>

          <div style={styles.statsGrid}>
            <div style={styles.statCard}>
              <strong style={styles.statNumber}>25</strong>
              <span style={styles.statText}>target companies per day</span>
            </div>
            <div style={styles.statCard}>
              <strong style={styles.statNumber}>30</strong>
              <span style={styles.statText}>day campaign</span>
            </div>
            <div style={styles.statCard}>
              <strong style={styles.statNumber}>750</strong>
              <span style={styles.statText}>possible opportunities</span>
            </div>
          </div>
        </div>

        <form style={styles.launchCard} onSubmit={(event) => event.preventDefault()}>
          <div style={styles.formHeader}>
            <p style={styles.formEyebrow}>Campaign setup</p>
            <h2 style={styles.formTitle}>Tell Applix what to hunt for</h2>
          </div>

          <label style={styles.label}>
            Target job or role
            <input
              style={styles.input}
              type="text"
              name="targetRole"
              value={targetRole}
              onChange={(event) => setTargetRole(event.target.value)}
              placeholder="Example: Support Worker, Admin Assistant, Junior Developer"
            />
          </label>

          <label style={styles.label}>
            Desired industry / company type
            <input
              style={styles.input}
              type="text"
              name="industry"
              value={industry}
              onChange={(event) => setIndustry(event.target.value)}
              placeholder="Example: NDIS providers, healthcare, local agencies"
            />
          </label>

          <section style={styles.resumePanel}>
            <div>
              <p style={styles.mapTitle}>Resume source</p>
              <p style={styles.mapText}>
                Recommended: fill your resume inside Applix so AI can tailor versions for each company.
              </p>
            </div>

            <label style={styles.choiceRow}>
              <input type="radio" checked={useApplixResume} onChange={() => setUseApplixResume(true)} />
              Use my Applix resume profile
            </label>

            <Link href="/profile" style={styles.resumeButton}>
              Fill / edit resume profile
            </Link>

            <label style={styles.choiceRow}>
              <input type="radio" checked={!useApplixResume} onChange={() => setUseApplixResume(false)} />
              Upload a resume file instead
            </label>

            {!useApplixResume && (
              <input
                style={styles.fileInput}
                type="file"
                name="resume"
                accept=".pdf,.doc,.docx"
                onChange={(event) => setResumeName(event.target.files?.[0]?.name || "")}
              />
            )}
          </section>

          <div style={styles.mapBlock}>
            <div>
              <p style={styles.mapTitle}>Select search area</p>
              <p style={styles.mapText}>
                Google Maps radius selector will connect here. For now, choose the radius below.
              </p>
            </div>
            <div style={styles.mapPreview}>
              <span style={styles.mapPin}>⌖</span>
              <span style={styles.radiusRing} />
            </div>
          </div>

          <label style={styles.label}>
            Search radius
            <select style={styles.input} name="radius" value={radius} onChange={(event) => setRadius(event.target.value)}>
              <option value="5">5 km</option>
              <option value="10">10 km</option>
              <option value="20">20 km</option>
              <option value="30">30 km</option>
              <option value="50">50 km</option>
            </select>
          </label>

          {error && <p style={styles.errorText}>{error}</p>}

          <button style={styles.launchButton} type="button" onClick={createDraft}>
            Launch Applix
          </button>

          <p style={styles.disclaimer}>
            Applix will only contact relevant companies inside your selected area after you approve the campaign.
          </p>
        </form>
      </section>
    </main>
  );
}

const styles = {
  main: {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at top left, rgba(124, 58, 237, 0.18), transparent 34%), #eef0f4",
    color: "#111827",
    fontFamily: "Arial, Helvetica, sans-serif",
    padding: "54px 24px",
  },
  hero: {
    maxWidth: 1220,
    minHeight: "calc(100vh - 108px)",
    margin: "0 auto",
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) minmax(360px, 460px)",
    gap: 28,
    alignItems: "stretch",
  },
  copyPanel: {
    borderRadius: 38,
    padding: "72px 58px",
    background: "linear-gradient(135deg, #090d18 0%, #101a30 55%, #1f1550 100%)",
    color: "white",
    boxShadow: "0 30px 90px rgba(15, 23, 42, 0.22)",
    display: "flex",
    flexDirection: "column" as const,
    justifyContent: "space-between",
  },
  badge: {
    width: "fit-content",
    padding: "10px 18px",
    borderRadius: 999,
    background: "rgba(255,255,255,0.09)",
    border: "1px solid rgba(255,255,255,0.14)",
    color: "#cfe0ff",
    fontWeight: 900,
    margin: 0,
  },
  title: {
    maxWidth: 760,
    margin: "72px 0 24px",
    fontSize: "clamp(48px, 7vw, 92px)",
    lineHeight: 0.96,
    letterSpacing: -4,
  },
  subtitle: {
    maxWidth: 680,
    color: "#d6def0",
    fontSize: 21,
    lineHeight: 1.65,
    margin: 0,
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 14,
    marginTop: 58,
  },
  statCard: {
    padding: 20,
    borderRadius: 24,
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.12)",
  },
  statNumber: { display: "block", fontSize: 34, lineHeight: 1 },
  statText: { display: "block", marginTop: 10, color: "#d6def0", fontWeight: 700 },
  launchCard: {
    borderRadius: 38,
    padding: 34,
    background: "#ffffff",
    boxShadow: "0 30px 90px rgba(15, 23, 42, 0.16)",
    border: "1px solid rgba(15, 23, 42, 0.08)",
  },
  formHeader: { marginBottom: 26 },
  formEyebrow: {
    margin: "0 0 8px",
    color: "#7c3aed",
    fontWeight: 900,
    textTransform: "uppercase" as const,
    letterSpacing: 1.4,
    fontSize: 12,
  },
  formTitle: { margin: 0, fontSize: 30, letterSpacing: -1.2 },
  label: { display: "grid", gap: 9, marginTop: 18, color: "#374151", fontWeight: 900 },
  input: {
    width: "100%",
    border: "1px solid #d1d5db",
    borderRadius: 18,
    padding: "16px 18px",
    outline: "none",
    color: "#111827",
    background: "#f9fafb",
    fontWeight: 700,
  },
  resumePanel: {
    marginTop: 20,
    padding: 18,
    borderRadius: 24,
    background: "#f8fafc",
    border: "1px solid #e5e7eb",
  },
  choiceRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginTop: 14,
    color: "#374151",
    fontWeight: 900,
  },
  resumeButton: {
    display: "block",
    textAlign: "center" as const,
    marginTop: 14,
    padding: "14px 18px",
    borderRadius: 999,
    background: "#111827",
    color: "white",
    textDecoration: "none",
    fontWeight: 900,
  },
  fileInput: {
    width: "100%",
    marginTop: 12,
    border: "1px dashed #9ca3af",
    borderRadius: 18,
    padding: "18px",
    color: "#111827",
    background: "#f9fafb",
    fontWeight: 700,
  },
  mapBlock: {
    marginTop: 20,
    display: "grid",
    gridTemplateColumns: "1fr 170px",
    gap: 18,
    alignItems: "center",
    padding: 18,
    borderRadius: 24,
    background: "#f3f4f6",
    border: "1px solid #e5e7eb",
  },
  mapTitle: { margin: "0 0 8px", fontSize: 18, fontWeight: 900 },
  mapText: { margin: 0, color: "#6b7280", lineHeight: 1.5, fontWeight: 700 },
  mapPreview: {
    position: "relative" as const,
    minHeight: 140,
    borderRadius: 22,
    background: "linear-gradient(135deg, #dbeafe 0%, #ecfeff 48%, #dcfce7 100%)",
    overflow: "hidden",
    display: "grid",
    placeItems: "center",
  },
  mapPin: {
    position: "relative" as const,
    zIndex: 2,
    width: 42,
    height: 42,
    borderRadius: 999,
    background: "#111827",
    color: "white",
    display: "grid",
    placeItems: "center",
    fontSize: 24,
    fontWeight: 900,
  },
  radiusRing: {
    position: "absolute" as const,
    width: 112,
    height: 112,
    borderRadius: 999,
    border: "3px solid rgba(124, 58, 237, 0.38)",
    background: "rgba(124, 58, 237, 0.08)",
  },
  errorText: { margin: "14px 0 0", color: "#dc2626", fontWeight: 900 },
  launchButton: {
    width: "100%",
    marginTop: 24,
    padding: "19px 24px",
    border: 0,
    borderRadius: 999,
    background: "linear-gradient(135deg, #00d4ff, #7c3aed)",
    color: "white",
    fontWeight: 900,
    fontSize: 18,
    cursor: "pointer",
    boxShadow: "0 20px 40px rgba(124, 58, 237, 0.26)",
  },
  disclaimer: { margin: "16px 0 0", color: "#6b7280", fontSize: 13, lineHeight: 1.5, fontWeight: 700 },
};
