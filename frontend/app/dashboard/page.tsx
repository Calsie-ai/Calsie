"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type DashboardState = {
  campaignId: string;
  status: string;
};

export default function DashboardPage() {
  const [state, setState] = useState<DashboardState>({ campaignId: "", status: "Campaign dashboard ready" });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const campaignId = params.get("campaign") || sessionStorage.getItem("applixLastCampaignId") || "";
    setState({ campaignId, status: campaignId ? "Campaign queued in Supabase" : "No campaign selected yet" });
  }, []);

  return (
    <main style={styles.main}>
      <section style={styles.shell}>
        <header style={styles.header}>
          <Link href="/" style={styles.backLink}>← New campaign</Link>
          <p style={styles.badge}>Applix dashboard</p>
          <h1 style={styles.title}>Campaign mission control.</h1>
          <p style={styles.subtitle}>This page will read Supabase reports from Python scraping, n8n enrichment, Gmail sending, replies, failures, and daily limits.</p>
        </header>

        <section style={styles.grid}>
          <Metric label="Campaign" value={state.campaignId ? "Queued" : "Waiting"} />
          <Metric label="Daily limit" value="25" />
          <Metric label="Campaign days" value="30" />
          <Metric label="Target reach" value="750" />
        </section>

        <section style={styles.card}>
          <p style={styles.cardLabel}>Current status</p>
          <h2 style={styles.cardTitle}>{state.status}</h2>
          <p style={styles.muted}>{state.campaignId ? `Campaign ID: ${state.campaignId}` : "Launch a campaign first to see live tracking."}</p>
        </section>

        <section style={styles.card}>
          <p style={styles.cardLabel}>Pipeline</p>
          <div style={styles.flowBox}>
            <span>Supabase campaign</span>
            <span>→</span>
            <span>Python company scrape</span>
            <span>→</span>
            <span>Lead storage</span>
            <span>→</span>
            <span>n8n enrichment</span>
            <span>→</span>
            <span>Outreach queue</span>
            <span>→</span>
            <span>Report back</span>
          </div>
        </section>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <article style={styles.metric}>
      <p style={styles.cardLabel}>{label}</p>
      <h2 style={styles.metricValue}>{value}</h2>
    </article>
  );
}

const styles = {
  main: { minHeight: "100vh", background: "#eef0f4", color: "#111827", fontFamily: "Arial, Helvetica, sans-serif", padding: "46px 24px" },
  shell: { maxWidth: 1180, margin: "0 auto" },
  header: { padding: 38, borderRadius: 34, background: "linear-gradient(135deg, #090d18 0%, #101a30 55%, #1f1550 100%)", color: "white", boxShadow: "0 24px 70px rgba(15, 23, 42, 0.18)" },
  backLink: { color: "#cfe0ff", textDecoration: "none", fontWeight: 900 },
  badge: { width: "fit-content", margin: "28px 0 16px", padding: "10px 18px", borderRadius: 999, background: "rgba(255,255,255,0.09)", border: "1px solid rgba(255,255,255,0.14)", color: "#cfe0ff", fontWeight: 900 },
  title: { maxWidth: 760, margin: "0 0 16px", fontSize: "clamp(40px, 6vw, 76px)", lineHeight: 0.98, letterSpacing: -3 },
  subtitle: { maxWidth: 740, color: "#d6def0", fontSize: 20, lineHeight: 1.6, margin: 0 },
  grid: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 18, marginTop: 22 },
  metric: { padding: 24, borderRadius: 28, background: "white", boxShadow: "0 20px 50px rgba(15,23,42,0.1)" },
  metricValue: { margin: 0, fontSize: 34, letterSpacing: -1.2 },
  card: { marginTop: 22, padding: 28, borderRadius: 30, background: "white", boxShadow: "0 20px 50px rgba(15,23,42,0.1)" },
  cardLabel: { margin: "0 0 10px", color: "#7c3aed", fontSize: 12, textTransform: "uppercase" as const, letterSpacing: 1.2, fontWeight: 900 },
  cardTitle: { margin: 0, fontSize: 28, letterSpacing: -1 },
  muted: { margin: "12px 0 0", color: "#6b7280", fontWeight: 700, lineHeight: 1.55 },
  flowBox: { padding: 18, borderRadius: 22, background: "#f3f4f6", display: "flex", flexWrap: "wrap" as const, gap: 12, color: "#111827", fontWeight: 900 },
};
