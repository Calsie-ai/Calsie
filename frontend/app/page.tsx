"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const inviteCode = "Applixvvip26";

export default function HomePage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [bottomEmail, setBottomEmail] = useState("");
  const [message, setMessage] = useState("");

  function saveAndLaunch(value: string) {
    const cleanEmail = value.trim();
    if (cleanEmail && typeof window !== "undefined") {
      window.localStorage.setItem("applixAccessEmail", cleanEmail);
      window.sessionStorage.setItem(
        "applixCampaignDraft",
        JSON.stringify({
          email: cleanEmail,
          inviteCode,
          source: "applix-landing",
          createdAt: new Date().toISOString(),
        })
      );
    }
    router.push("/resume-canvas");
  }

  function handleTopSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    saveAndLaunch(email);
  }

  function handleBottomSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    saveAndLaunch(bottomEmail);
  }

  return (
    <main className="applix-landing">
      <section className="applix-hero" aria-label="APPLIX landing page">
        <div className="applix-orb-wrap">
          <div className="applix-orb">
            <span>APPLIX</span>
          </div>
          <div className="mesh-hand mesh-hand-left" aria-hidden="true" />
        </div>

        <form className="access-card top-access" onSubmit={handleTopSubmit}>
          <span className="access-tab">Signup/Login</span>
          <label>
            Enter Your Email
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required />
          </label>
          <button type="submit">Get Magic Link</button>
        </form>
      </section>

      <p className="sub-logo">Symbiotic Intelligence</p>

      <section className="speed-section">
        <div className="copy-block copy-left">
          <h2>It&apos;s About Speed<br />Volume, chances<br />&amp; Loop</h2>
        </div>
        <div className="screen-visual" aria-hidden="true">
          <div className="monitor">
            <span />
          </div>
          <div className="cyan-slash slash-one" />
          <div className="cyan-slash slash-two" />
          <div className="purple-arm" />
        </div>
      </section>

      <section className="resource-section">
        <div className="giant-hand hand-left" aria-hidden="true" />
        <div className="copy-block resource-copy">
          <h2>It&apos;s Also a<br />Resources, that<br />comes with speed</h2>
        </div>
      </section>

      <section className="ai-section">
        <div className="copy-block ai-copy">
          <h2>Best Use Of<br />Artificial<br />Intelligence</h2>
        </div>
        <div className="sparkle" aria-hidden="true">✦</div>
        <div className="cupped-hand" aria-hidden="true" />
      </section>

      <section className="complexity-section">
        <div className="grid-patch" aria-hidden="true" />
        <div className="copy-block complexity-copy">
          <h2>Shared Consciousness,<br />Cognitiveness Speed,<br />Complexity</h2>
        </div>
        <div className="pinch-hand" aria-hidden="true" />
      </section>

      <section className="learn-section">
        <h2>Learn more About<br />Artificial Symbiotic Intelligence</h2>
        <div className="learn-cards">
          <article>
            <h3>Context</h3>
            <p>Contextual Data</p>
            <span>Learn How The Contextual symbiosis of applix Works</span>
          </article>
          <article>
            <h3>environment</h3>
            <p>where and how do Applix exist</p>
            <span>Learn What environment does Applix Seeks For</span>
          </article>
          <article>
            <h3>Goals</h3>
            <p>Sharing Goals and creating relationship</p>
            <span>Sharing Goal with symbiotes, Shared Energy Shared Goal</span>
          </article>
        </div>
      </section>

      <section className="bottom-access-section" id="signup">
        <h1>APPLIX</h1>
        <form className="access-card bottom-access" onSubmit={handleBottomSubmit}>
          <label>
            Enter Your Email
            <input value={bottomEmail} onChange={(event) => setBottomEmail(event.target.value)} type="email" required />
          </label>
          <button type="submit">Signup/Register</button>
          {message && <p>{message}</p>}
        </form>
        <div className="landing-actions">
          <Link href="/resume-canvas">Enter Applix</Link>
          <button type="button" onClick={() => setMessage(`Invite code: ${inviteCode}`)}>Show Invite Code</button>
        </div>
      </section>
    </main>
  );
}
