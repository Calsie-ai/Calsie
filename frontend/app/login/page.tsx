"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { supabase } from "../../lib/supabaseClient";

function withTimeout<T>(promise: Promise<T>, milliseconds = 12000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error("Login is taking too long. Check your internet connection and Supabase settings, then try again."));
    }, milliseconds);

    promise
      .then((value) => resolve(value))
      .catch((error) => reject(error))
      .finally(() => window.clearTimeout(timer));
  });
}

function cleanEmail(value: string) {
  return value.trim().toLowerCase();
}

function safeNextPath(value: string | null) {
  if (!value) return "/dashboard";
  if (!value.startsWith("/")) return "/dashboard";
  if (value.startsWith("//")) return "/dashboard";
  if (value.includes("http://") || value.includes("https://")) return "/dashboard";
  return value;
}

function friendlyAuthError(error: any) {
  const raw = String(error?.message || "").toLowerCase();

  if (raw.includes("invalid login credentials")) {
    return "Wrong email or password. If you forgot it, use Reset password below.";
  }

  if (raw.includes("email not confirmed") || raw.includes("confirm")) {
    return "Your email is not confirmed yet. Check your inbox for the confirmation email before logging in.";
  }

  if (raw.includes("invalid path specified")) {
    return "The login redirect path was invalid. Refresh this page and try again.";
  }

  if (raw.includes("fetch") || raw.includes("network") || raw.includes("timeout")) {
    return "Applix could not reach the login server. Check internet connection or Supabase environment settings.";
  }

  return error?.message || "Login failed. Please check your details and try again.";
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = safeNextPath(searchParams.get("next"));
  const [mode, setMode] = useState<"login" | "signup" | "reset">("login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handlePasswordReset() {
    if (loading) return;

    const authEmail = cleanEmail(email);
    if (!authEmail || !authEmail.includes("@")) {
      setMessage("Enter your full email address first, then Applix can send a reset link.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const redirectTo = `${window.location.origin}/reset-password?next=${encodeURIComponent(nextPath)}`;
      const { error } = await withTimeout(
        supabase.auth.resetPasswordForEmail(authEmail, { redirectTo })
      );

      if (error) throw error;
      setMessage("Password reset link sent. Check your email, then open the link to choose a new password.");
    } catch (error: any) {
      setMessage(friendlyAuthError(error));
    } finally {
      setLoading(false);
    }
  }

  async function handleAuth() {
    if (loading) return;

    if (mode === "reset") {
      await handlePasswordReset();
      return;
    }

    const authEmail = cleanEmail(email);
    const authPassword = password.trim();

    if (!authEmail || !authEmail.includes("@")) {
      setMessage("Enter your full email address, for example name@gmail.com.");
      return;
    }

    if (authPassword.length < 6) {
      setMessage("Password must be at least 6 characters. If you forgot it, press Reset password.");
      return;
    }

    if (mode === "signup" && !fullName.trim()) {
      setMessage("Enter your full name before creating an account.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      if (mode === "signup") {
        const redirectTo = `${window.location.origin}/login?next=${encodeURIComponent(nextPath)}`;

        const { data, error } = await withTimeout(
          supabase.auth.signUp({
            email: authEmail,
            password: authPassword,
            options: {
              emailRedirectTo: redirectTo,
              data: {
                full_name: fullName.trim(),
              },
            },
          })
        );

        if (error) throw error;

        if (!data.session) {
          setMessage("Account created. Please check your email to confirm your account, then log in.");
          setMode("login");
          setLoading(false);
          return;
        }

        setMessage("Account ready. Opening Applix...");
        router.push(nextPath);
        return;
      }

      const { error } = await withTimeout(
        supabase.auth.signInWithPassword({ email: authEmail, password: authPassword })
      );

      if (error) throw error;
      setMessage("Login successful. Opening Applix...");
      router.push(nextPath);
    } catch (error: any) {
      setMessage(friendlyAuthError(error));
      setLoading(false);
    }
  }

  return (
    <main style={styles.main}>
      <section style={styles.card}>
        <Link href="/" style={styles.backLink}>← Home</Link>
        <p style={styles.badge}>Applix account</p>
        <h1 style={styles.title}>{mode === "signup" ? "Create your account." : mode === "reset" ? "Reset password." : "Welcome back."}</h1>
        <p style={styles.subtitle}>{mode === "reset" ? "Enter your email and Applix will send a password reset link." : "Log in to save your resume profile, job matches, and application kits."}</p>

        <div style={styles.tabs}>
          <button disabled={loading} onClick={() => { setMode("login"); setMessage(""); }} style={mode === "login" ? styles.activeTab : styles.tab}>Login</button>
          <button disabled={loading} onClick={() => { setMode("signup"); setMessage(""); }} style={mode === "signup" ? styles.activeTab : styles.tab}>Sign up</button>
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
            <input style={styles.input} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" type="email" autoComplete="email" />
          </label>

          {mode !== "reset" && (
            <label style={styles.field}>
              Password
              <input style={styles.input} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Minimum 6 characters" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} />
            </label>
          )}

          <button disabled={loading} onClick={handleAuth} style={loading ? styles.loadingButton : styles.primaryButton}>
            {loading ? "Please wait..." : mode === "login" ? "Login" : mode === "signup" ? "Create account" : "Send reset link"}
          </button>

          {mode === "login" && (
            <button type="button" disabled={loading} onClick={() => { setMode("reset"); setMessage(""); }} style={styles.textButton}>
              Forgot password? Reset it
            </button>
          )}

          {mode === "reset" && (
            <button type="button" disabled={loading} onClick={() => { setMode("login"); setMessage(""); }} style={styles.textButton}>
              Back to login
            </button>
          )}

          {loading && <p style={styles.helpText}>This should only take a few seconds.</p>}
          {message && <p style={message.includes("created") || message.includes("successful") || message.includes("Opening") || message.includes("ready") || message.includes("reset link sent") ? styles.successMessage : styles.message}>{message}</p>}
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
  loadingButton: {
    border: 0,
    borderRadius: 999,
    background: "#334155",
    color: "white",
    padding: 15,
    fontWeight: 900,
    fontSize: 16,
    cursor: "wait",
  },
  textButton: {
    border: 0,
    background: "transparent",
    color: "#4338ca",
    fontWeight: 900,
    cursor: "pointer",
    padding: 4,
    textAlign: "center" as const,
  },
  helpText: {
    color: "#64748b",
    lineHeight: 1.5,
    margin: 0,
    fontWeight: 700,
  },
  message: {
    color: "#dc2626",
    lineHeight: 1.5,
    margin: 0,
    fontWeight: 800,
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
