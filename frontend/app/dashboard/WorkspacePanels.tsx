"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, Search, Wand2 } from "lucide-react";
import { isActionLoading, type ActionStateMap, type DashboardActionKey } from "../../lib/actionState";
import {
  CAMPAIGN_PLAN,
  CAMPAIGN_TEMPLATES,
  campaignLocation,
  campaignRole,
  templateCategoryIcon,
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
  actionStates,
  selectedTemplateActionId,
  onUseTemplate,
  onResumeUpload,
  onConnectGmail,
  onRevokeGmail,
  onToggleCampaign,
  onFindJobsNow,
}: {
  active: WorkspaceTab;
  campaign: CampaignRecord | null;
  resumeReady: boolean;
  resumeName: string;
  gmailReady: boolean;
  actionStates: ActionStateMap<DashboardActionKey>;
  selectedTemplateActionId: string;
  onUseTemplate: (template: CampaignTemplate) => void;
  onResumeUpload: (file: File) => Promise<void>;
  onConnectGmail: () => void;
  onRevokeGmail: () => void;
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
    return CAMPAIGN_TEMPLATES.filter((item) =>
      `${item.title} ${item.role} ${item.category} ${item.description}`
        .toLowerCase()
        .includes(normalizedQuery),
    ).slice(0, 5);
  }, [query]);

  function openTemplateReview(item: CampaignTemplate) {
    setSelectedTemplate(item);
    setReviewTitle(item.title);
    setReviewRole(item.role);
    setReviewLocation(item.location);
    setReviewDescription(item.description);
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
  const templateLoading = isActionLoading(actionStates, "useTemplate");
  const resumeLoading = isActionLoading(actionStates, "uploadResume");
  const startLoading = isActionLoading(actionStates, "startCampaign");
  const pauseLoading = isActionLoading(actionStates, "pauseCampaign");
  const campaignActionLoading = startLoading || pauseLoading;
  const findJobsLoading = isActionLoading(actionStates, "findJobs");

  if (active === "templates") {
    return (
      <div className="ws-panel">
        <header className="ws-panel-head">
          <p className="ws-panel-eyebrow">Templates</p>
          <h1 className="ws-panel-title">Browse templates</h1>
          <p className="ws-panel-sub">Choose a custom campaign or start from a ready-made template.</p>
        </header>

        {selectedTemplate ? (
          <div className="ws-review-card">
            <div className="ws-review-head">
              <div>
                <span className="ws-template-tag">{selectedTemplate.category}</span>
                <h2>Review template</h2>
                <p>Change any detail before adding this campaign to your workspace.</p>
              </div>
              <button type="button" className="ws-btn-outline" onClick={() => setSelectedTemplate(null)}>Back to templates</button>
            </div>
            <div className="ws-review-grid">
              <label className="ws-field">Campaign name<input value={reviewTitle} onChange={(event) => setReviewTitle(event.target.value)} /></label>
              <label className="ws-field">Target role<input value={reviewRole} onChange={(event) => setReviewRole(event.target.value)} /></label>
              <label className="ws-field">Target location<input value={reviewLocation} onChange={(event) => setReviewLocation(event.target.value)} /></label>
              <label className="ws-field ws-field-wide">Template details<textarea rows={4} value={reviewDescription} onChange={(event) => setReviewDescription(event.target.value)} /></label>
            </div>
            <div className="ws-review-summary">
              <div><span>Jobs per day</span><strong>24</strong></div>
              <div><span>Emails per hour</span><strong>1 approved</strong></div>
              <div><span>Duration</span><strong>30 days · up to 720</strong></div>
              <div><span>Approval</span><strong>Required before sending</strong></div>
            </div>
            <div className="ws-review-actions">
              <button type="button" className="ws-btn-outline" onClick={() => setSelectedTemplate(null)}>Cancel</button>
              <button type="button" className="ws-btn-primary" onClick={confirmTemplate} disabled={templateLoading || !reviewTitle.trim() || !reviewRole.trim()}>
                {templateLoading && selectedTemplateActionId === selectedTemplate.id ? "Adding template…" : "Confirm and add campaign"}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="ws-template-search">
              <Search size={18} strokeWidth={1.8} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search templates or job roles" />
            </div>
            <div className="ws-template-grid">
              <article className="ws-template-card ws-template-card-custom">
                <div className="ws-template-icon"><Wand2 size={20} strokeWidth={1.8} /></div>
                <span className="ws-template-tag">Custom campaign</span>
                <h3>Build your own campaign</h3>
                <p>Choose the role, location, job type, requirements, and campaign settings yourself.</p>
                <div className="ws-template-foot">
                  <span className="ws-template-usage">1,200 times used</span>
                  <Link className="ws-template-btn" href="/campaign/new">Create custom<ArrowRight size={14} strokeWidth={2.4} /></Link>
                </div>
              </article>
              {templates.map((item) => {
                const Icon = templateCategoryIcon(item.category);
                return (
                  <article key={item.id} className="ws-template-card">
                    <div className="ws-template-icon"><Icon size={20} strokeWidth={1.8} /></div>
                    <span className="ws-template-tag">{item.category}</span>
                    <h3>{item.title}</h3>
                    <p>{item.description}</p>
                    <div className="ws-template-foot">
                      <button type="button" className="ws-template-btn" onClick={() => openTemplateReview(item)}>Review template<ArrowRight size={14} strokeWidth={2.4} /></button>
                    </div>
                  </article>
                );
              })}
            </div>
            {query.trim() && templates.length === 0 && <div className="ws-panel-message">No ready-made templates match that search. Use the custom campaign card above.</div>}
          </>
        )}
      </div>
    );
  }

  if (active === "resume") {
    return (
      <section>
        <header><p>Resume</p><h1>Update resume</h1><span>Keep the current resume Applix attaches to approved applications.</span></header>
        <div className="workspace-card">
          <h3>{resumeReady ? "Resume ready" : "Resume required"}</h3>
          <p>{resumeReady ? resumeName || "Resume saved" : "Upload a PDF, DOC, or DOCX file."}</p>
          <label className="workspace-primary">
            {resumeLoading ? "Uploading resume…" : "Upload or replace resume"}
            <input
              hidden
              type="file"
              accept=".pdf,.doc,.docx"
              disabled={resumeLoading}
              onChange={async (event) => {
                const input = event.currentTarget;
                const file = input.files?.[0];
                if (!file) return;
                try {
                  await onResumeUpload(file);
                } finally {
                  input.value = "";
                }
              }}
            />
          </label>
          <Link href="/resume-canvas">Open resume editor</Link>
        </div>
      </section>
    );
  }

  if (active === "campaign") {
    return (
      <section>
        <header><p>Campaign</p><h1>Set up campaign</h1><span>Pause controls scheduling. Find New Jobs Now runs a separate AI search while the campaign is active.</span></header>
        <div className="workspace-plan"><div><b>24</b><span>jobs per day</span></div><div><b>1</b><span>approved email per hour</span></div><div><b>30</b><span>campaign days</span></div><div><b>720</b><span>maximum applications</span></div></div>
        <div className="workspace-card">
          <h3>{campaign?.name || "No campaign selected"}</h3>
          <p>{campaign ? `${campaignRole(campaign)} · ${campaignLocation(campaign)}` : "Choose and review a campaign from Browse Templates first."}</p>
          <div className="workspace-actions">
            {running && <button type="button" className="workspace-secondary" onClick={onFindJobsNow} disabled={findJobsLoading || !campaign}>{findJobsLoading ? "Finding jobs…" : "Find New Jobs Now"}</button>}
            <button type="button" className="workspace-primary" onClick={onToggleCampaign} disabled={campaignActionLoading || !campaign || (!running && (!resumeReady || !gmailReady))}>
              {pauseLoading ? "Pausing campaign…" : startLoading ? "Starting campaign…" : running ? "Pause Campaign" : paused ? "Resume Campaign" : "Start Campaign"}
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (active === "tracker") {
    return (
      <section className="workspace-tracker-section">
        <header className="workspace-tracker-heading"><div><p>AI mission control</p><h1>Application tracker</h1><span>Review AI-approved jobs separately from legacy application history.</span></div><span className={`workspace-status-pill ${statusClass}`}><i /> {statusText}</span></header>
        <div className="workspace-tracker-frame-wrap"><iframe className="workspace-tracker-frame" src="/tracker?embedded=1" title="Applix application tracker" /></div>
      </section>
    );
  }

  return (
    <section>
      <header><p>Workspace</p><h1>Welcome back</h1><span>Your Applix control centre.</span></header>
      <div className="workspace-plan"><div><b>{resumeReady ? "Ready" : "Missing"}</b><span>resume</span></div><div><b>{gmailReady ? "Connected" : "Disconnected"}</b><span>Gmail</span></div><div><b>{status}</b><span>campaign</span></div><div><b>{CAMPAIGN_PLAN.hourly_email_limit}/hour</b><span>send limit</span></div></div>
      <div className="workspace-card">
        <h3>{campaign?.name || "Set up your first campaign"}</h3>
        <p>{campaign ? `${campaignRole(campaign)} · ${campaignLocation(campaign)}` : "Browse templates, upload your resume, connect Gmail, and start."}</p>
        <div className="workspace-actions">
          {running && <button type="button" className="workspace-secondary" onClick={onFindJobsNow} disabled={findJobsLoading || !campaign}>{findJobsLoading ? "Finding jobs…" : "Find New Jobs Now"}</button>}
          <button type="button" className="workspace-primary" onClick={onToggleCampaign} disabled={campaignActionLoading || !campaign || (!running && (!resumeReady || !gmailReady))}>
            {pauseLoading ? "Pausing campaign…" : startLoading ? "Starting campaign…" : running ? "Pause Campaign" : paused ? "Resume Campaign" : "Start Campaign"}
          </button>
        </div>
      </div>
    </section>
  );
}
