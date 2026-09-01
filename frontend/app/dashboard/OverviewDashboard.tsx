"use client";

import { ArrowRight, ClipboardList, Crown, FileText, FolderOpen, Mail, Megaphone } from "lucide-react";
import { campaignLocation, campaignRole, type CampaignRecord, type CampaignTemplate } from "./workspace-data";
import TemplateCarousel from "./TemplateCarousel";

const DAY_MS = 24 * 60 * 60 * 1000;

type Props = {
  campaign: CampaignRecord | null;
  purchasedTemplate?: CampaignTemplate | null;
  resumeReady: boolean;
  resumeName: string;
  gmailReady: boolean;
  approvedCount: number;
  passedCount: number;
  greetingName: string;
  /** Live templates for the preview carousel. */
  templates?: CampaignTemplate[];
  templatesLoading?: boolean;
  onOpenTemplate?: (template: CampaignTemplate) => void;
  onOpenTracker: () => void;
  onBrowseTemplates: () => void;
  onConnectGmail: () => void;
  onUpdateResume: () => void;
  onSetUpCampaign: () => void;
};

type DotState = "ready" | "attention" | "neutral";

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

type LucideIconType = typeof FileText;

type StatCardProps = {
  icon: LucideIconType;
  title: string;
  /** Exactly one line of state. Truncates rather than wrapping, so all four
      cards stay the same height instead of stretching to the longest one. */
  sub: string;
  /** Highlights the sub line when it names a real artifact (a resume file)
      rather than describing a status. */
  accent?: boolean;
  dot: DotState;
  footLabel: string;
  onAction?: () => void;
};

function StatCard({ icon: Icon, title, sub, accent, dot, footLabel, onAction }: StatCardProps) {
  return (
    <article className="ws-stat-card">
      <div className="ws-stat-top">
        <span className="ws-stat-icon"><Icon size={20} strokeWidth={1.8} /></span>
        <div className="ws-stat-copy">
          <h2>{title}</h2>
          <p className={accent ? "is-accent" : undefined} title={sub}>{sub}</p>
        </div>
      </div>
      <div className="ws-stat-foot">
        <span className={`ws-bullet ws-bullet-${dot}`} aria-hidden="true" />
        {onAction ? (
          <button type="button" className="ws-foot-action" onClick={onAction}>{footLabel}</button>
        ) : (
          <span className="ws-foot-ready">{footLabel}</span>
        )}
      </div>
    </article>
  );
}

