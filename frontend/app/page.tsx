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
      <section style={styles.hero}>
        <div style={styles.copyPanel}>
          <div>
            <div style={styles.brandRow}>
              <p style={styles.badge}>ASSI Symbiote</p>
              <span style={styles.statusDot}>Live memory</span>
            </div>

            <h1 style={styles.title}>Tell Applix what work you want.</h1>

            <p style={styles.leadLine}>
              It finds the companies, writes the approach, and helps you reach them every day.
            </p>

            <p style={styles.symbioteLine}>
              Applix is the job-hunt symbiote from ASSI — a small worker beside you that searches,
              writes, remembers, and prepares your next move while you stay in control.
            </p>

            <p style={styles.controlLine}>You approve everything before anything is sent.</p>
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

        <form style={styles.launchCard} onSubmit={(event) => event.preventDefault()}>
          <div style={styles.formHeader}>
            <p style={styles.formEyebrow}>Launch Applix</p>
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
              <p style={styles.mapTitle}>Your resume memory</p>
              <p style={styles.mapText}>
                Applix uses the details you save in your profile. It can shape the wording, but your
                facts stay locked.
              </p>
            </div>

            <div style={styles.resumeMemoryCard}>
              <span style={styles.memoryIcon}>ASSI</span>
              <div>
                <strong style={styles.memoryTitle}>Use my Applix resume profile</strong>
                <p style={styles.memoryText}>No PDF scraping. Edit your details once and let Applix work from that.</p>
              </div>
            </div>

            <Link href="/profile" style={styles.resumeButton}>
              Fill / edit resume details
            </Link>
          </section>

          <MapRadiusSelector value={mapSelection} onChange={setMapSelection} />

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
      "radial-gradient(circle at top left, rgba(99, 102, 241, 0.18), transparent 32%), radial-gradient(circle at bottom right, rgba(20, 184, 166, 0.16), transparent 28%), #eef0f4",
    color: "#111827",
    fontFamily: "Arial, Helvetica, sans-serif",
    padding: "54px 24px",
  },
  hero: {
    maxWidth: 1240,
    minHeight: "calc(100vh - 108px)",
    margin: "0 auto",
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.08fr) minmax(360px, 470px)",
    gap: 28,
    alignItems: "stretch",
  },
  copyPanel: {
    position: "relative" as const,
    overflow: "hidden",
    borderRadius: 38,
    padding: "64px 58px",
    background:
      "linear-gradient(145deg, #05070d 0%, #0b1221 48%, #111c36 73%, #281250 100%)",
    color: "white",
    boxShadow: "0 30px 90px rgba(15, 23, 42, 0.28)",
    display: "flex",
    flexDirection: "column" as const,
    justifyContent: "space-between",
  },
  brandRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
  },
  badge: {
    width: "fit-content",
    padding: "10px 18px",
    borderRadius: 999,
    background: "rgba(255,255,255,0.09)",
    border: "1px solid rgba(255,255,255,0.14)",
    color: "#dbeafe",
    fontWeight: 900,
    margin: 0,
  },
  statusDot: {
    padding: "9px 14px",
    borderRadius: 999,
    color: "#a7f3d0",
    background: "rgba(16, 185, 129, 0.12)",
    border: "1px solid rgba(167, 243, 208, 0.2)",
    fontWeight: 900,
    fontSize: 13,
  },
  title: {
    maxWidth: 760,
    margin: "70px 0 24px",
    fontSize: "clamp(46px, 6.6vw, 88px)",
    lineHeight: 0.96,
    letterSpacing: -4,
  },
  leadLine: {
    maxWidth: 680,
    color: "#f8fafc",
    fontSize: 24,
    lineHeight: 1.42,
    margin: 0,
    fontWeight: 800,
  },
  symbioteLine: {
    maxWidth: 700,
    color: "#cbd5e1",
    fontSize: 19,
    lineHeight: 1.7,
    margin: "22px 0 0",
  },
  controlLine: {
    width: "fit-content",
    margin: "28px 0 0",
    padding: "12px 16px",
    borderRadius: 999,
    color: "#ecfeff",
    background: "rgba(34, 211, 238, 0.12)",
    border: "1px solid rgba(103, 232, 249, 0.22)",
    fontWeight: 900,
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
  statText: { display: "block", marginTop: 10, color: "#d6def0", fontWeight: 800 },
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
  formTitle: { margin: 0, fontSize: 32, letterSpacing: -1.2 },
  formIntro: { margin: "10px 0 0", color: "#6b7280", lineHeight: 1.55, fontWeight: 700 },
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
  resumeMemoryCard: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginTop: 16,
    padding: 14,
    borderRadius: 20,
    background: "white",
    border: "1px solid #e5e7eb",
  },
  memoryIcon: {
    display: "grid",
    placeItems: "center",
    width: 44,
    height: 44,
    borderRadius: 16,
    background: "linear-gradient(135deg, #111827, #7c3aed)",
    color: "white",
    fontSize: 11,
    fontWeight: 900,
  },
  memoryTitle: { display: "block", color: "#111827" },
  memoryText: { margin: "4px 0 0", color: "#6b7280", lineHeight: 1.45, fontSize: 13, fontWeight: 700 },
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
  mapTitle: { margin: "0 0 8px", fontSize: 18, fontWeight: 900 },
  mapText: { margin: 0, color: "#6b7280", lineHeight: 1.5, fontWeight: 700 },
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
