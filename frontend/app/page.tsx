"use client";

import { useState } from "react";
import { getSupabaseClient } from "../lib/supabaseClient";
import PricingSection from "./components/PricingSection";

const navLinks = [
  { label: "Features", href: "#features" },
  { label: "How it Works", href: "#how-it-works" },
  { label: "Pricing", href: "#pricing" },
  { label: "About", href: "#about" },
];

const stats = [
  { value: "2 min", label: "setup" },
  { value: "100/day", label: "job capability" },
  { value: "Tailored", label: "emails and resumes" },
  { value: "Control", label: "approve before applying" },
];

const trustLabels = ["AI-assisted workflow", "Resume tailoring", "Human approval", "Job tracking"];

const features = [
  ["Smart Job Matching", "Find relevant roles based on your preferences, resume, and the type of work you actually want."],
  ["Tailored Resume Generation", "Create focused resume drafts for each opportunity without rebuilding your profile from scratch."],
  ["AI Email Drafting", "Generate application emails that are specific, concise, and matched to the role in front of you."],
  ["Approval Workflow", "Review, edit, and approve applications before anything gets sent on your behalf."],
  ["Application Tracking", "Keep prepared, approved, and applied jobs organized in one workflow instead of scattered tabs."],
  ["Flexible Automation", "Choose guided assistance now and deeper automation when you are ready for more speed."],
];

const steps = [
  ["Connect your profile", "Upload your resume and set the roles, locations, and preferences Applix should use."],
  ["Configure your workflow", "Review matched jobs and let Applix prepare tailored resumes and emails for each role."],
  ["Approve and apply", "Check every draft, choose what moves forward, and apply faster with full control."],
];

