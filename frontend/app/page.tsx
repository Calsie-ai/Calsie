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
  const [emailFocused, setEmailFocused] = useState(false);
  const emailActive = emailFocused || email.trim().length > 0 || magicLinkSent;

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
    <main
      style={{
        position: "relative",
        minHeight: "100vh",
        overflow: "hidden",
        backgroundColor: "#fff7fb",
        color: "#16131a",
        fontFamily: "Arial, Helvetica, sans-serif",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: "-12% -35% -20%",
          backgroundImage:
            "linear-gradient(rgba(255, 70, 190, .24) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 70, 190, .24) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          transform: "perspective(760px) rotateX(22deg) scale(1.08)",
          transformOrigin: "top center",
          opacity: 0.96,
        }}
      />

      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: "-12% -35% -20%",
          backgroundImage:
            "linear-gradient(rgba(20, 16, 22, .34) 1px, transparent 1px), linear-gradient(90deg, rgba(20, 16, 22, .34) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          transform: "perspective(760px) rotateX(22deg) scale(1.08)",
          transformOrigin: "top center",
          opacity: 0.5,
          WebkitMaskImage:
            "radial-gradient(circle at 50% 31%, rgba(0,0,0,.95) 0 120px, rgba(0,0,0,.72) 150px, transparent 270px)",
          maskImage:
            "radial-gradient(circle at 50% 31%, rgba(0,0,0,.95) 0 120px, rgba(0,0,0,.72) 150px, transparent 270px)",
        }}
      />

      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at 50% 24%, rgba(255,255,255,.94), rgba(255,255,255,.72) 31%, transparent 62%)",
          pointerEvents: "none",
        }}
      />

      <header
        style={{
          position: "relative",
          zIndex: 2,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "18px 20px",
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 900,
            letterSpacing: ".08em",
            textTransform: "uppercase",
          }}
        >
          CALSIE | APPLIX
        </div>

        <button
          aria-label="Open menu"
          style={{
            border: 0,
            background: "transparent",
            color: "#1d1824",
            fontSize: 22,
            lineHeight: 1,
            padding: 6,
          }}
        >
          ☰
        </button>
      </header>

      <section
        style={{
          position: "relative",
          zIndex: 2,
          minHeight: "calc(100vh - 70px)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "12px 24px 54px",
        }}
      >
        <img
          src="/applix-logo.svg"
          alt="Applix logo"
          style={{
            width: "clamp(112px, 34vw, 156px)",
            height: "auto",
            display: "block",
            marginBottom: 12,
            filter: "drop-shadow(0 12px 20px rgba(255, 92, 168, .18))",
          }}
        />

        <h1
          aria-label="APPLIX"
          style={{
            margin: 0,
            color: "#ff5ca8",
            fontSize: "clamp(40px, 13vw, 72px)",
            lineHeight: 0.92,
            fontWeight: 950,
            letterSpacing: ".1em",
          }}
        >
          APPLIX
        </h1>

        <p
          style={{
            margin: "8px 0 34px",
            color: "#222026",
            fontSize: 10,
            fontWeight: 900,
            letterSpacing: ".18em",
            textTransform: "uppercase",
          }}
        >
          Persistence at Scale
        </p>

        {checkingSession && (
          <p style={{ margin: 0, fontSize: 13, fontWeight: 800 }}>Checking your login...</p>
        )}

        {!checkingSession && signedInEmail && (
          <div style={{ width: "min(260px, 100%)", display: "grid", gap: 12 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 800 }}>You are already signed in.</p>
            <Link
              href="/dashboard"
              style={{
                minHeight: 38,
                borderRadius: 999,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                background: "#ff5ca8",
                color: "#16131a",
                fontSize: 13,
                fontWeight: 900,
                boxShadow: "0 10px 22px rgba(255, 92, 168, .35)",
              }}
            >
              Go to dashboard
            </Link>
          </div>
        )}

        {!checkingSession && !signedInEmail && (
          <form
            onSubmit={sendMagicLink}
            style={{
              width: "min(260px, 100%)",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <label
              style={{
                height: 40,
                borderRadius: 999,
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "0 12px",
                background: emailActive ? "#3f3f43" : "#4c4c4f",
                border: emailActive ? "1px solid rgba(255, 92, 168, .55)" : "1px solid transparent",
                boxShadow: emailActive
                  ? "0 0 0 4px rgba(255, 92, 168, .14), 0 0 28px rgba(255, 92, 168, .52), 0 12px 28px rgba(0,0,0,.18)"
                  : "0 10px 24px rgba(0,0,0,.16)",
                transition: "box-shadow .18s ease, border-color .18s ease, background .18s ease",
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 999,
                  display: "grid",
                  placeItems: "center",
                  flexShrink: 0,
                  background: "#ff5ca8",
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 900,
                  lineHeight: 1,
                  boxShadow: emailActive ? "0 0 16px rgba(255, 92, 168, .8)" : "none",
                }}
              >
                →
              </span>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                onFocus={() => setEmailFocused(true)}
                onBlur={() => setEmailFocused(false)}
                placeholder="Enter your email"
                autoComplete="email"
                disabled={loading || magicLinkSent}
                required
                style={{
                  width: "100%",
                  border: 0,
                  outline: 0,
                  background: "transparent",
                  color: "white",
                  fontSize: 13,
                  fontWeight: 700,
                }}
              />
            </label>

            <button
              type="submit"
              disabled={loading || magicLinkSent}
              style={{
                height: 38,
                border: 0,
                borderRadius: 999,
                background: "#ff5ca8",
                color: "#16131a",
                fontSize: 13,
                fontWeight: 900,
                boxShadow: emailActive
                  ? "0 0 30px rgba(255, 92, 168, .55), 0 10px 22px rgba(255, 92, 168, .35)"
                  : "0 10px 22px rgba(255, 92, 168, .35)",
                transition: "box-shadow .18s ease, transform .18s ease",
              }}
            >
              {magicLinkSent ? "Magic link sent" : loading ? "Sending..." : "Get magic link"}
            </button>
          </form>
        )}

        {status && (
          <p
            style={{
              width: "min(320px, 100%)",
              margin: "16px 0 0",
              color: magicLinkSent ? "#22543d" : "#7f1d1d",
              fontSize: 12,
              fontWeight: 800,
              lineHeight: 1.45,
            }}
          >
            {status}
          </p>
        )}
      </section>
    </main>
  );
}
