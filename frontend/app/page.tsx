"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

const inviteCode = "Applixvvip26";
const canvaEmbedUrl = "https://www.canva.com/design/DAHMEDtiZZ0/view?embed";

export default function HomePage() {
  const router = useRouter();
  const [topEmail, setTopEmail] = useState("");
  const [bottomEmail, setBottomEmail] = useState("");

  function launch(email: string) {
    const cleanEmail = email.trim();

    if (typeof window !== "undefined") {
      if (cleanEmail) {
        window.localStorage.setItem("applixAccessEmail", cleanEmail);
      }

      window.sessionStorage.setItem(
        "applixCampaignDraft",
        JSON.stringify({
          email: cleanEmail,
          inviteCode,
          source: "canva-applix-landing",
          createdAt: new Date().toISOString(),
        })
      );
    }

    router.push("/resume-canvas");
  }

  function submitTop(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    launch(topEmail);
  }

  function submitBottom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    launch(bottomEmail);
  }

  return (
    <main className="canva-landing-page">
      <div className="canva-stage" aria-label="APPLIX landing page from Canva design">
        <iframe
          className="canva-frame"
          src={canvaEmbedUrl}
          title="APPLIX landing page"
          loading="eager"
          allowFullScreen
        />

        <form className="hotspot-form hotspot-top" onSubmit={submitTop} aria-label="Top APPLIX signup form">
          <input
            value={topEmail}
            onChange={(event) => setTopEmail(event.target.value)}
            type="email"
            aria-label="Email address"
            autoComplete="email"
          />
          <button type="submit" aria-label="Get Magic Link" />
        </form>

        <form className="hotspot-form hotspot-bottom" onSubmit={submitBottom} aria-label="Bottom APPLIX signup form">
          <input
            value={bottomEmail}
            onChange={(event) => setBottomEmail(event.target.value)}
            type="email"
            aria-label="Email address"
            autoComplete="email"
          />
          <button type="submit" aria-label="Signup/Register" />
        </form>
      </div>
    </main>
  );
}
