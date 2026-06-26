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
        // Keep the magic-link form visible if Supabase is not configured yet.
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
    <main className="applix-setup-shell">
      <a
        className="applix-setup-info"
        href="https://www.linkedin.com/in/sajan-giri-bb1a01221/"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Open Sajan Giri LinkedIn profile"
        title="LinkedIn"
      >
        i
      </a>

      <section className="applix-setup-center">
        <div style={{ display: "grid", placeItems: "center", marginBottom: "18px" }}>
          <img
            src="/applix-logo.svg"
            alt="Applix logo"
            style={{
              width: "clamp(280px, 46vw, 430px)",
              height: "auto",
              display: "block",
              objectFit: "contain",
              marginBottom: "-18px",
              filter: "drop-shadow(0 22px 45px rgba(0, 0, 0, .35))",
            }}
          />
          <h2
            aria-label="APPLIX"
            style={{
              margin: 0,
              fontSize: "clamp(42px, 8vw, 76px)",
              lineHeight: 0.9,
              fontWeight: 950,
              letterSpacing: "0.16em",
              color: "#ff7fa8",
              textShadow: "0 0 20px rgba(255, 80, 180, .24)",
            }}
          >
            APPLIX
          </h2>
        </div>

        <p className="applix-setup-kicker">Persistence at Scale</p>
        <h1>{signedInEmail ? "You are all set up!" : "Welcome to Applix"}</h1>
        <p className="applix-setup-copy">
          Signup, Setup, Start, and Sleep; While Applix does it.
        </p>
      </section>

      <section className="applix-setup-bottom">
        {checkingSession && <p className="applix-setup-status">Checking your login...</p>}

        {!checkingSession && signedInEmail && (
          <div className="applix-setup-actions">
            <Link className="applix-setup-primary" href="/dashboard">Home</Link>
          </div>
        )}

        {!checkingSession && !signedInEmail && (
          <form className="applix-setup-form" onSubmit={sendMagicLink}>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Enter your email"
              autoComplete="email"
              disabled={loading || magicLinkSent}
              required
            />
            <button className="applix-setup-primary" type="submit" disabled={loading || magicLinkSent}>
              {magicLinkSent ? "Magic link sent" : loading ? "Sending..." : "Get magic link"}
            </button>
          </form>
        )}

        {status && <p className={magicLinkSent ? "applix-setup-status success" : "applix-setup-status"}>{status}</p>}
      </section>
    </main>
  );
}
