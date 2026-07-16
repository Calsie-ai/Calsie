"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  CAMPAIGN_PLAN,
  CAMPAIGN_TEMPLATES,
  campaignLocation,
  campaignRole,
  type CampaignRecord,
  type CampaignTemplate,
  type WorkspaceTab,
} from "./workspace-data";

export default function WorkspacePanels({
  active,
  campaign,
  resumeReady,
  resumeName,
  gmailReady,
  busy,
  message,
  onUseTemplate,
  onResumeUpload,
  onConnectGmail,
  onToggleCampaign,
  onFindJobsNow,
}: {
  active: WorkspaceTab;
  campaign: CampaignRecord | null;
  resumeReady: boolean;
  resumeName: string;
  gmailReady: boolean;
  busy: boolean;
  message: string;
  onUseTemplate: (template: CampaignTemplate) => void;
  onResumeUpload: (file: File) => void;
  onConnectGmail: () => void;
  onToggleCampaign: () => void;
  onFindJobsNow: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<CampaignTemplate | null>(null);
  const [reviewTitle, setReviewTitle] = useState("");
  const [reviewRole, setReviewRole] = useState("");
  const [reviewLocation, setReviewLocation] = useState("");
  const [reviewDescription, setReviewDescription] = useState("");

  const templates = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const matchingTemplates = CAMPAIGN_TEMPLATES.filter((item) =>
      `${item.title} ${item.role} ${item.category} ${item.description}`
        .toLowerCase()
        .includes(normalizedQuery),
    );

    return matchingTemplates.slice(0, 5);
  }, [query]);

  function openTemplateReview(item: CampaignTemplate) {
    setSelectedTemplate(item);
    setReviewTitle(item.title);
    setReviewRole(item.role);
    setReviewLocation(item.location);
    setReviewDescription(item.description);
  }

  function closeTemplateReview() {
    setSelectedTemplate(null);
  }

  function confirmTemplate() {
    if (!selectedTemplate) return;
    onUseTemplate({
      ...selectedTemplate,
      title: reviewTitle.trim() || selectedTemplate.title,
      role: reviewRole.trim() || selectedTemplate.role,
      location: reviewLocation.trim() || selectedTemplate.location,
      description: reviewDescription.trim() || selectedTemplate.description,
    });
  }

  const status = campaign?.status || "Not configured";
  const running = ["active", "launched", "scheduled"].includes(status);
  const paused = status === "paused";
  const statusClass = running ? "is-running" : paused ? "is-paused" : "is-idle";
  const statusText = running ? "Campaign running" : paused ? "Paused" : status;

  if (active === "templates") {
    return (
      <section>
        <header>
          <p>Templates</p>
          <h1>Browse templates</h1>
          <span>Choose a custom campaign or review a ready-made template before creating it.</span>
        </header>

        {selectedTemplate ? (
          <div className="workspace-template-review">
            <div className="workspace-template-review-heading">
              <div>
                <small>{selectedTemplate.category}</small>
                <h2>Review template</h2>
                <p>Change any detail before adding this campaign to your workspace.</p>
              </div>
              <button type="button" className="workspace-secondary" onClick={closeTemplateReview}>
                Back to templates
              </button>
            </div>

            <div className="workspace-template-review-grid">
              <label>
                Campaign name
                <input value={reviewTitle} onChange={(event) => setReviewTitle(event.target.value)} />
              </label>
              <label>
                Target role
                <input value={reviewRole} onChange={(event) => setReviewRole(event.target.value)} />
              </label>
              <label>
                Target location
                <input value={reviewLocation} onChange={(event) => setReviewLocation(event.target.value)} />
              </label>
              <label className="workspace-template-review-wide">
                Template details
                <textarea rows={4} value={reviewDescription} onChange={(event) => setReviewDescription(event.target.value)} />
              </label>
            </div>

            <div className="workspace-template-review-summary">
              <strong>Campaign plan</strong>
              <span>24 jobs per day</span>
              <span>1 approved email per hour</span>
              <span>30 days · up to 720 applications</span>
              <span>Approval required before sending</span>
            </div>

            <div className="workspace-actions">
              <button type="button" className="workspace-secondary" onClick={closeTemplateReview}>
                Cancel
              </button>
              <button type="button" className="workspace-primary" onClick={confirmTemplate} disabled={busy || !reviewTitle.trim() || !reviewRole.trim()}>
                {busy ? "Adding template..." : "Confirm and add campaign"}
              </button>
            </div>
          </div>
        ) : (
          <>
            <input
              className="workspace-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search templates or job roles"
            />
            <div className="workspace-template-grid">
              <article className="workspace-template-custom">
                <small>Custom campaign</small>
                <h3>Build your own campaign</h3>
                <p>Choose the role, location, job type, requirements, and campaign settings yourself.</p>
                <span className="workspace-template-usage">1,200 times used</span>
                <Link className="workspace-template-link" href="/campaign/new">
                  Create custom
                </Link>
              </article>
              {templates.map((item) => (
                <article key={item.id}>
                  <small>{item.category}</small>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                  <button type="button" onClick={() => openTemplateReview(item)} disabled={busy}>
                    Review template
                  </button>
                </article>
              ))}
            </div>
            {query.trim() && templates.length === 0 && (
              <div className="workspace-message">No ready-made templates match that search. Use the custom campaign card above.</div>
            )}
          </>
        )}
      </section>
    );
  }

  if (active === "resume") {
    return (
      <section>
        <header>
          <p>Resume</p>
          <h1>Update resume</h1>
          <span>Keep the current resume Applix attaches to approved applications.</span>
        </header>
        <div className="workspace-card">
          <h3>{resumeReady ? "Resume ready" : "Resume required"}</h3>
          <p>{resumeReady ? resumeName || "Resume saved" : "Upload a PDF, DOC, or DOCX file."}</p>
          <label className="workspace-primary">
            {busy ? "Working..." : "Upload or replace resume"}
            <input hidden type="file" accept=".pdf,.doc,.docx" onChange={(event) => event.target.files?.[0] && onResumeUpload(event.target.files[0])} />
          </label>
          <Link href="/resume-canvas">Open resume editor</Link>
        </div>
      </section>
    );
  }

  if (active === "gmail") {
    return (
      <section>
        <header>
          <p>Connection</p>
          <h1>Gmail connection</h1>
          <span>Connect the Gmail account Applix will use for approved applications.</span>
        </header>
        <div className="workspace-card">
          <h3>{gmailReady ? "Gmail connected" : "Gmail disconnected"}</h3>
          <p>{gmailReady ? "Applix can prepare approved sends through your connected account." : "Connect Gmail before starting a campaign."}</p>
          <button className="workspace-primary" onClick={onConnectGmail} disabled={busy || gmailReady}>
            {gmailReady ? "Connected" : "Connect Gmail"}
          </button>
        </div>
        <div className="workspace-privacy-row">
          <Link className="workspace-privacy-pill" href="/privacy">Privacy Policy</Link>
        </div>
      </section>
    );
  }

  if (active === "campaign") {
    return (
      <section>
        <header>
          <p>Campaign</p>
          <h1>Set up campaign</h1>
          <span>Pause controls scheduling. Find New Jobs Now runs a separate AI search while the campaign is active.</span>
        </header>
        <div className="workspace-plan">
          <div><b>24</b><span>jobs per day</span></div>
          <div><b>1</b><span>approved email per hour</span></div>
          <div><b>30</b><span>campaign days</span></div>
          <div><b>720</b><span>maximum applications</span></div>
        </div>
        <div className="workspace-card">
          <h3>{campaign?.name || "No campaign selected"}</h3>
          <p>{campaign ? `${campaignRole(campaign)} · ${campaignLocation(campaign)}` : "Choose and review a campaign from Browse Templates first."}</p>
          <div className="workspace-actions">
            {running && (
              <button className="workspace-secondary" onClick={onFindJobsNow} disabled={busy || !campaign}>
                {busy ? "Finding jobs..." : "Find New Jobs Now"}
              </button>
            )}
            <button className="workspace-primary" onClick={onToggleCampaign} disabled={busy || !campaign}>
              {running ? "Pause Campaign" : paused ? "Resume Campaign" : "Start Campaign"}
            </button>
          </div>
        </div>
        {message && <div className="workspace-message">{message}</div>}
      </section>
    );
  }

  if (active === "tracker") {
    return (
      <section className="workspace-tracker-section">
        <header className="workspace-tracker-heading">
          <div>
            <p>AI mission control</p>
            <h1>Application tracker</h1>
            <span>Review AI-approved jobs separately from legacy application history.</span>
          </div>
          <span className={`workspace-status-pill ${statusClass}`}><i /> {statusText}</span>
        </header>
        <div className="workspace-tracker-frame-wrap">
          <iframe className="workspace-tracker-frame" src="/tracker?embedded=1" title="Applix application tracker" />
        </div>
      </section>
    );
  }

  return (
    <section>
      <header>
        <p>Workspace</p>
        <h1>Welcome back</h1>
        <span>Your Applix control centre.</span>
      </header>
      {message && <div className="workspace-message">{message}</div>}
      <div className="workspace-plan">
        <div><b>{resumeReady ? "Ready" : "Missing"}</b><span>resume</span></div>
        <div><b>{gmailReady ? "Connected" : "Disconnected"}</b><span>Gmail</span></div>
        <div><b>{status}</b><span>campaign</span></div>
        <div><b>{CAMPAIGN_PLAN.hourly_email_limit}/hour</b><span>send limit</span></div>
      </div>
      <div className="workspace-card">
        <h3>{campaign?.name || "Set up your first campaign"}</h3>
        <p>{campaign ? `${campaignRole(campaign)} · ${campaignLocation(campaign)}` : "Browse templates, upload your resume, connect Gmail, and start."}</p>
        <div className="workspace-actions">
          {running && (
            <button className="workspace-secondary" onClick={onFindJobsNow} disabled={busy || !campaign}>
              {busy ? "Finding jobs..." : "Find New Jobs Now"}
            </button>
          )}
          <button className="workspace-primary" onClick={onToggleCampaign} disabled={busy || !campaign}>
            {running ? "Pause Campaign" : paused ? "Resume Campaign" : "Start Campaign"}
          </button>
        </div>
      </div>
    </section>
  );
}
