"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "../providers/AuthProvider";
import { getSupabaseClient } from "../../lib/supabaseClient";
import { safeInternalPath } from "../../lib/navigation";

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status, refresh } = useAuth();
  const exchangeStarted = useRef(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [recoveryError, setRecoveryError] = useState("");
  const [exchangePending, setExchangePending] = useState(() => Boolean(searchParams.get("code")));
  const nextPath = safeInternalPath(searchParams.get("next"));

  useEffect(() => {
    const code = searchParams.get("code");
    if (!code || exchangeStarted.current) return;
    exchangeStarted.current = true;

    void getSupabaseClient().auth.exchangeCodeForSession(code)
      .then(({ error }) => {
        if (error) throw error;
        return refresh();
      })
      .catch((error) => {
        setRecoveryError(error instanceof Error ? error.message : "This password reset link is invalid or expired.");
      })
      .finally(() => {
        setExchangePending(false);
      });
  }, [refresh, searchParams]);

  async function updatePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    if (password.length < 8) {
      setMessage("Use at least 8 characters for your new password.");
      return;
    }
    if (password !== confirmation) {
      setMessage("The passwords do not match.");
      return;
    }

    setSaving(true);
    setMessage("");
    try {
      const { error } = await getSupabaseClient().auth.updateUser({ password });
      if (error) throw error;
      setMessage("Password updated. Returning you to Applix…");
      router.replace(nextPath);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update your password.");
      setSaving(false);
    }
  }

  const waitingForSession = status === "loading" || exchangePending;

  return (
    <main style={styles.main}>
      <section style={styles.card}>
        <Link href="/login" style={styles.backLink}>← Back to login</Link>
        <p style={styles.badge}>Applix account</p>
        <h1 style={styles.title}>Choose a new password.</h1>

        {recoveryError || (status === "unauthenticated" && !exchangePending) ? (
          <div role="alert" style={styles.error}>
            <p>{recoveryError || "This password reset link is invalid or expired."}</p>
            <Link href={`/login?next=${encodeURIComponent(nextPath)}`}>Request a new reset link</Link>
          </div>
        ) : waitingForSession ? (
          <p role="status" aria-live="polite" style={styles.subtitle}>Checking your secure reset link…</p>
        ) : (
          <form onSubmit={updatePassword} style={styles.form}>
            <label style={styles.field}>
              New password
              <input
                autoComplete="new-password"
                disabled={saving}
                minLength={8}
                onChange={(event) => setPassword(event.target.value)}
                required
                style={styles.input}
                type="password"
                value={password}
              />
            </label>
            <label style={styles.field}>
              Confirm new password
              <input
                autoComplete="new-password"
                disabled={saving}
                minLength={8}
                onChange={(event) => setConfirmation(event.target.value)}
                required
                style={styles.input}
                type="password"
                value={confirmation}
              />
            </label>
            <button disabled={saving} style={saving ? styles.loadingButton : styles.primaryButton} type="submit">
              {saving ? "Updating password…" : "Update password"}
            </button>
            {message ? <p aria-live="polite" role="status" style={styles.message}>{message}</p> : null}
          </form>
        )}
      </section>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<main style={styles.main}><section style={styles.card}>Checking your secure reset link…</section></main>}>
      <ResetPasswordContent />
    </Suspense>
  );
}

const styles = {
  main: { minHeight: "100vh", background: "linear-gradient(135deg, #0f172a 0%, #111827 55%, #312e81 100%)", color: "white", fontFamily: "Arial, Helvetica, sans-serif", padding: 24 },
  card: { maxWidth: 520, margin: "0 auto", background: "white", color: "#111827", borderRadius: 30, padding: 28, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" },
  backLink: { color: "#111827", textDecoration: "none", fontWeight: 900 },
  badge: { display: "inline-block", marginTop: 34, padding: "8px 12px", borderRadius: 999, background: "#eef2ff", color: "#4338ca", fontWeight: 900 },
  title: { margin: "18px 0 12px", fontSize: 42, lineHeight: 1, letterSpacing: -1 },
  subtitle: { color: "#64748b", lineHeight: 1.6 },
  form: { display: "grid", gap: 14, marginTop: 22 },
  field: { display: "grid", gap: 8, color: "#334155", fontWeight: 900 },
  input: { border: "1px solid #e5e7eb", borderRadius: 16, padding: 14, fontSize: 16 },
  primaryButton: { border: 0, borderRadius: 999, background: "#111827", color: "white", padding: 15, fontWeight: 900, fontSize: 16, cursor: "pointer" },
  loadingButton: { border: 0, borderRadius: 999, background: "#334155", color: "white", padding: 15, fontWeight: 900, fontSize: 16, cursor: "wait" },
  message: { color: "#334155", lineHeight: 1.5, margin: 0, fontWeight: 800 },
  error: { color: "#991b1b", background: "#fee2e2", padding: 16, borderRadius: 14, lineHeight: 1.5, fontWeight: 800 },
};