const onboardingSlides = [
  ["What is Applix", "Applix is an AI-powered job application assistant built to help you prepare and manage job outreach in a controlled way."],
  ["What it does", "Applix can use your details, resume, and selected instructions to prepare job application emails and role-specific resume drafts."],
  ["How to connect the app", "Create or choose the Gmail account you want Applix to use, then authorize Applix with that account only."],
  ["How it works", "Applix runs with guardrails. You can review the workflow, approve applications, and decide how much automation to use."],
  ["Terms and control", "By continuing, you understand you are responsible for your email account, resume, details, and the instructions you give Applix."],
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
          <a className="applix-brand" href="#top" aria-label="Applix home">
            <img src="/applix-logo.svg" alt="" />
            <span>Applix</span>
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
            <p className="applix-hero-copy">Applix helps you discover jobs, tailor your resume, generate application emails, and apply with confidence - all in one streamlined workflow.</p>
            <div className="applix-hero-actions">
              <a className="applix-button applix-button--primary" href="#start-check">Get Started</a>
              <a className="applix-button" href="#how-it-works">See How It Works</a>
            </div>
            <p className="applix-supporting-line">Review every application yourself or automate parts of the process.</p>
            {status ? <p className="applix-status" role="alert">{status}</p> : null}
          </div>

          <div className="applix-product-panel" aria-label="Applix workflow preview">
            <div className="applix-panel-topbar">
              <div className="applix-panel-title"><strong>Application workflow</strong><span>Today&apos;s matched roles</span></div>
              <span className="applix-panel-pill">Human approval on</span>
            </div>
            <div className="applix-match-list">
              {[
                ["94%", "Product Analyst", "Resume draft ready", "Review"],
                ["88%", "Operations Coordinator", "Email generated", "Approve"],
                ["82%", "Customer Success Associate", "Preferences matched", "Queue"],
              ].map(([score, title, copy, state]) => (
                <div className="applix-match-row" key={title}>
                  <span className="applix-match-score">{score}</span>
                  <div className="applix-row-copy"><strong>{title}</strong><span>{copy}</span></div>
                  <span className="applix-row-status">{state}</span>
                </div>
              ))}
            </div>
            <div className="applix-workflow-list">
              {[
                ["1", "Match role", "Check fit against your profile and preferences."],
                ["2", "Tailor materials", "Prepare resume and email drafts for the role."],
                ["3", "Approve send", "You decide what moves forward."],
              ].map(([number, title, copy]) => (
                <div className="applix-workflow-item" key={number}>
                  <span>{number}</span><div><strong>{title}</strong><small>{copy}</small></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="applix-stats" aria-label="Applix highlights">
        <div className="applix-container applix-stats-grid">
          {stats.map((stat) => <div className="applix-stat" key={stat.label}><strong>{stat.value}</strong><span>{stat.label}</span></div>)}
        </div>
      </section>

      <section className="applix-section" id="about" aria-labelledby="trust-title">
        <div className="applix-container">
          <div className="applix-section-header centered">
            <p className="applix-eyebrow">Built for modern job seekers</p>
            <h2 id="trust-title">Less repetition. More deliberate applications.</h2>
            <p>Applix is designed to reduce repetitive job application work and help users move faster without losing control.</p>
          </div>
          <div className="applix-trust-grid" aria-label="Applix trust signals">
            {trustLabels.map((label) => <div className="applix-trust-item" key={label}>{label}</div>)}
          </div>
        </div>
      </section>

      <section className="applix-section" id="features" aria-labelledby="features-title">
        <div className="applix-container">
          <div className="applix-section-header">
            <p className="applix-eyebrow">Features</p>
            <h2 id="features-title">Everything you need to move from search to send.</h2>
            <p>A cleaner workflow for finding roles, tailoring materials, reviewing drafts, and tracking every application in motion.</p>
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
          <div className="applix-section-header centered applix-how-header"><h2 id="steps-title">How Applix works</h2><p>Get up and applying in minutes, not days.</p></div>
          <div className="applix-step-track">
            {steps.map(([title, body], index) => (
              <article className="applix-step-card" key={title}><span className="applix-step-number">{index + 1}</span><h3>{title}</h3><p>{body}</p></article>
            ))}
          </div>
        </div>
      </section>

      <section className="applix-philosophy" aria-labelledby="why-title">
        <div className="applix-container applix-philosophy-panel">
          <div><p className="applix-eyebrow">Why Applix</p><h2 id="why-title">Fast applications, without losing control.</h2><p>Applix is built for people who want the speed of AI without blindly handing over the entire application process. It helps reduce repetitive effort while keeping review and approval at the center.</p></div>
          <div className="applix-philosophy-note"><strong>AI should accelerate the workflow, not take away your judgment.</strong><span>Keep approval close, choose the right level of automation, and move faster with a system designed around your decisions.</span></div>
        </div>
      </section>

      <PricingSection />

      <section className="applix-final-cta" aria-labelledby="cta-title">
        <div className="applix-container applix-final-grid" id="start-check">
          <div className="applix-final-copy">
            <p className="applix-eyebrow">Start with control</p>
            <h2 id="cta-title">Start applying smarter with Applix</h2>
            <p>Set up in minutes and streamline your job application workflow with AI-powered support. Review the guardrails, choose your pace, and continue into Applix when ready.</p>
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
              <><h3>Start check complete</h3><p>Continue with Google to open Applix and move into your dashboard workflow.</p><button type="button" className="applix-button applix-button--primary" onClick={loginWithGoogle} disabled={loading}>{loading ? "Opening" : "Sign in / Sign up"}</button></>
            )}
            {status ? <p className="applix-status" role="alert">{status}</p> : null}
          </div>
        </div>
      </section>

      <footer className="applix-footer">
        <div className="applix-container applix-footer-inner">
          <div className="applix-footer-brand"><strong>Applix</strong><p>AI-powered job application support for modern job seekers.</p></div>
          <nav className="applix-footer-links" aria-label="Footer navigation"><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/contact">Contact</a><a href="/support">Support</a></nav>
        </div>
      </footer>
    </main>
  );
}
