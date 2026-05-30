"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type CampaignDraft = {
  targetRole: string;
  industry: string;
  radius: string;
  resumeName: string;
  dailyLimit: number;
  campaignDays: number;
  createdAt: string;
};

const emptyDraft: CampaignDraft = {
  targetRole: "",
  industry: "",
  radius: "20",
  resumeName: "Resume not attached yet",
  dailyLimit: 25,
  campaignDays: 30,
  createdAt: "",
};

export default function CampaignDraftPage() {
  const [draft, setDraft] = useState<CampaignDraft>(emptyDraft);
  const [status, setStatus] = useState("Draft ready for review");

  useEffect(() => {
    const savedDraft = sessionStorage.getItem("applixCampaignDraft");
    if (!savedDraft) return;

    try {
      setDraft(JSON.parse(savedDraft));
    } catch {
      setStatus("Could not load campaign draft. Please create it again.");
    }
  }, []);

  function approveDraft() {
    setStatus("Campaign approved. Next step: save this draft to Supabase and queue the Python scraper.");
  }

  const totalOpportunities = draft.dailyLimit * draft.campaignDays;

  return (
    <main style={styles.main}>
      <section style={styles.shell}>
        <header style={styles.header}>
          <Link href="/" style={styles.backLink}>← Back to setup</Link>
          <p style={styles.badge}>Campaign draft</p>
          <h1 style={styles.title}>Review your Applix job hunt before launch.</h1>
          <p style={styles.subtitle}>
            This is the working draft Applix will later save into Supabase, queue for scraping,
            enrich through n8n, and show inside your dashboard.
          </p>
        </header>

        <div style={styles.grid}>
          <article style={styles.card}>
            <p style={styles.cardLabel}>Target</p>
            <h2 style={styles.cardTitle}>{draft.targetRole || "No target role yet"}</h2>
            <p style={styles.muted}>{draft.industry || "No industry selected yet"}</p>
          </article>

          <article style={styles.card}>
            <p style={styles.cardLabel}>Search area</p>
            <h2 style={styles.cardTitle}>{draft.radius} km radius</h2>
            <p style={styles.muted}>Google Maps selector will provide the exact pin/location soon.</p>
          </article>

          <article style={styles.card}>
            <p style={styles.cardLabel}>Resume</p>
            <h2 style={styles.cardTitle}>{draft.resumeName}</h2>
            <p style={styles.muted}>File upload storage will connect to Supabase Storage next.</p>
          </article>
        </div>

        <section style={styles.planCard}>
          <div>
            <p style={styles.cardLabel}>30-day outreach plan</p>
            <h2 style={styles.planTitle}>Up to {totalOpportunities} targeted opportunities</h2>
            <p style={styles.muted}>
              Applix will queue {draft.dailyLimit} relevant companies per day for {draft.campaignDays} days,
              then n8n will enrich leads, prepare messages, send on behalf of the user, and report results back.
            </p>
          </div>

          <div style={styles.flowBox}>
            <span>Draft</span>
            <span>→</span>
            <span>Supabase queue</span>
            <span>→</span>
            <span>Python scraper</span>
            <span>→</span>
            <span>n8n outreach</span>
            <span>→</span>
            <span>Dashboard</span>
          </div>
        </section>

        <section style={styles.actionsCard}>
          <p style={styles.status}>{status}</p>
          <button style={styles.primaryButton} onClick={approveDraft}>Approve draft</button>
          <Link href="/" style={styles.secondaryButton}>Edit setup</Link>
        </section>
      </section>
    </main>
  );
}

const styles = {
  main: {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at top left, rgba(124, 58, 237, 0.16), transparent 36%), #eef0f4",
    color: "#111827",
    fontFamily: "Arial, Helvetica, sans-serif",
    padding: "46px 24px",
  },
  shell: {
    maxWidth: 1180,
    margin: "0 auto",
  },
  header: {
    padding: 38,
    borderRadius: 34,
    background: "linear-gradient(135deg, #090d18 0%, #101a30 55%, #1f1550 100%)",
    color: "white",
    boxShadow: "0 24px 70px rgba(15, 23, 42, 0.18)",
  },
  backLink: {
    color: "#cfe0ff",
    textDecoration: "none",
    fontWeight: 900,
  },
  badge: {
    width: "fit-content",
    margin: "28px 0 16px",
    padding: "10px 18px",
    borderRadius: 999,
    background: "rgba(255,255,255,0.09)",
    border: "1px solid rgba(255,255,255,0.14)",
    color: "#cfe0ff",
    fontWeight: 900,
  },
  title: {
    maxWidth: 760,
    margin: "0 0 16px",
    fontSize: "clamp(40px, 6vw, 76px)",
    lineHeight: 0.98,
    letterSpacing: -3,
  },
  subtitle: {
    maxWidth: 740,
    color: "#d6def0",
    fontSize: 20,
    lineHeight: 1.6,
    margin: 0,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 18,
    marginTop: 22,
  },
  card: {
    padding: 26,
    borderRadius: 28,
    background: "#ffffff",
    boxShadow: "0 20px 50px rgba(15, 23, 42, 0.1)",
    border: "1px solid rgba(15, 23, 42, 0.08)",
  },
  cardLabel: {
    margin: "0 0 10px",
    color: "#7c3aed",
    fontSize: 12,
    textTransform: "uppercase" as const,
    letterSpacing: 1.2,
    fontWeight: 900,
  },
  cardTitle: {
    margin: 0,
    fontSize: 24,
    letterSpacing: -0.8,
  },
  muted: {
    margin: "12px 0 0",
    color: "#6b7280",
    fontWeight: 700,
    lineHeight: 1.55,
  },
  planCard: {
    marginTop: 22,
    padding: 30,
    borderRadius: 30,
    background: "#ffffff",
    boxShadow: "0 20px 50px rgba(15, 23, 42, 0.1)",
    border: "1px solid rgba(15, 23, 42, 0.08)",
  },
  planTitle: {
    margin: 0,
    fontSize: 34,
    letterSpacing: -1.3,
  },
  flowBox: {
    marginTop: 22,
    padding: 18,
    borderRadius: 22,
    background: "#f3f4f6",
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 12,
    color: "#111827",
    fontWeight: 900,
  },
  actionsCard: {
    marginTop: 22,
    padding: 24,
    borderRadius: 30,
    background: "#ffffff",
    display: "flex",
    gap: 14,
    alignItems: "center",
    justifyContent: "space-between",
    boxShadow: "0 20px 50px rgba(15, 23, 42, 0.1)",
  },
  status: {
    margin: 0,
    color: "#374151",
    fontWeight: 900,
  },
  primaryButton: {
    padding: "16px 24px",
    border: 0,
    borderRadius: 999,
    background: "linear-gradient(135deg, #00d4ff, #7c3aed)",
    color: "white",
    fontWeight: 900,
    cursor: "pointer",
  },
  secondaryButton: {
    padding: "16px 24px",
    borderRadius: 999,
    background: "#f3f4f6",
    color: "#111827",
    textDecoration: "none",
    fontWeight: 900,
  },
};
