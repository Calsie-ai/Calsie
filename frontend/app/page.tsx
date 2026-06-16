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
          ? "Email rate limit reached. Wait a moment and request another magic link."
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
    <main className="applix-login-shell">
      <button className="applix-back-button" type="button" aria-label="Back">←</button>
      <div className="applix-info-button" aria-hidden="true">i</div>

      <section className="applix-login-stage">
        <div className="applix-logo-scene" aria-label="Applix logo">
          <div className="applix-orb">
            <span>APPLIX</span>
          </div>
          <div className="applix-hand">
            <span className="hand-palm" />
            <span className="hand-finger finger-one" />
            <span className="hand-finger finger-two" />
          </div>
        </div>

        <section className="applix-glass-card">
          <div className="applix-card-pill">Signup/Login</div>

          {checkingSession && <p className="applix-card-muted">Checking your login...</p>}

          {!checkingSession && signedInEmail && (
            <div className="applix-signed-in-card">
              <p className="applix-card-label">Signed in as</p>
              <p className="applix-signed-email">{signedInEmail}</p>
              <Link className="applix-magic-button" href="/dashboard">Home</Link>
            </div>
          )}

          {!checkingSession && !signedInEmail && (
            <form className="applix-magic-form" onSubmit={sendMagicLink}>
              <label htmlFor="email">Enter Your Email</label>
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
              <button className="applix-magic-button" type="submit" disabled={loading || magicLinkSent}>
                {magicLinkSent ? "Magic Link Sent" : loading ? "Sending..." : "Get Magic Link"}
              </button>
            </form>
          )}

          {status && <p className={magicLinkSent ? "applix-card-status success" : "applix-card-status"}>{status}</p>}
        </section>
      </section>
    </main>
  );
}
