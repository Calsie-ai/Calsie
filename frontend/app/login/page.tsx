"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabase } from "../../lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleAuth() {
    setLoading(true);
    setMessage("");

    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
            },
          },
        });

        if (error) throw error;

        if (!data.session) {
          setMessage("Account created. Please check your email to confirm your account, then log in.");
          setMode("login");
          return;
        }

        router.push("/profile");
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      router.push("/profile");
    } catch (error: any) {
      setMessage(error.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={styles.main}>
      <section style={styles.card}>
        <Link href="/" style={styles.backLink}>← Home</Link>
        <p style={styles.badge}>Applix account</p>
        <h1 style={styles.title}>{mode === "login" ? "Welcome back." : "Create your account."}</h1>
        <p style={styles.subtitle}>Log in to save your resume profile, job matches, and application kits.</p>

        <div style={styles.tabs}>
          <button onClick={() => setMode("login")} style={mode === "login" ? styles.activeTab : styles.tab}>Login</button>
          <button onClick={() => setMode("signup")} style={mode === "signup" ? styles.activeTab : styles.tab}>Sign up</button>
        </div>

        <div style={styles.form}>
          {mode === "signup" && (
            <label style={styles.field}>
              Full name
              <input style={styles.input} value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Your full name" />
            </label>
          )}

          <label style={styles.field}>
            Email
            <input style={styles.input} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" type="email" />
          </label>

          <label style={styles.field}>
            Password
            <input style={styles.input} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Minimum 6 characters" type="password" />
          </label>

          <button disabled={loading} onClick={handleAuth} style={styles.primaryButton}>
            {loading ? "Please wait..." : mode === "login" ? "Login" : "Create account"}
          </button>

          {message && <p style={message.includes("created") ? styles.successMessage : styles.message}>{message}</p>}
        </div>
      </section>
    </main>
  );
}

const styles = {
  main: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #0f172a 0%, #111827 55%, #312e81 100%)",
    color: "white",
    fontFamily: "Arial, Helvetica, sans-serif",
    padding: 24,
  },
  card: {
    maxWidth: 520,
    margin: "0 auto",
    background: "white",
    color: "#111827",
    borderRadius: 30,
    padding: 28,
    boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
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
    background: "#eef2ff",
    color: "#4338ca",
    fontWeight: 900,
  },
  title: {
    margin: "18px 0 12px",
    fontSize: 42,
    lineHeight: 1,
    letterSpacing: -1,
  },
  subtitle: {
    color: "#64748b",
    lineHeight: 1.6,
  },
  tabs: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
    marginTop: 24,
  },
  tab: {
    border: "1px solid #e5e7eb",
    background: "white",
    borderRadius: 999,
    padding: 13,
    fontWeight: 900,
    cursor: "pointer",
  },
  activeTab: {
    border: 0,
    background: "#111827",
    color: "white",
    borderRadius: 999,
    padding: 13,
    fontWeight: 900,
    cursor: "pointer",
  },
  form: {
    display: "grid",
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
    border: 0,
    borderRadius: 999,
    background: "#111827",
    color: "white",
    padding: 15,
    fontWeight: 900,
    fontSize: 16,
    cursor: "pointer",
  },
  message: {
    color: "#dc2626",
    lineHeight: 1.5,
  },
  successMessage: {
    color: "#166534",
    background: "#dcfce7",
    padding: 12,
    borderRadius: 14,
    lineHeight: 1.5,
    fontWeight: 800,
  },
};
