"use client";

import { campaignLocation, campaignRole, type CampaignRecord } from "./workspace-data";

export default function OverviewDashboard({ campaign, resumeReady, resumeName, gmailReady, approvedCount, passedCount, onOpenTracker }: {
  campaign: CampaignRecord | null;
  resumeReady: boolean;
  resumeName: string;
  gmailReady: boolean;
  approvedCount: number;
  passedCount: number;
  onOpenTracker: () => void;
}) {
  const status = campaign?.status || "Not configured";
  const campaignLabel = ["active", "scheduled", "launched"].includes(status) ? "Active" : status === "paused" ? "Paused" : "Not set";

  return (
    <section className="canva-overview">
      <header className="canva-overview-header">
        <p>Workspace</p>
        <h1>Welcome back</h1>
        <span>Your Applix control centre.</span>
      </header>

      <div className="canva-status-grid">
        <article><strong>Resume</strong><small>{resumeReady ? resumeName || "Resume ready" : "Resume missing"}</small></article>
        <article><strong>AI Email Send</strong><small>{gmailReady ? "Email connected" : "Email not connected"}</small></article>
        <article><strong>Campaign</strong><small>{campaignLabel}<br />{campaign ? "Your campaign is ready" : "No campaign yet"}</small></article>
        <article className="canva-price-card"><strong>Plan</strong><b>$99</b><small>AUD service</small></article>
      </div>

      <section className="canva-service-card">
        <span>Service Type:</span>
        <h2>{campaignRole(campaign)}</h2>
        <p>{campaignRole(campaign)} · {campaignLocation(campaign)}</p>
        <div className="canva-metrics-row">
          <button type="button" className="canva-metric canva-metric-pass">Passed : {passedCount}</button>
          <button type="button" className="canva-metric canva-metric-smash">Smashed : {approvedCount}</button>
          <button type="button" className="canva-metric canva-metric-tracker" onClick={onOpenTracker}>Tracker <span>✓</span></button>
        </div>
      </section>
    </section>
  );
}
