"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { getSupabaseClient } from "../lib/supabaseClient";

const pink = "#ff5ca8";
const ink = "#16131a";

export default function HomePage() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
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

  const sectionStyle = {
    position: "relative" as const,
    zIndex: 2,
    minHeight: "100svh",
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center" as const,
    width: "100%",
    padding: "clamp(34px, 9vw, 78px) clamp(18px, 6vw, 42px)",
  };

  const labelStyle = {
    margin: "0 0 10px",
    color: ink,
    fontSize: "clamp(8px, 2.4vw, 10px)",
    fontWeight: 900,
    letterSpacing: ".18em",
    textTransform: "uppercase" as const,
  };

  const copyStyle = {
    width: "min(280px, 100%)",
    margin: "0 auto 24px",
    color: ink,
    fontSize: "clamp(8px, 2.15vw, 10px)",
    lineHeight: 1.25,
    fontWeight: 900,
    letterSpacing: ".1em",
    textTransform: "uppercase" as const,
  };

  const inputStyle = {
    minHeight: 40,
    width: "100%",
    border: "1px solid transparent",
    borderRadius: 999,
    padding: "10px 14px",
    background: "#4c4c4f",
    color: "white",
    outline: 0,
    textAlign: "center" as const,
    fontSize: "clamp(11px, 3vw, 13px)",
    fontWeight: 800,
    boxShadow: "0 10px 24px rgba(0,0,0,.16)",
  };

  return (
    <main
      style={{
        position: "relative",
        minHeight: "100svh",
        overflowX: "hidden",
        backgroundColor: "#fff7fb",
        color: ink,
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
          inset: 0,
          background:
            "radial-gradient(circle at 50% 24%, rgba(255,255,255,.94), rgba(255,255,255,.72) 31%, transparent 62%)",
          pointerEvents: "none",
        }}
      />

      {header}

      <section
        style={{
          ...sectionStyle,
          minHeight: "calc(100svh - 54px)",
          paddingTop: "clamp(8px, 3vw, 18px)",
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
            color: pink,
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
            margin: "clamp(6px, 2vw, 8px) 0 clamp(18px, 5vw, 28px)",
            color: ink,
            fontSize: "clamp(8px, 2.8vw, 10px)",
            lineHeight: 1.2,
            fontWeight: 900,
            letterSpacing: "clamp(.08em, 1vw, .18em)",
            textTransform: "uppercase",
          }}
        >
          Persistence at Scale
        </p>

        <p style={copyStyle}>
          APPLIX IS FIRST SYMBIOTIC INTELLIGENCE AI, APPLIX IS EMAIL AUTOMATION SYMBIOTE THAT HAS 20 LAYERS OF COGNITIVE CAPACITY, FOR STRAIGHT FORWARD USE PLEASE FOLLOW THE GUARD RAILS.
        </p>
      </section>

      <section style={sectionStyle}>
        <p style={labelStyle}>WELCOME</p>
        <h2
          style={{
            margin: "0 0 8px",
            color: ink,
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
            color: pink,
            fontSize: "clamp(22px, 8vw, 36px)",
            lineHeight: .92,
            fontWeight: 950,
            letterSpacing: ".14em",
            textTransform: "uppercase",
          }}
        >
          ABOUT APPLIX
        </h3>

        <div
          style={{
            display: "grid",
            gap: 10,
            justifyItems: "center",
            color: ink,
            fontSize: "clamp(10px, 3.3vw, 14px)",
            lineHeight: 1.05,
            fontWeight: 950,
            letterSpacing: ".08em",
            textTransform: "uppercase",
          }}
        >
          <p style={{ margin: 0 }}>HOST <span style={{ color: pink }}>| GMAIL</span></p>
          <p style={{ margin: 0 }}>SPAN <span style={{ color: pink }}>| 30 DAYS</span></p>
          <p style={{ margin: 0 }}>DATA <span style={{ color: "#58b7ee" }}>| INDEED</span></p>
          <p style={{ margin: 0 }}>TASK <span>| 25/DAY</span></p>
        </div>
      </section>

      <section style={{ ...sectionStyle, gap: 12 }}>
        {checkingSession && (
          <p style={{ margin: 0, fontSize: "clamp(10px, 3vw, 13px)", fontWeight: 800 }}>
            Checking your login...
          </p>
        )}

        {!checkingSession && signedInEmail && (
          <Link
            href="/dashboard"
            style={{
              minHeight: 40,
              width: "min(260px, calc(100vw - 20px))",
              borderRadius: 999,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "9px 12px",
              background: pink,
              color: ink,
              fontSize: "clamp(10px, 3.2vw, 13px)",
              lineHeight: 1.1,
              fontWeight: 900,
              boxShadow: "0 10px 22px rgba(255, 92, 168, .35)",
            }}
          >
            Go to dashboard
          </Link>
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
            <label style={{ display: "grid", gap: 7 }}>
              <span style={labelStyle}>Enter your email</span>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Enter your email"
                autoComplete="email"
                disabled={loading || magicLinkSent}
                required
                style={inputStyle}
              />
            </label>

            <label style={{ display: "grid", gap: 7 }}>
              <span style={labelStyle}>Your Name</span>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Your Name"
                autoComplete="name"
                disabled={loading || magicLinkSent}
                style={inputStyle}
              />
            </label>

            <button
              type="submit"
              disabled={loading || magicLinkSent}
              style={{
                minHeight: 40,
                border: 0,
                borderRadius: 999,
                padding: "9px 12px",
                background: pink,
                color: ink,
                fontSize: "clamp(10px, 3.2vw, 13px)",
                lineHeight: 1.1,
                fontWeight: 900,
                boxShadow: "0 10px 22px rgba(255, 92, 168, .35)",
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
              margin: "4px 0 0",
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

      <section style={sectionStyle}>
        <h2 style={{ ...labelStyle, marginBottom: 20 }}>HOW TO USE APPLIX</h2>
        <p style={copyStyle}>
          DONT USE YOUR PERSONAL EMAIL, CREATE NEW GMAIL ONLY FOR APPLIX, SO APPLIX CAN USE IT ON YOUR BEHALF.
        </p>
        <h3 style={{ ...labelStyle, color: pink }}>EXPLAIN THIS</h3>
        <p style={copyStyle}>
          ENTER YOUR NAME, THIS WILL BE USED BY APPLIX TO ADRESS YOU WHEN APPLIX IS EXECUTING TASK
        </p>
        <h3 style={{ ...labelStyle, color: pink }}>EXPLAIN THIS</h3>
      </section>

      <section style={sectionStyle}>
        <h2 style={{ ...labelStyle, color: pink, marginBottom: 18 }}>Upload Your CV</h2>
        <p style={copyStyle}>
          UPLOAD YOUR RESUME/CV, APPLIX WILL ATTACH YOUR DOCUMENTSTO EVERY COMPANY IT CONTACTS PLEASE NO PERSONAL INFORMATION / CREDITS ON YOUR DOCUMENTS KEEP IT GENRAL AS MUCH AS YOU CAN
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={{ ...labelStyle, color: pink, marginBottom: 18 }}>Fill Up Template</h2>
        <p style={copyStyle}>
          Browse Template :
          <br />
          Example:
          <br />
          Business Analyst
          <br />
          Support Worker,AIN, AgeCare, IT Support, Internship.
          <br />
          or Start With Standard Form By Applix
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={{ ...labelStyle, marginBottom: 24 }}>HOW TO SET UP GUARD RAILS</h2>
        <h3 style={{ ...labelStyle, color: pink }}>Authorize Applix</h3>
        <p style={copyStyle}>
          CONNECT YOUR APPLIX TO YOUR GMAIL ACCOUNT CREATED FOR APPLIX USE ONLY. ALLOW TO SEND ON EMAIL ON BEHALF
        </p>
        <h3 style={{ ...labelStyle, color: pink }}>Run Applix</h3>
        <p style={copyStyle}>
          APPLIX WILL BE ACTIVATED FOR 30 DAYS, EXECUTE TASK 1/HR. KEEP YOUR ACCOUNT LOGGED IN, YOU CAN CLOSE THE BROWSER
        </p>
        <button
          type="button"
          style={{
            minHeight: 44,
            minWidth: 170,
            border: 0,
            borderRadius: 999,
            padding: "11px 18px",
            background: pink,
            color: "white",
            fontSize: "clamp(11px, 3.2vw, 14px)",
            lineHeight: 1.1,
            fontWeight: 950,
            boxShadow: "0 10px 22px rgba(255, 92, 168, .35)",
          }}
        >
          Get magic link
        </button>
        <p style={{ ...copyStyle, marginTop: 18, marginBottom: 0 }}>
          WATCH THE VIDEO TO GET ACESS
        </p>
      </section>
    </main>
  );
}
