"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { getSupabaseClient } from "../lib/supabaseClient";

export default function HomePage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [signedInEmail, setSignedInEmail] = useState("");

  useEffect(() => {
    async function checkSession() {
      try {
        const supabase = getSupabaseClient();
        const { data } = await supabase.auth.getUser();

        if (data.user) {
          setSignedInEmail(data.user.email || "");
        }
      } catch {
        // Keep the normal magic-link form visible if Supabase is not configured yet.
      } finally {
        setCheckingSession(false);
      }
    }

    checkSession();
  }, []);

  async function sendMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (magicLinkSent) return;

    setStatus("");
    setLoading(true);

    try {
      const supabase = getSupabaseClient();
      const redirectTo = `${window.location.origin}/dashboard`;

      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: redirectTo,
          shouldCreateUser: true,
        },
      });

      if (error) {
        const message = error.message.toLowerCase().includes("rate")
          ? "Email rate limit reached. If you are already signed in, open Home. Otherwise wait a moment and request another magic link."
          : error.message;

        setStatus(message);
        return;
      }

      setMagicLinkSent(true);
      setStatus("Magic link sent. Check your email to continue into Applix.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not send magic link.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="setup-shell">
      <button className="setup-back" type="button" aria-label="Back">←</button>

      <section className="setup-hero">
        <div className="setup-brand">APPLIX</div>
        <p className="setup-kicker">AI job automation</p>
        <h1>{signedInEmail ? "You're all set up!" : "Welcome to Applix"}</h1>
        <p className="setup-copy">
          Upload your resume once. Applix finds relevant jobs, writes tailored emails, attaches your resume, and tracks every step.
        </p>
      </section>

      <section className="glass-login-card">
        {checkingSession && <p className="glass-muted">Checking your login...</p>}

        {!checkingSession && signedInEmail && (
          <div className="glass-stack">
            <div className="setup-checklist">
              <span>✓ Gmail-ready automation</span>
              <span>✓ Resume workflow ready</span>
              <span>✓ Job tracker ready</span>
            </div>
            <p className="glass-muted">Signed in as {signedInEmail}</p>
            <Link className="glass-primary-button" href="/dashboard">Home</Link>
            <Link className="glass-outline-button" href="/tracker">See what's new</Link>
          </div>
        )}

        {!checkingSession && !signedInEmail && (
          <form className="glass-auth-form" onSubmit={sendMagicLink}>
            <label htmlFor="email">Enter your email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              disabled={loading || magicLinkSent}
              required
            />
            <button className="glass-primary-button" type="submit" disabled={loading || magicLinkSent}>
              {magicLinkSent ? "Magic link sent" : loading ? "Sending..." : "Get magic link"}
            </button>
            <Link className="glass-outline-button" href="/dashboard">Already signed in? Home</Link>
          </form>
        )}

        {status && <p className={magicLinkSent ? "glass-status glass-success" : "glass-status"}>{status}</p>}
      </section>
    </main>
  );
}
