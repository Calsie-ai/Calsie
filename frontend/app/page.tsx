"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

const inviteCode = "Applixvvip26";
const canvaEmbedUrl = "https://www.canva.com/design/DAHMEDtiZZ0/view?embed";

function hideMissingAsset(event: React.SyntheticEvent<HTMLImageElement>) {
  event.currentTarget.style.display = "none";
}

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

        <img className="applix-asset asset-blob" src="/applix-assets/applix-blob.svg" alt="" onError={hideMissingAsset} />
        <img className="applix-asset asset-rays" src="/applix-assets/rays.svg" alt="" onError={hideMissingAsset} />
        <img className="applix-asset asset-diamond" src="/applix-assets/diamond.svg" alt="" onError={hideMissingAsset} />
        <img className="applix-asset asset-star" src="/applix-assets/star.svg" alt="" onError={hideMissingAsset} />
        <img className="applix-asset asset-atom" src="/applix-assets/atom.svg" alt="" onError={hideMissingAsset} />

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
