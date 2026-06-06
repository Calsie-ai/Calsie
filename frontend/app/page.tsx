"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import MapRadiusSelector, { type MapSelection } from "../components/MapRadiusSelector";

type CampaignDraft = {
  targetRole: string;
  industry: string;
  selectedAddress: string;
  placeId: string;
  latitude: number | null;
  longitude: number | null;
  radiusKm: number;
  resumeName: string;
  resumeSource: "applix_profile" | "not_ready";
  dailyLimit: number;
  campaignDays: number;
  createdAt: string;
};

export default function HomePage() {
  const router = useRouter();
  const [targetRole, setTargetRole] = useState("");
  const [industry, setIndustry] = useState("");
  const [mapSelection, setMapSelection] = useState<MapSelection>({
    selectedAddress: "",
    placeId: "",
    latitude: null,
    longitude: null,
    radiusKm: 20,
  });
  const [error, setError] = useState("");

  function createDraft() {
    const cleanRole = targetRole.trim();
    const cleanIndustry = industry.trim();

    if (!cleanRole) {
      setError("Tell Applix what work you want first.");
      return;
    }

    if (!cleanIndustry) {
      setError("Tell Applix what kind of companies to look for.");
      return;
    }

    if (!mapSelection.latitude || !mapSelection.longitude || !mapSelection.selectedAddress) {
      setError("Choose the area where Applix should hunt.");
      return;
    }

    const draft: CampaignDraft = {
      targetRole: cleanRole,
      industry: cleanIndustry,
      selectedAddress: mapSelection.selectedAddress,
      placeId: mapSelection.placeId,
      latitude: mapSelection.latitude,
      longitude: mapSelection.longitude,
      radiusKm: mapSelection.radiusKm,
      resumeName: "Applix resume profile",
      resumeSource: "applix_profile",
      dailyLimit: 100,
      campaignDays: 30,
      createdAt: new Date().toISOString(),
    };

    sessionStorage.setItem("applixCampaignDraft", JSON.stringify(draft));
    router.push("/campaign/draft");
  }

  return (
    <main style={styles.main}>
      <header style={styles.header}>
        <Link href="/" style={styles.logoMark}>
          A
        </Link>
        <div style={styles.headerText}>ARTIFICIAL SYMBIOTIC SUPER INTELLIGENCE</div>
        <nav style={styles.navLinks}>
          <Link href="/" style={styles.navLink}>Symbiotes</Link>
          <Link href="/profile" style={styles.navLink}>Resume Memory</Link>
          <Link href="/login" style={styles.navLink}>Applix Account</Link>
        </nav>
      </header>

      <section style={styles.hero}>
        <div style={styles.copyPanel}>
          <p style={styles.eyebrow}>ASSI ECOSYSTEM / APPLIX SYMBIOTE</p>
          <h1 style={styles.title}>Tell Applix what work you want.</h1>
          <p style={styles.leadLine}>
            It finds the companies, writes the approach, and helps you reach them every day.
          </p>
          <p style={styles.symbioteLine}>
            Applix is the job-hunt symbiote from ASSI — a small worker beside you that searches,
            writes, remembers, and prepares your next move while you stay in control.
          </p>

          <div style={styles.actionRow}>
            <a href="#launch" style={styles.primaryPill}>Open Applix</a>
            <span style={styles.secondaryPill}>You approve before sending</span>
          </div>

          <div style={styles.productCard}>
            <div style={styles.windowDots}>
              <span style={{ ...styles.dot, background: "#ff8a3d" }} />
              <span style={{ ...styles.dot, background: "#5ee7ff" }} />
              <span style={{ ...styles.dot, background: "#8b5cf6" }} />
            </div>
            <div style={styles.productCardBody}>
              <p style={styles.productKicker}>ASSI VISUAL</p>
              <h2 style={styles.productName}>Applix</h2>
              <p style={styles.productCopy}>
                Symbiotic job hunter. Searches, remembers, prepares messages, and keeps you in command.
              </p>
            </div>
          </div>

          <div style={styles.statsGrid}>
            <div style={styles.statCard}>
              <strong style={styles.statNumber}>100</strong>
              <span style={styles.statText}>doors/day</span>
            </div>
            <div style={styles.statCard}>
              <strong style={styles.statNumber}>5/hr</strong>
              <span style={styles.statText}>safe pace</span>
            </div>
            <div style={styles.statCard}>
              <strong style={styles.statNumber}>30</strong>
              <span style={styles.statText}>days memory</span>
            </div>
          </div>
        </div>

        <form id="launch" style={styles.launchCard} onSubmit={(event) => event.preventDefault()}>
          <div style={styles.windowDots}>
            <span style={{ ...styles.dot, background: "#ff8a3d" }} />
            <span style={{ ...styles.dot, background: "#5ee7ff" }} />
            <span style={{ ...styles.dot, background: "#8b5cf6" }} />
          </div>

          <div style={styles.formHeader}>
            <p style={styles.formEyebrow}>LAUNCH APPLIX</p>
            <h2 style={styles.formTitle}>Tell Applix where to hunt</h2>
            <p style={styles.formIntro}>
              Choose the work, the company type, and the area. Applix prepares the reach-outs first.
            </p>
          </div>

          <label style={styles.label}>
            What work do you want?
            <input
              style={styles.input}
              type="text"
              name="targetRole"
              value={targetRole}
              onChange={(event) => setTargetRole(event.target.value)}
              placeholder="Support Worker, Admin Assistant, Social Worker"
            />
          </label>

          <label style={styles.label}>
            What kind of companies should Applix look for?
            <input
              style={styles.input}
              type="text"
              name="industry"
              value={industry}
              onChange={(event) => setIndustry(event.target.value)}
              placeholder="NDIS providers, aged care, healthcare, local offices"
            />
          </label>

          <section style={styles.resumePanel}>
            <div>
              <p style={styles.panelTitle}>Resume memory</p>
              <p style={styles.panelText}>
                Applix works from details you save in your profile. It can shape the wording, but your facts stay locked.
              </p>
            </div>

            <div style={styles.resumeMemoryCard}>
              <span style={styles.memoryIcon}>A</span>
              <div>
                <strong style={styles.memoryTitle}>Use my Applix resume profile</strong>
                <p style={styles.memoryText}>No PDF scraping. Edit your details once and let Applix remember them.</p>
              </div>
            </div>

            <Link href="/profile" style={styles.resumeButton}>
              Fill / edit resume details
            </Link>
          </section>

          <div style={styles.mapShell}>
            <MapRadiusSelector value={mapSelection} onChange={setMapSelection} />
          </div>

          {error && <p style={styles.errorText}>{error}</p>}

          <button style={styles.launchButton} type="button" onClick={createDraft}>
            Launch Applix
          </button>

          <p style={styles.disclaimer}>
            Applix prepares your reach-outs first. Nothing goes out until you approve it.
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
      "radial-gradient(circle at 18% 14%, rgba(255, 138, 61, 0.18), transparent 24%), radial-gradient(circle at 72% 24%, rgba(94, 231, 255, 0.1), transparent 26%), linear-gradient(135deg, #080403 0%, #050914 42%, #07070b 100%)",
    color: "#f8fafc",
    fontFamily: "Arial, Helvetica, sans-serif",
    padding: "34px 24px 64px",
  },
  header: {
    maxWidth: 1180,
    margin: "0 auto 44px",
    display: "flex",
    alignItems: "center",
    gap: 14,
    color: "#f8fafc",
  },
  logoMark: {
    display: "grid",
    placeItems: "center",
    width: 30,
    height: 30,
    borderRadius: 9,
    background: "#17100b",
    border: "1px solid rgba(255, 154, 76, 0.7)",
    color: "#ffc27a",
    textDecoration: "none",
    fontWeight: 900,
  },
  headerText: {
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: 900,
    color: "#cbd5e1",
  },
  navLinks: {
    marginLeft: "auto",
    display: "flex",
    gap: 24,
    alignItems: "center",
  },
  navLink: {
    color: "#cbd5e1",
    textDecoration: "none",
    fontSize: 12,
    fontWeight: 900,
  },
  hero: {
    maxWidth: 1180,
    margin: "0 auto",
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) minmax(380px, 450px)",
    gap: 28,
    alignItems: "start",
  },
  copyPanel: {
    minHeight: 760,
    padding: "24px 0 0",
  },
  eyebrow: {
    margin: "0 0 18px",
    color: "#7dd3fc",
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: 2.2,
  },
  title: {
    maxWidth: 760,
    margin: 0,
    fontSize: "clamp(58px, 8vw, 104px)",
    lineHeight: 0.86,
    letterSpacing: -4,
    textTransform: "uppercase" as const,
    textShadow: "4px 4px 0 rgba(255, 138, 61, 0.25), -3px -2px 0 rgba(94, 231, 255, 0.18)",
  },
  leadLine: {
    maxWidth: 640,
    margin: "28px 0 0",
    color: "#f8fafc",
    fontSize: 22,
    lineHeight: 1.48,
    fontWeight: 900,
  },
  symbioteLine: {
    maxWidth: 650,
    margin: "18px 0 0",
    color: "#b6c2d5",
    fontSize: 16,
    lineHeight: 1.75,
    fontWeight: 700,
  },
  actionRow: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap" as const,
    alignItems: "center",
    marginTop: 28,
  },
  primaryPill: {
    padding: "12px 18px",
    borderRadius: 999,
    background: "linear-gradient(135deg, #ff8a3d, #ffd08a)",
    color: "#120804",
    textDecoration: "none",
    fontWeight: 900,
    boxShadow: "0 14px 30px rgba(255, 138, 61, 0.24)",
  },
  secondaryPill: {
    padding: "11px 17px",
    borderRadius: 999,
    border: "1px solid rgba(255, 138, 61, 0.55)",
    color: "#ffe1bd",
    fontWeight: 900,
  },
  productCard: {
    maxWidth: 430,
    marginTop: 62,
    borderRadius: 18,
    border: "1px solid rgba(255, 138, 61, 0.55)",
    background: "linear-gradient(160deg, rgba(255,138,61,0.12), rgba(7,12,22,0.92) 38%, rgba(8,14,18,0.98))",
    overflow: "hidden",
    boxShadow: "0 28px 80px rgba(0,0,0,0.34)",
  },
  windowDots: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "12px 14px",
    borderBottom: "1px solid rgba(255, 138, 61, 0.28)",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    display: "block",
  },
  productCardBody: {
    padding: "86px 22px 22px",
    minHeight: 210,
    background: "radial-gradient(circle at 18% 18%, rgba(255,138,61,0.22), transparent 24%), radial-gradient(circle at 84% 24%, rgba(94,231,255,0.12), transparent 26%)",
  },
  productKicker: {
    margin: 0,
    color: "#cbd5e1",
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: 900,
  },
  productName: {
    margin: "18px 0 8px",
    color: "#ffffff",
    fontSize: 24,
    letterSpacing: -0.8,
  },
  productCopy: {
    maxWidth: 330,
    margin: 0,
    color: "#9ca3af",
    lineHeight: 1.6,
    fontWeight: 700,
    fontSize: 13,
  },
  statsGrid: {
    maxWidth: 620,
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 14,
    marginTop: 28,
  },
  statCard: {
    padding: 18,
    borderRadius: 18,
    background: "rgba(15, 23, 42, 0.72)",
    border: "1px solid rgba(255, 138, 61, 0.35)",
  },
  statNumber: { display: "block", fontSize: 32, lineHeight: 1, color: "#ffffff" },
  statText: { display: "block", marginTop: 8, color: "#cbd5e1", fontWeight: 900, fontSize: 12 },
  launchCard: {
    borderRadius: 22,
    padding: 0,
    background: "linear-gradient(180deg, rgba(13, 18, 31, 0.98), rgba(8, 12, 20, 0.98))",
    boxShadow: "0 30px 90px rgba(0, 0, 0, 0.38)",
    border: "1px solid rgba(255, 138, 61, 0.45)",
    overflow: "hidden",
  },
  formHeader: { padding: "24px 24px 6px" },
  formEyebrow: {
    margin: "0 0 8px",
    color: "#5ee7ff",
    fontWeight: 900,
    textTransform: "uppercase" as const,
    letterSpacing: 1.8,
    fontSize: 11,
  },
  formTitle: { margin: 0, color: "#ffffff", fontSize: 32, letterSpacing: -1.2, lineHeight: 1.05 },
  formIntro: { margin: "12px 0 0", color: "#9ca3af", lineHeight: 1.55, fontWeight: 700 },
  label: { display: "grid", gap: 9, margin: "18px 24px 0", color: "#e5e7eb", fontWeight: 900 },
  input: {
    width: "100%",
    border: "1px solid rgba(255, 138, 61, 0.26)",
    borderRadius: 14,
    padding: "15px 16px",
    outline: "none",
    color: "#ffffff",
    background: "rgba(2, 6, 23, 0.75)",
    fontWeight: 800,
  },
  resumePanel: {
    margin: "20px 24px 0",
    padding: 16,
    borderRadius: 18,
    background: "rgba(2, 6, 23, 0.55)",
    border: "1px solid rgba(94, 231, 255, 0.18)",
  },
  resumeMemoryCard: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginTop: 16,
    padding: 13,
    borderRadius: 16,
    background: "rgba(15, 23, 42, 0.9)",
    border: "1px solid rgba(255, 138, 61, 0.24)",
  },
  memoryIcon: {
    display: "grid",
    placeItems: "center",
    width: 42,
    height: 42,
    borderRadius: 14,
    background: "linear-gradient(135deg, #ff8a3d, #7dd3fc)",
    color: "#0b0f19",
    fontSize: 15,
    fontWeight: 900,
  },
  memoryTitle: { display: "block", color: "#ffffff" },
  memoryText: { margin: "4px 0 0", color: "#9ca3af", lineHeight: 1.45, fontSize: 13, fontWeight: 700 },
  resumeButton: {
    display: "block",
    textAlign: "center" as const,
    marginTop: 14,
    padding: "13px 18px",
    borderRadius: 999,
    background: "#ffffff",
    color: "#090d18",
    textDecoration: "none",
    fontWeight: 900,
  },
  panelTitle: { margin: "0 0 8px", color: "#ffffff", fontSize: 18, fontWeight: 900 },
  panelText: { margin: 0, color: "#9ca3af", lineHeight: 1.5, fontWeight: 700 },
  mapShell: {
    margin: "20px 24px 0",
  },
  errorText: { margin: "14px 24px 0", color: "#fecaca", fontWeight: 900, lineHeight: 1.45 },
  launchButton: {
    width: "calc(100% - 48px)",
    margin: "24px 24px 0",
    padding: "17px 24px",
    border: 0,
    borderRadius: 999,
    background: "linear-gradient(135deg, #ff8a3d, #5ee7ff)",
    color: "#090d18",
    fontWeight: 900,
    fontSize: 18,
    cursor: "pointer",
    boxShadow: "0 20px 40px rgba(255, 138, 61, 0.22)",
  },
  disclaimer: { margin: "14px 24px 24px", color: "#9ca3af", fontSize: 13, lineHeight: 1.5, fontWeight: 800 },
};
