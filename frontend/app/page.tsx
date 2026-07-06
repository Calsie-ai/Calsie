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

  const header = (
    <header
      style={{
        position: "relative",
        zIndex: 2,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 8,
        width: "100%",
        padding: "clamp(10px, 3vw, 18px) clamp(10px, 3.5vw, 20px)",
      }}
    >
      <div
        style={{
          maxWidth: "calc(100vw - 54px)",
          fontSize: "clamp(8px, 2.6vw, 11px)",
          lineHeight: 1.15,
          fontWeight: 900,
          letterSpacing: "clamp(.02em, .55vw, .08em)",
          textTransform: "uppercase",
          whiteSpace: "normal",
          overflowWrap: "anywhere",
        }}
      >
        CALSIE | APPLIX
      </div>

      <button
        aria-label="Open menu"
        style={{
          flexShrink: 0,
          border: 0,
          background: "transparent",
          color: "#1d1824",
          fontSize: "clamp(18px, 5vw, 22px)",
          lineHeight: 1,
          padding: 2,
        }}
      >
        ☰
      </button>
    </header>
  );

  return (
    <main
      style={{
        position: "relative",
        minHeight: "100svh",
        overflowX: "hidden",
        backgroundColor: "#fff7fb",
        color: "#16131a",
        fontFamily: "Arial, Helvetica, sans-serif",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: "-12% -35% -20%",
          backgroundImage:
            "linear-gradient(rgba(255, 70, 190, .24) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 70, 190, .24) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          transform: "perspective(760px) rotateX(22deg) scale(1.08)",
          transformOrigin: "top center",
          opacity: 0.96,
          pointerEvents: "none",
        }}
      />

      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: "-12% -35% -20%",
          backgroundImage:
            "linear-gradient(rgba(20, 16, 22, .34) 1px, transparent 1px), linear-gradient(90deg, rgba(20, 16, 22, .34) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          transform: "perspective(760px) rotateX(22deg) scale(1.08)",
          transformOrigin: "top center",
          opacity: 0.5,
          pointerEvents: "none",
          WebkitMaskImage:
            "radial-gradient(circle at 50% 31%, rgba(0,0,0,.95) 0 120px, rgba(0,0,0,.72) 150px, transparent 270px)",
          maskImage:
            "radial-gradient(circle at 50% 31%, rgba(0,0,0,.95) 0 120px, rgba(0,0,0,.72) 150px, transparent 270px)",
        }}
      />

      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          background:
            "radial-gradient(circle at 50% 24%, rgba(255,255,255,.94), rgba(255,255,255,.72) 31%, transparent 62%)",
          pointerEvents: "none",
        }}
      />

      {header}

      <section
        style={{
          position: "relative",
          zIndex: 2,
          minHeight: "calc(100svh - 54px)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          width: "100%",
          padding: "clamp(6px, 2vw, 12px) clamp(8px, 4vw, 24px) clamp(18px, 6vw, 54px)",
        }}
      >
        <img
          src="/applix-logo.svg"
          alt="Applix logo"
          style={{
            width: "clamp(58px, 28vw, 156px)",
            height: "auto",
            display: "block",
            marginBottom: "clamp(8px, 2vw, 12px)",
            filter: "drop-shadow(0 12px 20px rgba(255, 92, 168, .18))",
          }}
        />

        <h1
          aria-label="APPLIX"
          style={{
            width: "100%",
            margin: 0,
            color: "#ff5ca8",
            fontSize: "clamp(24px, 13.5vw, 72px)",
            lineHeight: 0.92,
            fontWeight: 950,
            letterSpacing: "clamp(.02em, 1vw, .1em)",
            whiteSpace: "nowrap",
          }}
        >
          APPLIX
        </h1>

        <p
          style={{
            maxWidth: "100%",
            margin: "clamp(6px, 2vw, 8px) 0 clamp(18px, 5vw, 34px)",
            color: "#222026",
            fontSize: "clamp(8px, 2.8vw, 10px)",
            lineHeight: 1.2,
            fontWeight: 900,
            letterSpacing: "clamp(.08em, 1vw, .18em)",
            textTransform: "uppercase",
          }}
        >
          Persistence at Scale
        </p>

        {checkingSession && (
          <p style={{ margin: 0, fontSize: "clamp(10px, 3vw, 13px)", fontWeight: 800 }}>
            Checking your login...
          </p>
        )}

        {!checkingSession && signedInEmail && (
          <div
            style={{
              width: "min(260px, calc(100vw - 20px))",
              display: "grid",
              justifyItems: "center",
              gap: 12,
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: "clamp(10px, 3.2vw, 13px)",
                lineHeight: 1.25,
                fontWeight: 800,
              }}
            >
              You are already signed in.
            </p>
            <Link
              href="/dashboard"
              style={{
                minHeight: 38,
                width: "100%",
                borderRadius: 999,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "9px 12px",
                background: "#ff5ca8",
                color: "#16131a",
                fontSize: "clamp(10px, 3.2vw, 13px)",
                lineHeight: 1.1,
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
              width: "min(260px, calc(100vw - 20px))",
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
                  minWidth: 0,
                  width: "100%",
                  border: 0,
                  outline: 0,
                  background: "transparent",
                  color: "white",
                  fontSize: "clamp(11px, 3vw, 13px)",
                  fontWeight: 700,
                }}
              />
            </label>

            <button
              type="submit"
              disabled={loading || magicLinkSent}
              style={{
                minHeight: 38,
                border: 0,
                borderRadius: 999,
                padding: "9px 12px",
                background: "#ff5ca8",
                color: "#16131a",
                fontSize: "clamp(10px, 3.2vw, 13px)",
                lineHeight: 1.1,
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
              width: "min(320px, calc(100vw - 20px))",
              margin: "16px 0 0",
              color: magicLinkSent ? "#22543d" : "#7f1d1d",
              fontSize: "clamp(10px, 3vw, 12px)",
              fontWeight: 800,
              lineHeight: 1.45,
            }}
          >
            {status}
          </p>
        )}
      </section>

      <section
        style={{
          position: "relative",
          zIndex: 2,
          minHeight: "100svh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "flex-start",
          textAlign: "center",
          width: "100%",
          padding: "clamp(10px, 3vw, 18px) clamp(18px, 6vw, 42px) clamp(34px, 9vw, 78px)",
          background: "rgba(255, 255, 255, .72)",
          backdropFilter: "blur(2px)",
        }}
      >
        <div
          style={{
            width: "min(420px, 100%)",
            minHeight: "100svh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <p
            style={{
              margin: "0 0 12px",
              color: "#17131c",
              fontSize: "clamp(8px, 2.4vw, 10px)",
              fontWeight: 900,
              letterSpacing: ".18em",
              textTransform: "uppercase",
            }}
          >
            Welcome
          </p>

          <h2
            style={{
              margin: "0 0 8px",
              color: "#17131c",
              fontSize: "clamp(17px, 5.6vw, 25px)",
              lineHeight: 1,
              fontWeight: 950,
              letterSpacing: ".08em",
              textTransform: "uppercase",
            }}
          >
            CALSIE | APPLIX
          </h2>

          <h3
            style={{
              margin: "0 0 18px",
              color: "#ff5ca8",
              fontSize: "clamp(22px, 8vw, 36px)",
              lineHeight: .92,
              fontWeight: 950,
              letterSpacing: ".14em",
              textTransform: "uppercase",
            }}
          >
            About Applix
          </h3>

          <p
            style={{
              width: "min(260px, 100%)",
              margin: "0 0 26px",
              color: "#17131c",
              fontSize: "clamp(7px, 2.1vw, 9px)",
              lineHeight: 1.25,
              fontWeight: 900,
              letterSpacing: ".1em",
              textTransform: "uppercase",
            }}
          >
            Applix is fast symbiotic intelligence for applying to jobs. Automation supports you that has capacity to contact hundreds of employers straight forward; please follow the guardrails.
          </p>

          <div
            style={{
              display: "grid",
              gap: 10,
              justifyItems: "center",
              color: "#17131c",
              fontSize: "clamp(10px, 3.3vw, 14px)",
              lineHeight: 1.05,
              fontWeight: 950,
              letterSpacing: ".08em",
              textTransform: "uppercase",
            }}
          >
            <p style={{ margin: 0 }}>
              HOST <span style={{ color: "#ff5ca8" }}>| GMAIL</span>
            </p>
            <p style={{ margin: 0 }}>
              SPAN <span style={{ color: "#ff5ca8" }}>| 30 DAYS</span>
            </p>
            <p style={{ margin: 0 }}>
              DATA <span style={{ color: "#58b7ee" }}>| INDEED</span>
            </p>
            <p style={{ margin: 0 }}>
              TASK <span>| 25/DAY</span>
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
