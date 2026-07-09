"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabaseClient } from "../lib/supabaseClient";

const pink = "#ff5ca8";
const ink = "#16131a";

const onboardingSlides = [
  {
    title: "WHAT IS APPLIX",
    body:
      "APPLIX IS FIRST SYMBIOTIC INTELLIGENCE AI. IT IS AN EMAIL AUTOMATION SYMBIOTE BUILT TO HELP YOU CONTACT EMPLOYERS IN A CONTROLLED WAY.",
  },
  {
    title: "WHAT DOES IT DO",
    body:
      "APPLIX CAN USE YOUR DETAILS, YOUR CV, AND YOUR SELECTED TEMPLATE TO PREPARE AND SEND JOB CONTACT EMAILS ON YOUR BEHALF.",
  },
  {
    title: "HOW TO CONNECT THE APP",
    body:
      "CREATE A NEW GMAIL ONLY FOR APPLIX. DO NOT USE YOUR PERSONAL EMAIL. AUTHORIZE APPLIX WITH THAT GMAIL ACCOUNT ONLY.",
  },
  {
    title: "HOW IT WORKS",
    body:
      "APPLIX RUNS WITH GUARD RAILS. IT CAN EXECUTE TASKS OVER 30 DAYS, CONTACT COMPANIES, AND USE YOUR DOCUMENTS AND TEMPLATE AS INSTRUCTIONS.",
  },
  {
    title: "TERMS AND CONDITIONS",
    body:
      "BY CONTINUING, YOU UNDERSTAND THIS IS A DRAFT TEST FLOW. YOU ARE RESPONSIBLE FOR YOUR EMAIL ACCOUNT, YOUR CV, YOUR DETAILS, AND THE INSTRUCTIONS YOU GIVE APPLIX.",
  },
];

