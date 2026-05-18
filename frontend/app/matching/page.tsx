"use client";

import Link from "next/link";
import { useState } from "react";
import { jobs } from "../data/jobs";

export default function MatchingPage() {
  const [index, setIndex] = useState(0);
  const [kitCreated, setKitCreated] = useState(false);
  const job = jobs[index];

  function nextJob() {
    setKitCreated(false);
    setIndex((index + 1) % jobs.length);
  }

  return (
    <main style={styles.main}>
      <section style={styles.shell}>
        <header style={styles.header}>
          <Link href="/" style={styles.backLink}>← Home</Link>
          <strong>Applix Matching</strong>
          <span style={styles.count}>{index + 1}/{jobs.length}</span>
        </header>

        <article style={styles.card}>
          <div style={styles.heroCard}>
            <div style={styles.logo}>{job.logo}</div>
            <span style={styles.match}>{job.match}% match</span>
            <h1 style={styles.title}>{job.title}</h1>
            <p style={styles.company}>{job.company}</p>
          </div>

          <div style={styles.chips}>
            {[job.location, job.salary, job.type].map((item) => (
              <span key={item} style={styles.chip}>{item}</span>
            ))}
          </div>

          <section style={styles.infoBox}>
            <h2 style={styles.infoTitle}>Why it matches</h2>
            <p style={styles.description}>{job.description}</p>
            <div style={styles.tags}>
              {job.tags.map((tag) => (
                <span key={tag} style={styles.tag}>{tag}</span>
              ))}
            </div>
          </section>

          <section style={styles.kitBox}>
            <div>
              <h2 style={styles.infoTitle}>AI application kit</h2>
              <p style={styles.description}>Generate a tailored resume, cover letter, and interview notes for this role.</p>
            </div>
            <button onClick={() => setKitCreated(true)} style={styles.createButton}>Create kit</button>
          </section>

          {kitCreated && (
            <div style={styles.readyBox}>Application kit ready for {job.title}.</div>
          )}
        </article>

        <footer style={styles.footer}>
          <button onClick={nextJob} style={styles.skipButton}>Skip</button>
          <button onClick={kitCreated ? nextJob : () => setKitCreated(true)} style={styles.interestedButton}>
            {kitCreated ? "Apply" : "Interested"}
          </button>
        </footer>
      </section>
    </main>
  );
}

const styles = {
  main: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #fff7ed 0%, #f5f3ff 45%, #e0f2fe 100%)",
    fontFamily: "Arial, Helvetica, sans-serif",
    padding: 20,
  },
  shell: {
    maxWidth: 460,
    margin: "0 auto",
    minHeight: "calc(100vh - 40px)",
    display: "flex",
    flexDirection: "column" as const,
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "14px 4px 18px",
  },
  backLink: {
    color: "#111827",
    textDecoration: "none",
    fontWeight: 800,
  },
  count: {
    color: "#6b7280",
    fontWeight: 700,
  },
  card: {
    flex: 1,
    background: "white",
    borderRadius: 34,
    padding: 16,
    boxShadow: "0 24px 70px rgba(15,23,42,0.18)",
  },
  heroCard: {
    minHeight: 280,
    borderRadius: 28,
    padding: 24,
    color: "white",
    background: "linear-gradient(135deg, #7c3aed 0%, #ec4899 60%, #fb923c 100%)",
    display: "flex",
    flexDirection: "column" as const,
    justifyContent: "flex-end",
  },
  logo: {
    width: 72,
    height: 72,
    borderRadius: 24,
    background: "rgba(255,255,255,0.22)",
    display: "grid",
    placeItems: "center",
    fontSize: 34,
    marginBottom: "auto",
  },
  match: {
    alignSelf: "flex-start",
    padding: "7px 11px",
    borderRadius: 999,
    background: "rgba(255,255,255,0.24)",
    fontWeight: 900,
    fontSize: 13,
  },
  title: {
    margin: "14px 0 6px",
    fontSize: 34,
    lineHeight: 1,
  },
  company: {
    margin: 0,
    fontSize: 18,
    opacity: 0.88,
  },
  chips: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 8,
    marginTop: 16,
  },
  chip: {
    borderRadius: 999,
    background: "#f3f4f6",
    padding: "9px 13px",
    fontWeight: 700,
  },
  infoBox: {
    marginTop: 16,
    borderRadius: 24,
    background: "#f8fafc",
    padding: 18,
  },
  infoTitle: {
    margin: 0,
    fontSize: 18,
  },
  description: {
    color: "#64748b",
    lineHeight: 1.6,
    margin: "8px 0 0",
  },
  tags: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 8,
    marginTop: 14,
  },
  tag: {
    borderRadius: 999,
    background: "white",
    padding: "7px 10px",
    fontSize: 13,
    fontWeight: 800,
    color: "#475569",
  },
  kitBox: {
    marginTop: 14,
    border: "1px solid #e5e7eb",
    borderRadius: 24,
    padding: 18,
  },
  createButton: {
    width: "100%",
    marginTop: 14,
    border: 0,
    borderRadius: 999,
    padding: 14,
    background: "#111827",
    color: "white",
    fontWeight: 900,
    fontSize: 15,
  },
  readyBox: {
    marginTop: 14,
    borderRadius: 18,
    background: "#dcfce7",
    color: "#166534",
    padding: 14,
    fontWeight: 900,
  },
  footer: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
    paddingTop: 14,
  },
  skipButton: {
    border: 0,
    borderRadius: 999,
    background: "white",
    color: "#ef4444",
    padding: 18,
    fontWeight: 900,
    fontSize: 16,
  },
  interestedButton: {
    border: 0,
    borderRadius: 999,
    background: "#22c55e",
    color: "white",
    padding: 18,
    fontWeight: 900,
    fontSize: 16,
  },
};
