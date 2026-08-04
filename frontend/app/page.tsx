"use client";

import { useState } from "react";
import { getSupabaseClient } from "../lib/supabaseClient";
import AnimatedHeroMark from "./components/AnimatedHeroMark";
import AppFooter from "./components/AppFooter";
import PricingSection from "./components/PricingSection";

const navLinks = [
  { label: "Features", href: "#features" },
  { label: "How it Works", href: "#how-it-works" },
  { label: "Pricing", href: "#pricing" },
  { label: "About", href: "#about" },
];

const stats = [
  { value: "2 min", label: "setup time" },
  { value: "24/day", label: "approved applications" },
  { value: "1/hour", label: "controlled sending" },
  { value: "720", label: "maximum over 30 days" },
];

const trustLabels = ["AI-assisted workflow", "Resume tailoring", "Human approval", "Job tracking"];

const features = [
  ["Smart Job Matching", "Find relevant roles based on your preferences, resume, and the type of work you actually want."],
  ["Tailored Resume Generation", "Create focused resume drafts for each opportunity without rebuilding your profile from scratch."],
  ["AI Email Drafting", "Generate application emails that are specific, concise, and matched to the role in front of you."],
  ["Approval Workflow", "Review, edit, and approve applications before anything gets sent on your behalf."],
  ["Application Tracking", "Keep prepared, approved, and applied jobs organized in one workflow instead of scattered tabs."],
  ["Controlled Automation", "Send no more than one approved application per hour, with a maximum of 24 per day."],
];

const steps = [
  ["Connect your profile", "Upload your resume and set the roles, locations, and preferences Calsie Jobs should use."],
  ["Review prepared applications", "Calsie Jobs prepares up to 24 opportunities per day and releases them across the day."],
  ["Approve and send", "Approve the applications you want. Calsie Jobs sends no more than one approved application each hour."],
];

const onboardingSlides = [
  ["What is Calsie Jobs", "Calsie Jobs is an AI-powered job application assistant built to help you prepare and manage job outreach in a controlled way."],
  ["What it does", "Calsie Jobs can use your details, resume, and selected instructions to prepare up to 24 job applications per day."],
  ["How to connect the app", "Create or choose the Gmail account you want Calsie Jobs to use, then authorize Calsie Jobs with that account only."],
  ["How it works", "Applications require your approval. The sending pace is limited to one approved application per hour for up to 30 days."],
  ["Terms and control", "By continuing, you understand you are responsible for your email account, resume, details, and the applications you approve."],
];

const trackerStats = [
  ["Found", "120"],
  ["Prepared", "100"],
  ["Queued", "90"],
  ["Declined", "10"],
];

const trackerRows = [
  ["Harbour Community Care", "Disability Support Worker", "Prepared", "Approve"],
  ["Northside Health Services", "Community Support Worker", "Queued", "Queued"],
  ["BrightPath Australia", "Caseworker", "Prepared", "Approve"],
  ["Civic Support Network", "Family Support Worker", "Found", "Review"],
  ["CareBridge Group", "Youth Support Worker", "Declined", "Declined"],
];

