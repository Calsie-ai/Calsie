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
        setStatus(error.message);
        return;
      }

      setMagicLinkSent(true);
      setStatus("Magic link sent to your email. Please check your email.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not send magic link.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="landing-shell">
      <section className="landing-card">
        <div className="brand-mark">APPLIX</div>
        <p className="eyebrow">Symbiotic Job Hunter</p>
        <h1>Start your job campaign with a magic link.</h1>
        <p className="landing-copy">
          Sign in with your email. If you have no campaign yet, your dashboard will show a simple start button.
        </p>

        {checkingSession && <p className="muted">Checking your login...</p>}

        {!checkingSession && signedInEmail && (
          <div className="already-signed-in">
            <p className="form-status success-status">You are already signed in as {signedInEmail}.</p>
            <Link className="primary-link" href="/dashboard">Open Dashboard</Link>
          </div>
        )}

        {!checkingSession && !signedInEmail && (
          <form className={`auth-form ${magicLinkSent ? "auth-form-sent" : ""}`} onSubmit={sendMagicLink}>
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
            <button type="submit" disabled={loading || magicLinkSent}>
              {magicLinkSent ? "Magic Link Sent" : loading ? "Sending..." : "Get Magic Link"}
            </button>
          </form>
        )}

        {status && <p className={magicLinkSent ? "form-status success-status" : "form-status"}>{status}</p>}
      </section>
    </main>
  );
}