export default function HomePage() {
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [signedInEmail, setSignedInEmail] = useState("");
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [carouselComplete, setCarouselComplete] = useState(false);

  useEffect(() => {
    async function checkSession() {
      try {
        const supabase = getSupabaseClient();
        const { data } = await supabase.auth.getUser();

        if (data.user) {
          setSignedInEmail(data.user.email || "");
        }
      } catch {
        // Keep Google login available if Supabase is not configured yet.
      } finally {
        setCheckingSession(false);
      }
    }

    checkSession();
  }, []);

  async function signOut() {
    try {
      const supabase = getSupabaseClient();
      await supabase.auth.signOut();
      setSignedInEmail("");
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not log out.");
    }
  }

  function confirmSlide() {
    if (carouselIndex < onboardingSlides.length - 1) {
      setCarouselIndex((current) => current + 1);
      return;
    }

    setCarouselComplete(true);
  }

  async function loginWithGoogle() {
    if (!carouselComplete || loading) return;

    setStatus("");
    setLoading(true);

    try {
      const supabase = getSupabaseClient();
      const redirectTo = `${window.location.origin}/auth/callback?next=/dashboard`;

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
        },
      });

      if (error) {
        setStatus(error.message);
        setLoading(false);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not continue with Google.");
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
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center" as const,
    width: "100%",
    padding: "clamp(16px, 3vw, 28px) clamp(18px, 6vw, 42px)",
  };

  const labelStyle = {
    margin: "0 0 10px",
    color: ink,
    fontSize: "clamp(8px, 2.4vw, 10px)",
    fontWeight: 900,
    letterSpacing: ".18em",
    textTransform: "uppercase" as const,
  };

  const sectionHeadingStyle = {
    ...labelStyle,
    color: pink,
    fontSize: "clamp(10px, 3.3vw, 14px)",
  };

  const copyStyle = {
    width: "min(280px, 100%)",
    margin: "0 auto 14px",
    color: ink,
    fontSize: "clamp(8px, 2.15vw, 10px)",
    lineHeight: 1.25,
    fontWeight: 900,
    letterSpacing: ".1em",
    textTransform: "uppercase" as const,
  };

  const fineDividerStyle = {
    position: "relative" as const,
    zIndex: 2,
    width: "min(340px, calc(100vw - 52px))",
    height: 1,
    margin: "clamp(6px, 2vw, 12px) auto",
    background: "linear-gradient(90deg, transparent, rgba(255, 92, 168, .72), transparent)",
  };

  const primaryButtonStyle = {
    minHeight: 40,
    minWidth: 170,
    border: 0,
    borderRadius: 999,
    padding: "9px 18px",
    background: pink,
    color: ink,
    fontSize: "clamp(10px, 3.2vw, 13px)",
    lineHeight: 1.1,
    fontWeight: 900,
    boxShadow: "0 10px 22px rgba(255, 92, 168, .35)",
  };

  const lockedButtonStyle = {
    ...primaryButtonStyle,
    background: "#4c4c4f",
    color: "rgba(255,255,255,.7)",
    boxShadow: "0 10px 22px rgba(0,0,0,.14)",
  };

  const activeSlide = onboardingSlides[carouselIndex];

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
          inset: "-12% -35% -20%",
          backgroundImage:
            "linear-gradient(rgba(20, 16, 22, .34) 1px, transparent 1px), linear-gradient(90deg, rgba(20, 16, 22, .34) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          transform: "perspective(760px) rotateX(22deg) scale(1.08)",
          transformOrigin: "top center",
          opacity: 0.34,
          pointerEvents: "none",
          WebkitMaskImage:
            "linear-gradient(to right, transparent 0%, rgba(0,0,0,.88) 16%, rgba(0,0,0,.88) 84%, transparent 100%)",
          maskImage:
            "linear-gradient(to right, transparent 0%, rgba(0,0,0,.88) 16%, rgba(0,0,0,.88) 84%, transparent 100%)",
        }}
      />

      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          background:
            "radial-gradient(circle at 50% 24%, rgba(255,255,255,.9), rgba(255,255,255,.66) 31%, transparent 62%)",
          pointerEvents: "none",
        }}
      />

      {header}

      <section
        style={{
          ...sectionStyle,
          minHeight: "auto",
          paddingTop: "clamp(8px, 2vw, 18px)",
          paddingBottom: "clamp(10px, 2vw, 22px)",
          overflow: "hidden",
        }}
      >
        <img
          src="/applix-logo.svg"
          alt="Applix logo"
          style={{
            position: "relative",
            zIndex: 1,
            width: "clamp(58px, 18vw, 126px)",
            height: "auto",
            display: "block",
            marginBottom: "clamp(8px, 2vw, 12px)",
            filter: "drop-shadow(0 12px 20px rgba(255, 92, 168, .18))",
          }}
        />

        <h1
          aria-label="APPLIX"
          style={{
            position: "relative",
            zIndex: 1,
            width: "100%",
            margin: 0,
            color: pink,
            fontSize: "clamp(52px, 10vw, 82px)",
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
            position: "relative",
            zIndex: 1,
            maxWidth: "100%",
            margin: "clamp(6px, 2vw, 8px) 0 clamp(14px, 3vw, 22px)",
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

        <p style={{ ...copyStyle, position: "relative", zIndex: 1, marginBottom: 0 }}>
          APPLIX IS FIRST SYMBIOTIC INTELLIGENCE AI, APPLIX IS EMAIL AUTOMATION SYMBIOTE THAT HAS 20 LAYERS OF COGNITIVE CAPACITY, FOR STRAIGHT FORWARD USE PLEASE FOLLOW THE GUARD RAILS.
        </p>
      </section>

      <div aria-hidden="true" style={fineDividerStyle} />

      <section style={{ ...sectionStyle, paddingTop: 8 }}>
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

      <div aria-hidden="true" style={fineDividerStyle} />

      <section style={sectionStyle}>
        <h2 style={{ ...sectionHeadingStyle, marginBottom: 20 }}>HOW TO USE APPLIX</h2>
        <p style={copyStyle}>
          DONT USE YOUR PERSONAL EMAIL, CREATE NEW GMAIL ONLY FOR APPLIX, SO APPLIX CAN USE IT ON YOUR BEHALF.
        </p>
        <p style={{ ...copyStyle, marginBottom: 0 }}>
          ENTER YOUR NAME, THIS WILL BE USED BY APPLIX TO ADRESS YOU WHEN APPLIX IS EXECUTING TASK
        </p>
      </section>

      <div aria-hidden="true" style={fineDividerStyle} />

      <section style={sectionStyle}>
        <h2 style={{ ...sectionHeadingStyle, marginBottom: 18 }}>Upload Your CV</h2>
        <p style={copyStyle}>
          UPLOAD YOUR RESUME/CV, APPLIX WILL ATTACH YOUR DOCUMENTSTO EVERY COMPANY IT CONTACTS PLEASE NO PERSONAL INFORMATION / CREDITS ON YOUR DOCUMENTS KEEP IT GENRAL AS MUCH AS YOU CAN
        </p>
      </section>

      <div aria-hidden="true" style={fineDividerStyle} />

      <section style={sectionStyle}>
        <h2 style={{ ...sectionHeadingStyle, marginBottom: 18 }}>Fill Up Template</h2>
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

      <div aria-hidden="true" style={fineDividerStyle} />

      <section style={sectionStyle}>
        <h2 style={{ ...sectionHeadingStyle, marginBottom: 24 }}>HOW TO SET UP GUARD RAILS</h2>
        <h3 style={sectionHeadingStyle}>Authorize Applix</h3>
        <p style={copyStyle}>
          CONNECT YOUR APPLIX TO YOUR GMAIL ACCOUNT CREATED FOR APPLIX USE ONLY. ALLOW TO SEND ON EMAIL ON BEHALF
        </p>
        <h3 style={sectionHeadingStyle}>Run Applix</h3>
        <p style={copyStyle}>
          APPLIX WILL BE ACTIVATED FOR 30 DAYS, EXECUTE TASK 1/HR. KEEP YOUR ACCOUNT LOGGED IN, YOU CAN CLOSE THE BROWSER
        </p>
      </section>

      <div aria-hidden="true" style={fineDividerStyle} />

      <section style={{ ...sectionStyle, gap: 14, paddingBottom: "clamp(38px, 8vw, 76px)" }}>
        <h2 style={{ ...sectionHeadingStyle, marginBottom: 2 }}>APPLIX START CHECK</h2>

        {!carouselComplete && (
          <div
            style={{
              width: "min(360px, calc(100vw - 28px))",
              display: "grid",
              gap: 12,
              justifyItems: "center",
              padding: "18px 16px",
              borderRadius: 26,
              background: "rgba(255,255,255,.42)",
              border: "1px solid rgba(22, 19, 26, .08)",
              boxShadow: "0 14px 30px rgba(0,0,0,.08)",
              backdropFilter: "blur(8px)",
            }}
          >
            <p style={{ ...sectionHeadingStyle, marginBottom: 0 }}>
              {carouselIndex + 1}/{onboardingSlides.length}
            </p>
            <h3 style={{ ...sectionHeadingStyle, marginBottom: 0 }}>{activeSlide.title}</h3>
            <p style={{ ...copyStyle, marginBottom: 0 }}>{activeSlide.body}</p>
            <button type="button" onClick={confirmSlide} style={primaryButtonStyle}>
              Yes, I understood
            </button>
          </div>
        )}

        {carouselComplete && !signedInEmail && (
          <div style={{ display: "grid", gap: 12, justifyItems: "center" }}>
            <p style={{ ...copyStyle, marginBottom: 0 }}>
              ALL START CHECKS COMPLETED. CONTINUE WITH GOOGLE TO ENTER APPLIX.
            </p>
            <button type="button" onClick={loginWithGoogle} disabled={loading} style={primaryButtonStyle}>
              {loading ? "Connecting..." : "Continue with Google"}
            </button>
          </div>
        )}

        {!carouselComplete && !signedInEmail && (
          <button type="button" disabled style={lockedButtonStyle}>
            Google login locked
          </button>
        )}

        {checkingSession && (
          <p style={{ margin: 0, fontSize: "clamp(10px, 3vw, 13px)", fontWeight: 800 }}>
            Checking your login...
          </p>
        )}

        {!checkingSession && signedInEmail && (
          <div style={{ display: "grid", gap: 10, justifyItems: "center" }}>
            <Link
              href="/dashboard"
              style={{
                ...primaryButtonStyle,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                textDecoration: "none",
              }}
            >
              Go to dashboard
            </Link>
            <button type="button" onClick={signOut} style={primaryButtonStyle}>
              Logout
            </button>
          </div>
        )}

        {status && (
          <p
            style={{
              width: "min(320px, calc(100vw - 20px))",
              margin: "4px 0 0",
              color: "#7f1d1d",
              fontSize: "clamp(10px, 3vw, 12px)",
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
