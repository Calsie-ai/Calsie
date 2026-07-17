"use client";

import { campaignLocation, campaignRole, type CampaignRecord, type CampaignTemplate } from "./workspace-data";

type Props = {
  campaign: CampaignRecord | null;
  purchasedTemplate?: CampaignTemplate | null;
  resumeReady: boolean;
  resumeName: string;
  gmailReady: boolean;
  approvedCount: number;
  passedCount: number;
  onOpenTracker: () => void;
};

export default function OverviewDashboard({ campaign, purchasedTemplate, resumeReady, resumeName, gmailReady, approvedCount, passedCount, onOpenTracker }: Props) {
  const status = campaign?.status || "Not configured";
  const campaignLabel = ["active", "scheduled", "launched"].includes(status) ? "Active" : status === "paused" ? "Paused" : "Not set";
  const title = purchasedTemplate?.title || campaign?.name || "No template selected";
  const role = purchasedTemplate?.role || campaignRole(campaign);
  const location = purchasedTemplate?.location || campaignLocation(campaign);
  const description = purchasedTemplate?.description || "Choose a template to create your job campaign.";

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
        <article><strong>Plan</strong><small>{campaign ? "Campaign selected" : "Not selected"}</small></article>
      </div>

      <section className="canva-service-card">
        <span>Service Type:</span>
        <h2>{role}</h2>
        <p>{role} · {location}</p>
        <div className="canva-metrics-row">
          <button type="button" className="canva-metric canva-metric-pass">Passed : {passedCount}</button>
          <button type="button" className="canva-metric canva-metric-smash">Smashed : {approvedCount}</button>
          <button type="button" className="canva-metric canva-metric-tracker" onClick={onOpenTracker}>Tracker <span>✓</span></button>
        </div>
      </section>

      <section className="canva-order-card">
        <div className="canva-order-label">My Order</div>
        <div className="canva-order-content">
          <div className="canva-order-copy">
            <span>{purchasedTemplate?.category || "Campaign template"}</span>
            <h2>{title}</h2>
            <p>{description}</p>
          </div>
          {purchasedTemplate?.imageUrl ? <img src={purchasedTemplate.imageUrl} alt={title} /> : <div className="canva-order-placeholder">Template image</div>}
        </div>
        <div className="canva-order-meta">
          <div><span>Role</span><strong>{role}</strong></div>
          <div><span>Location</span><strong>{location}</strong></div>
          <div><span>Status</span><strong>{campaignLabel}</strong></div>
          <button type="button" onClick={onOpenTracker}>Open Tracker ➜</button>
        </div>
      </section>
    </section>
  );
}
