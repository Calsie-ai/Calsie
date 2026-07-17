"use client";

import { campaignLocation, campaignRole, type CampaignRecord, type CampaignTemplate } from "./workspace-data";

const DAY_MS = 24 * 60 * 60 * 1000;

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

function positiveInteger(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function textValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function campaignTiming(campaign: CampaignRecord | null) {
  const outreach = campaign?.outreach || {};
  const totalDays = positiveInteger(outreach.campaign_days, 30);
  const dailyJobLimit = positiveInteger(outreach.daily_job_limit, 24);
  const hasStarted = Boolean(campaign && ["active", "scheduled", "launched", "paused"].includes(campaign.status));
  const savedStart = textValue(outreach.started_at) || textValue(outreach.launched_at) || textValue(outreach.scheduled_at);
  const startValue = savedStart || (hasStarted ? campaign?.created_at || null : null);
  const startTime = startValue ? Date.parse(startValue) : Number.NaN;
  const elapsedDays = Number.isFinite(startTime) ? Math.floor(Math.max(0, Date.now() - startTime) / DAY_MS) : 0;
  const currentDay = hasStarted ? Math.min(totalDays, elapsedDays + 1) : 0;

  return { totalDays, dailyJobLimit, currentDay, hasStarted };
}

export default function OverviewDashboard({ campaign, purchasedTemplate, resumeReady, resumeName, gmailReady, approvedCount, passedCount, onOpenTracker }: Props) {
  const status = campaign?.status || "Not configured";
  const campaignLabel = ["active", "scheduled", "launched"].includes(status) ? "Active" : status === "paused" ? "Paused" : status === "draft" ? "Draft" : "Not set";
  const title = purchasedTemplate?.title || campaign?.name || "No template selected";
  const role = purchasedTemplate?.role || campaignRole(campaign);
  const location = purchasedTemplate?.location || campaignLocation(campaign);
  const description = purchasedTemplate?.description || "Choose a template to create your job campaign.";
  const timing = campaignTiming(campaign);
  const dayLabel = timing.hasStarted ? `Day ${timing.currentDay} of ${timing.totalDays}` : "Not started";

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
        <article><strong>Campaign</strong><small>{campaignLabel}</small></article>
        <article><strong>Plan</strong><small>{campaign ? `${timing.dailyJobLimit} jobs/day · ${timing.totalDays} days` : "Not selected"}</small></article>
      </div>

      <section className="canva-service-card">
        <span>Service Type:</span>
        <h2>{role}</h2>
        <p>{role} · {location}</p>
        <div className="canva-metrics-row">
          <button type="button" className="canva-metric canva-metric-pass"><strong>Passed: {passedCount}</strong></button>
          <button type="button" className="canva-metric canva-metric-smash"><strong>Smashed: {approvedCount}</strong></button>
          <div className="canva-metric canva-metric-day" aria-label={dayLabel}><strong>{dayLabel}</strong></div>
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
