"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

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

export default function MatchingPage() {
  const [jobs, setJobs] = useState<MatchJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState("");
  const [message, setMessage] = useState("");
  const [index, setIndex] = useState(0);

  useEffect(() => {
    loadJobs();
  }, []);

  async function loadJobs() {
    setLoading(true);
    try {
      const response = await fetch("/api/jobs?role=support%20worker&location=Sydney&country=au", {
        cache: "no-store",
      });
      const data = await response.json();
      setJobs(data.jobs || []);
      setSource(data.source || "unknown");
      setMessage(data.message || "Jobs loaded.");
      setIndex(0);
    } catch (error: any) {
      setMessage(error?.message || "Could not load jobs.");
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }

  const job = jobs[index];

  function nextJob() {
    if (!jobs.length) return;
    setIndex((index + 1) % jobs.length);
  }

  function previousJob() {
    if (!jobs.length) return;
    setIndex(index === 0 ? jobs.length - 1 : index - 1);
  }

  if (loading) {
    return <main style={styles.loading}>Loading job matches...</main>;
  }

  if (!job) {
    return (
      <main style={styles.main}>
        <section style={styles.shell}>
          <Link href="/" style={styles.back}>Back home</Link>
          <div style={styles.emptyCard}>
            <h1>No jobs loaded</h1>
            <p>{message}</p>
            <button onClick={loadJobs} style={styles.primaryButton}>Try again</button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main style={styles.main}>
      <section style={styles.shell}>
        <header style={styles.header}>
          <Link href="/" style={styles.back}>Back home</Link>
          <div style={styles.headerCenter}>
            <strong>Applix Matching</strong>
            <span>{index + 1} of {jobs.length}</span>
          </div>
          <button onClick={loadJobs} style={styles.refresh}>Refresh</button>
        </header>

        <div style={styles.statusBar}>
          <span style={source === "adzuna" ? styles.liveDot : styles.demoDot} />
          <span>{source === "adzuna" ? "Live Adzuna jobs" : message}</span>
        </div>

        <article style={styles.jobCard}>
          <div style={styles.topRow}>
            <div>
              <p style={styles.company}>{job.company || "Company not listed"}</p>
              <h1 style={styles.title}>{job.title || "Untitled job"}</h1>
            </div>
            <div style={styles.match}>{job.match || 75}%</div>
          </div>

          <div style={styles.metaRow}>
            <span>{job.location || "Location not listed"}</span>
            <span>{job.salary || "Salary not listed"}</span>
            <span>{job.type || "Job type not listed"}</span>
          </div>

          <section style={styles.sectionBox}>
            <h2>Job summary</h2>
            <p>{trimText(job.description || "No description provided.", 460)}</p>
          </section>

          <section style={styles.sectionBoxLight}>
            <h2>Signals</h2>
            <div style={styles.tags}>
              {(job.tags || []).slice(0, 5).map((tag) => (
                <span key={tag} style={styles.tag}>{tag}</span>
              ))}
            </div>
          </section>

          <div style={styles.actions}>
            <button onClick={previousJob} style={styles.secondaryButton}>Previous</button>
            <button onClick={nextJob} style={styles.secondaryButton}>Skip</button>
            {job.applyUrl ? (
              <a href={job.applyUrl} target="_blank" style={styles.primaryButton}>Open job</a>
            ) : (
              <button style={styles.primaryButton}>Create resume</button>
            )}
          </div>
        </article>
      </section>
    </main>
  );
}

function trimText(value: string, limit: number) {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit).trim()}...`;
}

const styles = {
  loading: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    fontFamily: "Arial, Helvetica, sans-serif",
    background: "#f6f7fb",
    color: "#111827",
  },
  main: {
    minHeight: "100vh",
    background: "#f6f7fb",
    color: "#111827",
    fontFamily: "Arial, Helvetica, sans-serif",
    padding: 20,
  },
  shell: {
    maxWidth: 860,
    margin: "0 auto",
  },
  header: {
    display: "grid",
    gridTemplateColumns: "1fr auto 1fr",
    alignItems: "center",
    gap: 16,
    padding: "14px 0 22px",
  },
  headerCenter: {
    display: "grid",
    gap: 4,
    textAlign: "center" as const,
  },
  back: {
    color: "#111827",
    textDecoration: "none",
    fontWeight: 800,
  },
  refresh: {
    justifySelf: "end",
    border: "1px solid #e5e7eb",
    background: "white",
    borderRadius: 999,
    padding: "10px 14px",
    fontWeight: 800,
    cursor: "pointer",
  },
  statusBar: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
    padding: "12px 14px",
    background: "white",
    border: "1px solid #e5e7eb",
    borderRadius: 18,
    fontWeight: 800,
    color: "#334155",
  },
  liveDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    background: "#22c55e",
  },
  demoDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    background: "#f59e0b",
  },
  jobCard: {
    background: "white",
    border: "1px solid #e5e7eb",
    borderRadius: 28,
    padding: 26,
    boxShadow: "0 18px 50px rgba(15,23,42,0.08)",
  },
  topRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 18,
  },
  company: {
    margin: 0,
    color: "#64748b",
    fontWeight: 900,
    fontSize: 17,
  },
  title: {
    margin: "8px 0 0",
    fontSize: "clamp(34px, 6vw, 54px)",
    lineHeight: 1,
    letterSpacing: -2,
  },
  match: {
    minWidth: 70,
    textAlign: "center" as const,
    borderRadius: 18,
    padding: "12px 10px",
    background: "#ecfdf5",
    color: "#047857",
    fontWeight: 900,
    fontSize: 20,
  },
  metaRow: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 10,
    marginTop: 22,
  },
  sectionBox: {
    marginTop: 22,
    padding: 20,
    borderRadius: 22,
    background: "#f8fafc",
    color: "#334155",
    lineHeight: 1.7,
  },
  sectionBoxLight: {
    marginTop: 14,
    padding: 20,
    borderRadius: 22,
    border: "1px solid #e5e7eb",
  },
  tags: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 8,
  },
  tag: {
    borderRadius: 999,
    background: "#f1f5f9",
    padding: "8px 12px",
    fontWeight: 800,
    color: "#475569",
  },
  actions: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1.3fr",
    gap: 12,
    marginTop: 20,
  },
  primaryButton: {
    display: "block",
    textAlign: "center" as const,
    border: 0,
    borderRadius: 999,
    background: "#111827",
    color: "white",
    padding: "15px 18px",
    fontWeight: 900,
    textDecoration: "none",
    cursor: "pointer",
  },
  secondaryButton: {
    border: "1px solid #e5e7eb",
    borderRadius: 999,
    background: "white",
    color: "#111827",
    padding: "15px 18px",
    fontWeight: 900,
    cursor: "pointer",
  },
  emptyCard: {
    background: "white",
    borderRadius: 26,
    padding: 26,
    border: "1px solid #e5e7eb",
  },
};