export default function HomePage() {
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [carouselComplete, setCarouselComplete] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const activeSlide = onboardingSlides[carouselIndex];

  function confirmSlide() {
    setStatus("");
    if (carouselIndex < onboardingSlides.length - 1) {
      setCarouselIndex((current) => current + 1);
      return;
    }
    setCarouselComplete(true);
  }

  async function loginWithGoogle() {
    if (loading) return;
    setStatus("");
    setLoading(true);

    try {
      const supabase = getSupabaseClient();
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent("/dashboard?panel=overview")}`;
      const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
      if (error) {
        setStatus(error.message);
        setLoading(false);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not continue with Google.");
      setLoading(false);
    }
  }

  return (
    <main className="applix-landing" id="top">
      <header className="applix-header">
        <div className="applix-container applix-header-inner">
          <a className="applix-brand" href="#top" aria-label="Calsie Jobs home">
            <img src="/applix-logo.svg" alt="Calsie Jobs Logo" />
            <span>Calsie | Jobs</span>
          </a>
          <nav className="applix-nav" aria-label="Primary navigation">
            {navLinks.map((link) => (
              <a key={link.href} href={link.href}>
                {link.label}
              </a>
            ))}
          </nav>
          <div className="applix-actions">
            <button
              type="button"
              className="applix-button applix-button--subtle"
              onClick={loginWithGoogle}
              disabled={loading}
            >
              {loading ? "Opening" : "Log in"}
            </button>
            <a className="applix-button applix-button--primary" href="#start-check">
              Get Started
            </a>
          </div>
        </div>
      </header>

      <section className="applix-hero" aria-labelledby="hero-title">
        <div className="applix-container applix-hero-grid">
          <div>
            <div className="hero-badge">
              <span className="hero-badge-dot" />
              <span>Automating Australian Job Applications</span>
            </div>
            
            <h1 id="hero-title">
              Land your New Job in Australia <span className="highlight">automatically</span>.
            </h1>
            
            <p className="applix-hero-copy">
              Calsie Jobs automates the entire Australian job hunt—finding openings, tailoring your resume, and drafting personalized applications—while you retain full control and final approval.
            </p>
            
            <div className="applix-hero-actions">
              <a className="applix-button applix-button--primary" href="#start-check">
                Start Free Campaign
              </a>
              <a className="applix-button" href="#how-it-works">
                See How It Works
              </a>
            </div>
            
            <p className="applix-supporting-line">
              No credit card required. Control campaign limits up to 24 applications per day.
            </p>
            
            {status ? (
              <p className="applix-status" role="alert">
                {status}
              </p>
            ) : null}
          </div>

          <div className="applix-tracker-preview" aria-label="Example Calsie Jobs application tracker">
            <div className="tracker-browser-bar">
              <span className="browser-dot" />
              <span className="browser-dot" />
              <span className="browser-dot" />
            </div>
            
            <div className="applix-tracker-head">
              <div>
                <span className="applix-tracker-kicker">AUTOMATION SYSTEM</span>
                <h2>Live Campaign Tracking</h2>
              </div>
              <span className="applix-tracker-live">
                <i /> Active Run
              </span>
            </div>

            <div className="applix-tracker-campaign">
              <strong>Support Worker / Disability Services Campaign</strong>
              <span>Sydney, Melbourne, Brisbane · Full-Time</span>
            </div>

            <div className="applix-tracker-stats">
              {trackerStats.map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>

            <div className="applix-tracker-toolbar">
              <div>
                <span className="is-active">All Active</span>
                <span>Day 1</span>
              </div>
              <p>Demo Activity</p>
            </div>

            <div className="applix-tracker-table" role="table" aria-label="Example tracked jobs">
              <div className="applix-tracker-row applix-tracker-row--head" role="row">
                <span>Company</span>
                <span>Role / Location</span>
                <span>Status</span>
                <span>Action</span>
              </div>
              {trackerRows.map(([company, role, rowStatus, action]) => (
                <div className="applix-tracker-row" role="row" key={`${company}-${role}`}>
                  <span>
                    <strong>{company}</strong>
                    <small>NSW, VIC, QLD</small>
                  </span>
                  <span>{role}</span>
                  <span>
                    <b className={`tracker-status tracker-status--${rowStatus.toLowerCase()}`}>
                      {rowStatus}
                    </b>
                  </span>
                  <span>
                    <button type="button" tabIndex={-1}>
                      {action}
                    </button>
                  </span>
                </div>
              ))}
            </div>

            <div className="applix-tracker-foot">
              <span>Showing 5 of 120 opportunities</span>
              <strong>Scan → Match → Edit → Send</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="applix-stats" aria-label="Calsie Jobs highlights">
        <div className="applix-container applix-stats-grid">
          {stats.map((stat) => (
            <div className="applix-stat" key={stat.label}>
              <strong>{stat.value}</strong>
              <span>{stat.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="applix-section" id="about" aria-labelledby="trust-title">
        <div className="applix-container">
          <div className="applix-section-header centered">
            <span className="applix-eyebrow">Minimal Outreach Overhead</span>
            <h2 id="trust-title">Deliberate application prep. No manual forms.</h2>
            <p>
              Calsie Jobs takes the repetitive work out of job hunts. We target vacancies, generate specific drafts, and handle sending without sacrificing control.
            </p>
          </div>
          <div className="applix-trust-grid" aria-label="Calsie Jobs trust signals">
            {trustLabels.map((label) => (
              <div className="applix-trust-item" key={label}>
                {label}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="applix-section" id="features" aria-labelledby="features-title">
        <div className="applix-container">
          <div className="applix-section-header">
            <span className="applix-eyebrow">Platform Features</span>
            <h2 id="features-title">Automate your application workflow completely.</h2>
            <p>
              Every tool required to move from searching directories to signing contracts in Australia.
            </p>
          </div>
          <div className="applix-card-grid">
            {features.map(([title, body], index) => (
              <article className="applix-feature-card" key={title}>
                <span className="applix-feature-number">0{index + 1}</span>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="applix-section applix-how" id="how-it-works" aria-labelledby="steps-title">
        <div className="applix-container">
          <div className="applix-section-header centered applix-how-header">
            <span className="applix-eyebrow">Three Step Setup</span>
            <h2 id="steps-title">How Calsie Jobs works</h2>
            <p>
              Our process handles finding vacancies and drafting proposals while you make final sending decisions.
            </p>
          </div>
          <div className="applix-step-track">
            {steps.map(([title, body], index) => (
              <article className="applix-step-card" key={title}>
                <span className="applix-step-number">{index + 1}</span>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="applix-philosophy" aria-labelledby="why-title">
        <div className="applix-container applix-philosophy-panel">
          <div>
            <span className="applix-eyebrow" style={{ color: "var(--cl-red)" }}>
              Campaign Control
            </span>
            <h2 id="why-title">Controlled sending pace keeps your inbox healthy.</h2>
            <p>
              Automation shouldn't look like spam. Calsie Jobs schedules approved mailings to distribute applications naturally throughout working hours.
            </p>
          </div>
          <div className="applix-philosophy-note">
            <strong>Intelligent Speed Limits</strong>
            <span>
              Send limit is capped at 1 application per hour to maintain account safety. Pause, resume, or edit campaigns at any time.
            </span>
          </div>
        </div>
      </section>

      <PricingSection />

      <section className="applix-final-cta" aria-labelledby="cta-title">
        <div className="applix-container applix-final-grid" id="start-check">
          <div className="applix-final-copy">
            <span className="applix-eyebrow">Launch Settings</span>
            <h2 id="cta-title">Ready to automate your Australian job search?</h2>
            <p>
              Configure Calsie Jobs, connect your profile instructions, and approve up to 24 applications per day.
            </p>
            <div className="applix-final-actions">
              <a className="applix-button applix-button--primary" href="#start-check">
                Get Started
              </a>
              <a className="applix-button" href="#features">
                Explore Features
              </a>
            </div>
          </div>

          <div className="applix-start-card" aria-live="polite">
            <div className="applix-start-card-top">
              <span>
                {carouselComplete ? "Ready to continue" : `${carouselIndex + 1}/${onboardingSlides.length}`}
              </span>
              <div className="applix-progress" aria-hidden="true">
                {onboardingSlides.map((slide, index) => (
                  <span
                    key={slide[0]}
                    className={index <= carouselIndex || carouselComplete ? "is-active" : undefined}
                  />
                ))}
              </div>
            </div>
            {!carouselComplete ? (
              <>
                <h3>{activeSlide[0]}</h3>
                <p>{activeSlide[1]}</p>
                <button
                  type="button"
                  className="applix-button applix-button--primary"
                  onClick={confirmSlide}
                >
                  {carouselIndex === onboardingSlides.length - 1 ? "Complete setup check" : "Next"}
                </button>
              </>
            ) : (
              <>
                <h3>Setup Checklist Complete</h3>
                <p>
                  Connect your Google Account to authorize Calsie Jobs to drafts emails for matches.
                </p>
                <button
                  type="button"
                  className="applix-button applix-button--primary"
                  onClick={loginWithGoogle}
                  disabled={loading}
                >
                  {loading ? "Opening" : "Register / Sign In"}
                </button>
              </>
            )}
            {status ? (
              <p className="applix-status" role="alert">
                {status}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <AppFooter />
    </main>
  );
}
