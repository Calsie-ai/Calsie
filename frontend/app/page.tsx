"use client";

import { useState } from "react";
import { getSupabaseClient } from "../lib/supabaseClient";
import AppFooter from "./components/AppFooter";
import PricingSection from "./components/PricingSection";

const navLinks = [
  { label: "Features", href: "#features" },
  { label: "How it Works", href: "#how-it-works" },
  { label: "Pricing", href: "#pricing" },
  { label: "About", href: "#about" },
];

const stats = [
  { value: "2 min", label: "setup" },
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
      const redirectTo = `${window.location.origin}/auth/callback?next=/dashboard`;
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
            <img src="/applix-logo.svg" alt="" />
            <span>Calsie | Jobs</span>
          </a>
          <nav className="applix-nav" aria-label="Primary navigation">
            {navLinks.map((link) => <a key={link.href} href={link.href}>{link.label}</a>)}
          </nav>
          <div className="applix-actions">
            <button type="button" className="applix-button applix-button--subtle" onClick={loginWithGoogle} disabled={loading}>
              {loading ? "Opening" : "Log in"}
            </button>
            <a className="applix-button applix-button--primary" href="#start-check">Get Started</a>
          </div>
        </div>
      </header>

      <section className="applix-hero" aria-labelledby="hero-title">
        <div className="applix-container applix-hero-grid">
          <div>
            <p className="applix-eyebrow">AI Job Application Assistant</p>
            <h1 id="hero-title">Apply to jobs faster with AI that works with you</h1>
            <p className="applix-hero-copy"><strong>The best opportunities start with being seen.</strong><br />Because the right resume means nothing if the right person never sees it.</p>
            <div className="applix-hero-actions">
              <a className="applix-button applix-button--primary" href="#start-check">Get Started</a>
              <a className="applix-button" href="#how-it-works">See how it works</a>
            </div>
            <p className="applix-supporting-line">Up to 720 approved applications over a 30-day campaign.</p>
            {status ? <p className="applix-status" role="alert">{status}</p> : null}
          </div>

          <div className="applix-tracker-preview" aria-label="Example Calsie Jobs application tracker">
            <div className="applix-tracker-head">
              <div>
                <span className="applix-tracker-kicker">AI mission control</span>
                <h2>Application tracker</h2>
              </div>
              <span className="applix-tracker-live"><i /> Active campaign</span>
            </div>

            <div className="applix-tracker-campaign">
              <strong>Support Worker / Community Services Campaign</strong>
              <span>Sydney NSW · Full-time and part-time roles</span>
            </div>

            <div className="applix-tracker-stats">
              {trackerStats.map(([label, value]) => (
                <div key={label}><span>{label}</span><strong>{value}</strong></div>
              ))}
            </div>

            <div className="applix-tracker-toolbar">
              <div><span className="is-active">All</span><span>Day 1</span></div>
              <p>Example campaign activity</p>
            </div>

            <div className="applix-tracker-table" role="table" aria-label="Example tracked jobs">
              <div className="applix-tracker-row applix-tracker-row--head" role="row">
                <span>Company</span><span>Opportunity</span><span>Status</span><span>Review</span>
              </div>
              {trackerRows.map(([company, role, rowStatus, action]) => (
                <div className="applix-tracker-row" role="row" key={`${company}-${role}`}>
                  <span><strong>{company}</strong><small>Sydney, NSW</small></span>
                  <span>{role}</span>
                  <span><b className={`tracker-status tracker-status--${rowStatus.toLowerCase()}`}>{rowStatus}</b></span>
                  <span><button type="button" tabIndex={-1}>{action}</button></span>
                </div>
              ))}
            </div>

            <div className="applix-tracker-foot">
              <span>Showing 5 of 120 opportunities</span>
              <strong>Search → Tailor → Approve → Send</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="applix-stats" aria-label="Calsie Jobs highlights">
        <div className="applix-container applix-stats-grid">
          {stats.map((stat) => <div className="applix-stat" key={stat.label}><strong>{stat.value}</strong><span>{stat.label}</span></div>)}
        </div>
      </section>

      <section className="applix-section" id="about" aria-labelledby="trust-title">
        <div className="applix-container">
          <div className="applix-section-header centered">
            <p className="applix-eyebrow">Built for modern job seekers</p>
            <h2 id="trust-title">Less repetition. More deliberate applications.</h2>
            <p>Calsie Jobs is designed to reduce repetitive job application work while keeping every send under your control.</p>
          </div>
          <div className="applix-trust-grid" aria-label="Calsie Jobs trust signals">
            {trustLabels.map((label) => <div className="applix-trust-item" key={label}>{label}</div>)}
          </div>
        </div>
      </section>

      <section className="applix-section" id="features" aria-labelledby="features-title">
        <div className="applix-container">
          <div className="applix-section-header">
            <p className="applix-eyebrow">Features</p>
            <h2 id="features-title">Everything you need to move from search to send.</h2>
            <p>A controlled workflow for finding roles, tailoring materials, reviewing drafts, and tracking every application.</p>
          </div>
          <div className="applix-card-grid">
            {features.map(([title, body], index) => (
              <article className="applix-feature-card" key={title}>
                <span className="applix-feature-number">0{index + 1}</span><h3>{title}</h3><p>{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="applix-section applix-how" id="how-it-works" aria-labelledby="steps-title">
        <div className="applix-container">
          <div className="applix-section-header centered applix-how-header"><h2 id="steps-title">How Calsie Jobs works</h2><p>Prepare up to 24 applications a day while keeping approval in your hands.</p></div>
          <div className="applix-step-track">
            {steps.map(([title, body], index) => (
              <article className="applix-step-card" key={title}><span className="applix-step-number">{index + 1}</span><h3>{title}</h3><p>{body}</p></article>
            ))}
          </div>
        </div>
      </section>

      <section className="applix-philosophy" aria-labelledby="why-title">
        <div className="applix-container applix-philosophy-panel">
          <div><p className="applix-eyebrow">Why Calsie Jobs</p><h2 id="why-title">Fast applications, without losing control.</h2><p>Calsie Jobs is built for people who want AI speed with a clear daily cap, an hourly sending limit, and approval before every application moves forward.</p></div>
          <div className="applix-philosophy-note"><strong>AI should accelerate the workflow, not take away your judgment.</strong><span>Approve applications in advance, pause at any time, and send no more than one approved application per hour.</span></div>
        </div>
      </section>

      <PricingSection />

      <section className="applix-final-cta" aria-labelledby="cta-title">
        <div className="applix-container applix-final-grid" id="start-check">
          <div className="applix-final-copy">
            <p className="applix-eyebrow">Start with control</p>
            <h2 id="cta-title">Start a 30-day Calsie Jobs campaign</h2>
            <p>Prepare up to 24 applications per day, approve the ones you want, and send no more than one approved application per hour—up to 720 applications over 30 days.</p>
            <div className="applix-final-actions"><a className="applix-button applix-button--light" href="#start-check">Get Started</a><a className="applix-button" href="#features">Learn More</a></div>
          </div>

          <div className="applix-start-card" aria-live="polite">
            <div className="applix-start-card-top">
              <span>{carouselComplete ? "Ready to continue" : `${carouselIndex + 1}/${onboardingSlides.length}`}</span>
              <div className="applix-progress" aria-hidden="true">
                {onboardingSlides.map((slide, index) => <span key={slide[0]} className={index <= carouselIndex || carouselComplete ? "is-active" : undefined} />)}
              </div>
            </div>
            {!carouselComplete ? (
              <><h3>{activeSlide[0]}</h3><p>{activeSlide[1]}</p><button type="button" className="applix-button applix-button--primary" onClick={confirmSlide}>{carouselIndex === onboardingSlides.length - 1 ? "Complete start check" : "Yes, I understood"}</button></>
            ) : (
              <><h3>Start check complete</h3><p>Continue with Google to open Calsie Jobs and create your controlled 30-day campaign.</p><button type="button" className="applix-button applix-button--primary" onClick={loginWithGoogle} disabled={loading}>{loading ? "Opening" : "Sign in / Sign up"}</button></>
            )}
            {status ? <p className="applix-status" role="alert">{status}</p> : null}
          </div>
        </div>
      </section>

      <AppFooter />
    </main>
  );
}