function ServiceArt() {
  return (
    <svg className="ws-service-art" viewBox="0 0 170 150" fill="none" aria-hidden="true" focusable="false">
      <rect x="18" y="16" width="112" height="126" rx="14" fill="var(--ws-art-1)" />
      <rect x="28" y="26" width="92" height="106" rx="10" fill="var(--ws-art-2)" />
      <rect x="55" y="8" width="38" height="20" rx="7" fill="var(--ws-art-3)" />
      <rect x="42" y="46" width="14" height="14" rx="4" fill="var(--ws-art-4)" />
      <rect x="64" y="50" width="42" height="7" rx="3.5" fill="var(--ws-art-5)" />
      <rect x="42" y="72" width="14" height="14" rx="4" fill="var(--ws-art-4)" />
      <rect x="64" y="76" width="42" height="7" rx="3.5" fill="var(--ws-art-5)" />
      <rect x="42" y="98" width="14" height="14" rx="4" fill="var(--ws-art-4)" />
      <rect x="64" y="102" width="30" height="7" rx="3.5" fill="var(--ws-art-5)" />
      <circle cx="127" cy="115" r="25" fill="var(--ws-art-accent)" />
      <path d="m116 115 8 8 15-16" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PreviewArt() {
  return (
    <svg className="ws-preview-art" viewBox="0 0 150 110" fill="none" aria-hidden="true" focusable="false">
      <rect x="10" y="24" width="66" height="60" rx="10" fill="var(--ws-art-1)" transform="rotate(-11 43 54)" />
      <rect x="74" y="20" width="62" height="58" rx="10" fill="var(--ws-art-3)" transform="rotate(9 105 49)" />
      <rect x="44" y="30" width="62" height="56" rx="10" fill="var(--ws-art-2)" stroke="var(--ws-art-5)" strokeWidth="2" />
      <circle cx="62" cy="47" r="6" fill="var(--ws-art-accent)" />
      <path d="M50 78l16-16a4 4 0 0 1 5.6 0L84 74l6-5.6a4 4 0 0 1 5.5 0L100 73v5a4 4 0 0 1-4 4H54a4 4 0 0 1-4-4Z" fill="var(--ws-art-4)" />
    </svg>
  );
}

export default function OverviewDashboard({
  campaign,
  purchasedTemplate,
  resumeReady,
  resumeName,
  gmailReady,
  approvedCount,
  passedCount,
  greetingName,
  onOpenTracker,
  templates,
  templatesLoading,
  onOpenTemplate,
  onBrowseTemplates,
  onConnectGmail,
  onUpdateResume,
  onSetUpCampaign,
}: Props) {
  const status = campaign?.status || "Not configured";
  const campaignLabel = ["active", "scheduled", "launched"].includes(status) ? "Active" : status === "paused" ? "Paused" : status === "draft" ? "Draft" : "Not set";
  const title = purchasedTemplate?.title || campaign?.name || "No template selected";
  const role = purchasedTemplate?.role || campaignRole(campaign);
  const location = purchasedTemplate?.location || campaignLocation(campaign);
  const description = purchasedTemplate?.description || "Choose a template to create your job campaign.";
  const timing = campaignTiming(campaign);
  const dayLabel = timing.hasStarted ? `Day ${timing.currentDay} of ${timing.totalDays}` : "Not started";
  const dayProgress = timing.hasStarted ? Math.min(100, Math.round((timing.currentDay / timing.totalDays) * 100)) : 0;

  const campaignDot: DotState = campaignLabel === "Active" ? "ready" : campaignLabel === "Paused" ? "attention" : "neutral";

  return (
    <div className="ws-overview">
      <section className="ws-hero">
        <div className="ws-hero-copy">
          <p className="ws-greeting">Good to see you again, {greetingName}</p>
          <h1 className="ws-hero-title">Welcome back</h1>
          <p className="ws-hero-sub">Here&apos;s what&apos;s happening across your job search today.</p>
        </div>

        <div className="ws-status-card">
          <div className="ws-status-head">
            <div>
              <p className="ws-eyebrow">Campaign status</p>
              <p className="ws-status-value">{dayLabel}</p>
            </div>
            <span className="ws-status-emoji" aria-hidden="true">🚀</span>
          </div>
          <div
            className="ws-progress"
            role="progressbar"
            aria-valuenow={dayProgress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Campaign progress"
          >
            <i style={{ width: `${dayProgress}%` }} />
          </div>
        </div>
      </section>

      <section className="ws-stat-grid">
        <StatCard
          icon={FileText}
          title="Resume"
          sub={resumeReady ? resumeName || "Resume ready" : "No resume uploaded"}
          accent={resumeReady && Boolean(resumeName)}
          dot={resumeReady ? "ready" : "attention"}
          footLabel={resumeReady ? "Ready" : "Upload now"}
          onAction={resumeReady ? undefined : onUpdateResume}
        />
        <StatCard
          icon={Mail}
          title="AI Email Send"
          sub={gmailReady ? "Email connected" : "Email not connected"}
          dot={gmailReady ? "ready" : "attention"}
          footLabel={gmailReady ? "Connected" : "Connect now"}
          onAction={gmailReady ? undefined : onConnectGmail}
        />
        <StatCard
          icon={Megaphone}
          title="Campaign"
          sub={campaignLabel}
          dot={campaignDot}
          footLabel={campaign ? "View campaign" : "Set up now"}
          onAction={onSetUpCampaign}
        />
        <StatCard
          icon={Crown}
          title="Plan"
          sub={campaign ? `${timing.dailyJobLimit} jobs/day · ${timing.totalDays} days` : "Not selected"}
          dot={campaign ? "ready" : "neutral"}
          footLabel={campaign ? "Configured" : "Choose a template"}
          onAction={campaign ? undefined : onBrowseTemplates}
        />
      </section>

      <section className="ws-service">
        <p className="ws-eyebrow ws-eyebrow-accent">Service overview</p>
        <h2 className="ws-service-value">{role}</h2>
        <p className="ws-service-sub">{location}</p>

        <ServiceArt />

        <div className="ws-service-divider" />

        <div className="ws-service-stats">
          <div className="ws-service-stat">
            <p className="ws-figure">{passedCount}</p>
            <p className="ws-caption">Passed</p>
          </div>
          <div className="ws-service-stat">
            <p className="ws-figure is-orange">{approvedCount}</p>
            <p className="ws-caption">Smashed</p>
          </div>
          <div className="ws-service-stat">
            <p className="ws-figure is-text">{dayLabel}</p>
            <p className="ws-caption">Status</p>
          </div>
        </div>
      </section>

      <section className="ws-bottom-grid">
        <article className="ws-order-card">
          <div className="ws-order-head">
            <ClipboardList size={16} strokeWidth={1.9} />
            <span>My order</span>
            <button type="button" className="ws-order-arrow" aria-label="Open tracker" onClick={onOpenTracker}>
              <ArrowRight size={18} strokeWidth={1.9} />
            </button>
          </div>
          <div className="ws-order-body">
            <p className="ws-eyebrow ws-eyebrow-accent">{purchasedTemplate?.category || "Campaign template"}</p>
            <h2 className="ws-order-title">{title}</h2>
            <p className="ws-order-text">{description}</p>
            {purchasedTemplate ? (
              <div className="ws-order-meta">
                <div><span>Role</span><strong>{role}</strong></div>
                <div><span>Location</span><strong>{location}</strong></div>
                <div><span>Status</span><strong>{campaignLabel}</strong></div>
              </div>
            ) : null}
            <button type="button" className="ws-btn-outline" onClick={purchasedTemplate ? onOpenTracker : onBrowseTemplates}>
              <FolderOpen size={17} strokeWidth={1.9} />
              {purchasedTemplate ? "Open Tracker" : "Browse Templates"}
            </button>
          </div>
        </article>

        {/* With a campaign already running this stays a preview of that
            template. Otherwise the old "Select a template to see preview"
            dead end becomes a browsable carousel of what is available. */}
        <article className={`ws-preview-card${purchasedTemplate?.imageUrl ? " has-media" : ""}${!purchasedTemplate?.imageUrl ? " is-carousel" : ""}`}>
          {purchasedTemplate?.imageUrl ? (
            <img src={purchasedTemplate.imageUrl} alt={title} />
          ) : onOpenTemplate ? (
            <TemplateCarousel
              templates={templates || []}
              loading={templatesLoading}
              onOpenTemplate={onOpenTemplate}
              onBrowseTemplates={onBrowseTemplates}
            />
          ) : (
            <>
              <PreviewArt />
              <h2 className="ws-preview-title">Template preview</h2>
              <p className="ws-preview-text">Select a template to see preview</p>
            </>
          )}
        </article>
      </section>
    </div>
  );
}
