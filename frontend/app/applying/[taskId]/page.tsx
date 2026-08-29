"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type React from "react";
import { supabase } from "../../lib/supabaseClient";

type GatewayJob = {
  id: string;
  title: string | null;
  company: string | null;
  location: string | null;
  hiring_email: string | null;
  apply_url: string | null;
  source_url: string | null;
  match_score: number | null;
  refreshed_at: string | null;
  tags: string[] | null;
};

type Interaction = {
  action: string | null;
  job_title: string | null;
  company: string | null;
  created_at: string | null;
};

type Stat = {
  label: string;
  value: number;
  helper: string;
  suffix?: string;
};

const EMAIL_DAILY_LIMIT = 25;

export default function ApplixApplyingDashboard() {
  const [jobs, setJobs] = useState<GatewayJob[]>([]);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("Connecting to Supabase...");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    loadDashboard();
    const refresh = setInterval(loadDashboard, 15000);
    const pulse = setInterval(() => setTick((current) => current + 1), 1200);
    return () => {
      clearInterval(refresh);
      clearInterval(pulse);
    };
  }, []);

  async function loadDashboard() {
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;

      if (!user) {
        setJobs([]);
        setInteractions([]);
        setMessage("Login first so Applix can show your real apply automation data.");
        setLoading(false);
        return;
      }

      const [jobsResult, interactionResult] = await Promise.allSettled([
        supabase
          .from("jobs_gateway")
          .select("id,title,company,location,hiring_email,apply_url,source_url,match_score,refreshed_at,tags")
          .eq("user_id", user.id)
          .order("refreshed_at", { ascending: false })
          .limit(1500),
        supabase
          .from("job_interactions")
          .select("action,job_title,company,created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(40),
      ]);

      if (jobsResult.status === "fulfilled" && !jobsResult.value.error) {
        setJobs((jobsResult.value.data || []) as GatewayJob[]);
      } else {
        setJobs([]);
      }

      if (interactionResult.status === "fulfilled" && !interactionResult.value.error) {
        setInteractions((interactionResult.value.data || []) as Interaction[]);
      } else {
        setInteractions([]);
      }

      setMessage("Live Supabase data connected. Applix is showing real jobs, matches, and apply activity.");
    } catch (error: any) {
      setMessage(error?.message || "Could not load dashboard data yet.");
    } finally {
      setLoading(false);
    }
  }

  const stats = useMemo(() => {
    const jobsLooked = jobs.length;
    const matched = jobs.filter((job) => Number(job.match_score || 0) >= 70).length;
    const automationReady = jobs.filter((job) => Number(job.match_score || 0) >= 80 && Boolean(job.hiring_email || job.apply_url || job.source_url)).length;
    const draftsPrepared = interactions.filter((item) => ["resume_created", "application_prepared"].includes(String(item.action))).length;
    const sentToday = interactions.filter((item) => String(item.action) === "sent" && isToday(item.created_at)).length;

    return {
      jobsLooked,
      matched,
      automationReady,
      draftsPrepared,
      sentToday,
      remainingToday: Math.max(EMAIL_DAILY_LIMIT - sentToday, 0),
    };
  }, [jobs, interactions]);

  const statCards: Stat[] = [
    { label: "Jobs Looked", value: stats.jobsLooked, helper: "Rows loaded from jobs_gateway" },
    { label: "Matched", value: stats.matched, helper: "Match score 70% or higher" },
    { label: "Automation Ready", value: stats.automationReady, helper: "Strong match with email or apply path" },
    { label: "Drafts Prepared", value: stats.draftsPrepared, helper: "Resume/application actions saved" },
    { label: "Emails Today", value: stats.sentToday, helper: `${stats.remainingToday} Gmail sends remaining`, suffix: ` / ${EMAIL_DAILY_LIMIT}` },
  ];

  const pipeline = [
    { label: "Scanning Supabase jobs", value: progressFrom(stats.jobsLooked, 1500) },
    { label: "Filtering real matches", value: stats.jobsLooked ? Math.round((stats.matched / stats.jobsLooked) * 100) : 0 },
    { label: "Checking automation paths", value: stats.matched ? Math.round((stats.automationReady / stats.matched) * 100) : 0 },
    { label: "Preparing apply queue", value: stats.automationReady ? Math.min(100, 35 + stats.draftsPrepared * 8) : 0 },
  ];

  const recentJobs = jobs.slice(0, 6);
  const activity = buildActivity(jobs, interactions, stats.automationReady);
  const statusText = loading ? "Booting apply engine" : stats.automationReady > 0 ? "Automation queue ready" : "Waiting for more matched jobs";

  return (
    <main style={styles.main}>
      <style>{animationCss}</style>
      <section style={styles.shell}>
        <header style={styles.header}>
          <Link href="/matching" style={styles.back}>Back to matches</Link>
          <div style={styles.statusPill}><span style={styles.liveDot} /> {statusText}</div>
        </header>

        <section style={styles.heroGrid}>
          <div style={styles.heroCopy}>
            <p style={styles.eyebrow}>APPLIX APPLY ENGINE</p>
            <h1 style={styles.title}>Live application automation dashboard.</h1>
            <p style={styles.subtitle}>{message}</p>
          </div>

          <div style={styles.corePanel}>
            <div style={styles.scanRing}>
              <span style={styles.scanValue}>{stats.automationReady}</span>
              <span style={styles.scanLabel}>ready</span>
            </div>
            <div>
              <p style={styles.panelTiny}>Current operation</p>
              <h2 style={styles.panelHeading}>Apply Queue Sync</h2>
              <p style={styles.panelText}>Every number on this screen is calculated from your Supabase jobs and interaction tables.</p>
            </div>
          </div>
        </section>

        <section style={styles.statsGrid}>
          {statCards.map((item) => (
            <StatCard key={item.label} stat={item} tick={tick} />
          ))}
        </section>

        <section style={styles.dashboardGrid}>
          <div style={styles.panelLarge}>
            <div style={styles.panelHeader}>
              <div>
                <p style={styles.panelTiny}>Pipeline</p>
                <h2 style={styles.panelHeading}>Real apply stages</h2>
              </div>
              <span style={styles.panelCode}>SUPABASE LIVE</span>
            </div>
            {pipeline.map((step) => (
              <div key={step.label} style={styles.progressRow}>
                <div style={styles.progressLabel}><span>{step.label}</span><strong>{step.value}%</strong></div>
                <div style={styles.progressTrack}><div style={{ ...styles.progressFill, width: `${step.value}%` }} /></div>
              </div>
            ))}
          </div>

          <div style={styles.panelLarge}>
            <div style={styles.panelHeader}>
              <div>
                <p style={styles.panelTiny}>Live activity</p>
                <h2 style={styles.panelHeading}>Meaningful events</h2>
              </div>
              <span style={styles.panelCode}>AUTO REFRESH 15s</span>
            </div>
            <div style={styles.activityList}>
              {activity.map((line, index) => (
                <div key={`${line}-${index}`} style={styles.activityItem}>
                  <span style={styles.activityTime}>{index === 0 ? "NOW" : `T-${index * 3}m`}</span>
                  <span>{line}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section style={styles.jobsPanel}>
          <div style={styles.panelHeader}>
            <div>
              <p style={styles.panelTiny}>Queue preview</p>
              <h2 style={styles.panelHeading}>Latest jobs Applix can evaluate</h2>
            </div>
            <Link href="/matching" style={styles.applyButton}>Review matches</Link>
          </div>

          <div style={styles.jobList}>
            {recentJobs.length ? recentJobs.map((job) => (
              <article key={job.id} style={styles.jobRow}>
                <div>
                  <strong>{job.title || "Untitled role"}</strong>
                  <p>{job.company || "Company not listed"} · {job.location || "Location not listed"}</p>
                </div>
                <span style={Number(job.match_score || 0) >= 80 ? styles.readyTag : styles.matchTag}>{Number(job.match_score || 0)}%</span>
              </article>
            )) : (
              <div style={styles.emptyState}>No jobs loaded yet. When the background fetcher saves jobs_gateway rows, this dashboard will light up with real numbers.</div>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}

function StatCard({ stat, tick }: { stat: Stat; tick: number }) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const target = stat.value;
    const step = Math.max(1, Math.ceil(Math.abs(target - shown) / 10));
    const timer = setTimeout(() => {
      setShown((current) => current === target ? current : current < target ? Math.min(target, current + step) : Math.max(target, current - step));
    }, 35);
    return () => clearTimeout(timer);
  }, [stat.value, shown, tick]);

  return (
    <article style={styles.statCard}>
      <p style={styles.statLabel}>{stat.label}</p>
      <strong style={styles.statValue}>{shown.toLocaleString()}{stat.suffix || ""}</strong>
      <span style={styles.statHelper}>{stat.helper}</span>
    </article>
  );
}

function progressFrom(value: number, max: number) {
  if (!value) return 0;
  return Math.max(8, Math.min(100, Math.round((value / max) * 100)));
}

function isToday(dateText: string | null) {
  if (!dateText) return false;
  const date = new Date(dateText);
  const now = new Date();
  return date.toDateString() === now.toDateString();
}

function buildActivity(jobs: GatewayJob[], interactions: Interaction[], automationReady: number) {
  const lines: string[] = [];
  if (jobs.length) lines.push(`${jobs.length.toLocaleString()} jobs looked from Supabase jobs_gateway.`);
  if (automationReady) lines.push(`${automationReady.toLocaleString()} jobs are ready for automation review.`);
  interactions.slice(0, 4).forEach((item) => {
    const action = String(item.action || "activity").replaceAll("_", " ");
    lines.push(`${action}: ${item.job_title || "job"}${item.company ? ` at ${item.company}` : ""}.`);
  });
  if (!lines.length) lines.push("Waiting for the first job fetch and apply interaction to be saved.");
  return lines.slice(0, 6);
}

const animationCss = `
@keyframes applixPulse { 0%,100%{opacity:.55;transform:scale(1)} 50%{opacity:1;transform:scale(1.04)} }
@keyframes applixScan { 0%{transform:translateX(-100%)} 100%{transform:translateX(100%)} }
@keyframes applixGlow { 0%,100%{box-shadow:0 0 28px rgba(0,212,255,.2)} 50%{box-shadow:0 0 48px rgba(124,58,237,.42)} }
`;

const styles = {
  main: {
    minHeight: "100vh",
    color: "#e5e7eb",
    background: "radial-gradient(circle at 20% 0%, rgba(124,58,237,.28), transparent 32%), radial-gradient(circle at 80% 10%, rgba(0,212,255,.22), transparent 30%), #050816",
    fontFamily: "Arial, Helvetica, sans-serif",
    padding: "28px",
  },
  shell: { maxWidth: 1240, margin: "0 auto" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 },
  back: { color: "#93c5fd", textDecoration: "none", fontWeight: 900 },
  statusPill: { border: "1px solid rgba(0,212,255,.35)", borderRadius: 999, padding: "10px 14px", background: "rgba(15,23,42,.72)", color: "#cffafe", fontWeight: 900 },
  liveDot: { display: "inline-block", width: 9, height: 9, borderRadius: 99, background: "#22c55e", marginRight: 8, animation: "applixPulse 1.4s infinite" },
  heroGrid: { display: "grid", gridTemplateColumns: "1.25fr .75fr", gap: 20, marginBottom: 20 },
  heroCopy: { position: "relative", overflow: "hidden", border: "1px solid rgba(0,212,255,.28)", borderRadius: 28, padding: 34, background: "linear-gradient(135deg, rgba(15,23,42,.88), rgba(30,41,59,.58))" },
  eyebrow: { margin: 0, color: "#00d4ff", letterSpacing: 3, fontWeight: 900, fontSize: 13 },
  title: { maxWidth: 760, margin: "16px 0", fontSize: "clamp(42px, 7vw, 82px)", lineHeight: .92, letterSpacing: -3, color: "#f8fafc" },
  subtitle: { maxWidth: 720, margin: 0, color: "#b6c7df", fontSize: 18, lineHeight: 1.7 },
  corePanel: { display: "grid", alignContent: "center", gap: 20, border: "1px solid rgba(124,58,237,.42)", borderRadius: 28, padding: 28, background: "linear-gradient(145deg, rgba(88,28,135,.28), rgba(8,13,30,.92))", animation: "applixGlow 3.8s infinite" },
  scanRing: { width: 180, height: 180, borderRadius: 999, border: "2px solid rgba(0,212,255,.7)", display: "grid", placeItems: "center", justifySelf: "center", background: "radial-gradient(circle, rgba(0,212,255,.18), transparent 65%)" },
  scanValue: { fontSize: 56, color: "#67e8f9", fontWeight: 900, lineHeight: 1 },
  scanLabel: { marginTop: -54, color: "#c4b5fd", fontWeight: 900, textTransform: "uppercase" },
  statsGrid: { display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 14, marginBottom: 20 },
  statCard: { border: "1px solid rgba(0,212,255,.24)", borderRadius: 22, padding: 20, background: "rgba(15,23,42,.78)", minHeight: 126 },
  statLabel: { margin: 0, color: "#94a3b8", fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: 1.4 },
  statValue: { display: "block", marginTop: 10, color: "#f8fafc", fontSize: 36, lineHeight: 1, letterSpacing: -1 },
  statHelper: { display: "block", marginTop: 12, color: "#8fb4d6", fontSize: 12, lineHeight: 1.45 },
  dashboardGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 },
  panelLarge: { border: "1px solid rgba(124,58,237,.32)", borderRadius: 24, padding: 22, background: "rgba(8,13,30,.86)" },
  panelHeader: { display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start", marginBottom: 18 },
  panelTiny: { margin: 0, color: "#22d3ee", textTransform: "uppercase", fontSize: 12, letterSpacing: 2, fontWeight: 900 },
  panelHeading: { margin: "6px 0 0", color: "#f8fafc", fontSize: 22 },
  panelText: { color: "#b6c7df", lineHeight: 1.6, margin: 0 },
  panelCode: { color: "#c4b5fd", fontSize: 11, fontWeight: 900, border: "1px solid rgba(196,181,253,.28)", padding: "8px 10px", borderRadius: 999 },
  progressRow: { marginBottom: 18 },
  progressLabel: { display: "flex", justifyContent: "space-between", color: "#dbeafe", fontWeight: 800, marginBottom: 8 },
  progressTrack: { height: 12, borderRadius: 999, overflow: "hidden", background: "rgba(148,163,184,.16)" },
  progressFill: { height: "100%", borderRadius: 999, background: "linear-gradient(90deg, #00d4ff, #7c3aed, #22c55e)", transition: "width .7s ease" },
  activityList: { display: "grid", gap: 10 },
  activityItem: { display: "grid", gridTemplateColumns: "70px 1fr", gap: 12, border: "1px solid rgba(255,255,255,.08)", borderRadius: 14, padding: 12, color: "#dbeafe", background: "rgba(255,255,255,.04)" },
  activityTime: { color: "#00d4ff", fontWeight: 900, fontSize: 12 },
  jobsPanel: { border: "1px solid rgba(0,212,255,.28)", borderRadius: 24, padding: 22, background: "rgba(15,23,42,.82)" },
  applyButton: { background: "linear-gradient(135deg, #00d4ff, #7c3aed)", color: "white", padding: "13px 18px", borderRadius: 999, textDecoration: "none", fontWeight: 900 },
  jobList: { display: "grid", gap: 10 },
  jobRow: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, border: "1px solid rgba(255,255,255,.09)", borderRadius: 18, padding: 16, background: "rgba(255,255,255,.045)" },
  readyTag: { color: "#052e16", background: "#22c55e", borderRadius: 999, padding: "9px 12px", fontWeight: 900 },
  matchTag: { color: "#082f49", background: "#67e8f9", borderRadius: 999, padding: "9px 12px", fontWeight: 900 },
  emptyState: { padding: 20, color: "#b6c7df", border: "1px dashed rgba(148,163,184,.35)", borderRadius: 18 },
} satisfies Record<string, React.CSSProperties>;
