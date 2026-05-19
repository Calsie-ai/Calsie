"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

type FetchResult = {
  ok?: boolean;
  query?: string;
  location?: string;
  country?: string;
  jobs_found?: number;
  jobs_inserted?: number;
  error?: string;
};

export default function AdzunaTestPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState("support worker");
  const [location, setLocation] = useState("Sydney");
  const [country, setCountry] = useState("au");
  const [maxResults, setMaxResults] = useState(50);
  const [result, setResult] = useState<FetchResult | null>(null);
  const [jobsCount, setJobsCount] = useState<number | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function checkUser() {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.push("/login");
        return;
      }
      setChecking(false);
      await refreshJobsCount();
    }

    checkUser();
  }, [router]);

  async function refreshJobsCount() {
    const { count, error } = await supabase
      .from("jobs")
      .select("id", { count: "exact", head: true });

    if (!error) setJobsCount(count || 0);
  }

  async function fetchJobs() {
    setLoading(true);
    setMessage("");
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke("fetch-adzuna-jobs", {
        body: {
          desired_role: role,
          location,
          country,
          radius_km: 50,
          max_results: maxResults,
        },
      });

      if (error) throw error;
      setResult(data as FetchResult);
      await refreshJobsCount();
      setMessage("Adzuna fetch completed. Check the jobs count below.");
    } catch (error: any) {
      setMessage(error.message || "Could not fetch Adzuna jobs.");
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return <main style={styles.main}>Checking login...</main>;
  }

  return (
    <main style={styles.main}>
      <section style={styles.card}>
        <Link href="/" style={styles.backLink}>← Home</Link>
        <p style={styles.badge}>Adzuna test</p>
        <h1 style={styles.title}>Fetch real jobs into Supabase.</h1>
        <p style={styles.subtitle}>
          This test uses your logged-in Supabase session to call the protected Edge Function. It pulls jobs from Adzuna and stores them in the jobs table.
        </p>

        <div style={styles.grid}>
          <label style={styles.field}>
            Desired role
            <input style={styles.input} value={role} onChange={(event) => setRole(event.target.value)} />
          </label>

          <label style={styles.field}>
            Location
            <input style={styles.input} value={location} onChange={(event) => setLocation(event.target.value)} />
          </label>

          <label style={styles.field}>
            Country
            <input style={styles.input} value={country} onChange={(event) => setCountry(event.target.value)} />
          </label>

          <label style={styles.field}>
            Max results
            <input style={styles.input} type="number" value={maxResults} onChange={(event) => setMaxResults(Number(event.target.value))} />
          </label>
        </div>

        <button onClick={fetchJobs} disabled={loading} style={styles.primaryButton}>
          {loading ? "Fetching jobs..." : "Fetch Adzuna Jobs"}
        </button>

        <div style={styles.statusBox}>
          <p><strong>Jobs currently in Supabase:</strong> {jobsCount ?? "Loading..."}</p>
          {message && <p style={message.includes("completed") ? styles.success : styles.error}>{message}</p>}
        </div>

        {result && (
          <pre style={styles.pre}>{JSON.stringify(result, null, 2)}</pre>
        )}

        <div style={styles.actions}>
          <Link href="/matching" style={styles.secondaryButton}>Go to matching</Link>
          <button onClick={refreshJobsCount} style={styles.secondaryButton}>Refresh count</button>
        </div>
      </section>
    </main>
  );
}

const styles = {
  main: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #ecfeff 0%, #f8fafc 50%, #fef3c7 100%)",
    fontFamily: "Arial, Helvetica, sans-serif",
    padding: 24,
    color: "#111827",
  },
  card: {
    maxWidth: 820,
    margin: "0 auto",
    background: "white",
    borderRadius: 30,
    padding: 28,
    boxShadow: "0 20px 60px rgba(15,23,42,0.08)",
  },
  backLink: {
    color: "#111827",
    textDecoration: "none",
    fontWeight: 900,
  },
  badge: {
    display: "inline-block",
    marginTop: 34,
    padding: "8px 12px",
    borderRadius: 999,
    background: "#dcfce7",
    color: "#166534",
    fontWeight: 900,
  },
  title: {
    margin: "18px 0 12px",
    fontSize: "clamp(36px, 7vw, 60px)",
    lineHeight: 1,
    letterSpacing: -2,
  },
  subtitle: {
    color: "#64748b",
    lineHeight: 1.7,
    fontSize: 18,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 14,
    marginTop: 22,
  },
  field: {
    display: "grid",
    gap: 8,
    color: "#334155",
    fontWeight: 900,
  },
  input: {
    border: "1px solid #e5e7eb",
    borderRadius: 16,
    padding: 14,
    fontSize: 16,
  },
  primaryButton: {
    width: "100%",
    marginTop: 20,
    border: 0,
    borderRadius: 999,
    background: "#111827",
    color: "white",
    padding: 15,
    fontWeight: 900,
    fontSize: 16,
    cursor: "pointer",
  },
  statusBox: {
    marginTop: 18,
    padding: 16,
    borderRadius: 20,
    background: "#f8fafc",
    border: "1px solid #e5e7eb",
  },
  success: {
    color: "#166534",
    fontWeight: 900,
  },
  error: {
    color: "#dc2626",
    fontWeight: 900,
  },
  pre: {
    marginTop: 16,
    background: "#111827",
    color: "white",
    padding: 16,
    borderRadius: 16,
    overflowX: "auto" as const,
  },
  actions: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap" as const,
    marginTop: 18,
  },
  secondaryButton: {
    borderRadius: 999,
    background: "white",
    color: "#111827",
    border: "1px solid #e5e7eb",
    padding: "13px 16px",
    fontWeight: 900,
    textDecoration: "none",
    cursor: "pointer",
  },
};
