"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CAMPAIGN_PLAN, CAMPAIGN_TEMPLATES, campaignLocation, campaignRole, type CampaignRecord, type CampaignTemplate, type WorkspaceTab } from "./workspace-data";

export default function WorkspacePanels({ active, campaign, resumeReady, resumeName, gmailReady, busy, message, onUseTemplate, onResumeUpload, onConnectGmail, onToggleCampaign }: {
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
}) {
  const [query, setQuery] = useState("");
  const templates = useMemo(() => CAMPAIGN_TEMPLATES.filter((item) => `${item.title} ${item.role} ${item.category}`.toLowerCase().includes(query.toLowerCase())), [query]);
  const status = campaign?.status || "Not configured";

  if (active === "templates") return <section><header><p>Templates</p><h1>Browse templates</h1><span>Search and use a ready-made campaign without leaving the dashboard.</span></header><input className="workspace-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search templates or job roles" /><div className="workspace-template-grid">{templates.map((item) => <article key={item.id}><small>{item.category}</small><h3>{item.title}</h3><p>{item.description}</p><button onClick={() => onUseTemplate(item)} disabled={busy}>Use template</button></article>)}</div></section>;

  if (active === "resume") return <section><header><p>Resume</p><h1>Update resume</h1><span>Keep the current resume Applix attaches to approved applications.</span></header><div className="workspace-card"><h3>{resumeReady ? "Resume ready" : "Resume required"}</h3><p>{resumeReady ? resumeName || "Resume saved" : "Upload a PDF, DOC, or DOCX file."}</p><label className="workspace-primary">{busy ? "Working..." : "Upload or replace resume"}<input hidden type="file" accept=".pdf,.doc,.docx" onChange={(e) => e.target.files?.[0] && onResumeUpload(e.target.files[0])} /></label><Link href="/resume-canvas">Open resume editor</Link></div></section>;

  if (active === "gmail") return <section><header><p>Connection</p><h1>Gmail connection</h1><span>Connect the Gmail account Applix will use for approved applications.</span></header><div className="workspace-card"><h3>{gmailReady ? "Gmail connected" : "Gmail disconnected"}</h3><p>{gmailReady ? "Applix can prepare approved sends through your connected account." : "Connect Gmail before starting a campaign."}</p><button className="workspace-primary" onClick={onConnectGmail} disabled={busy || gmailReady}>{gmailReady ? "Connected" : "Connect Gmail"}</button></div></section>;

  if (active === "campaign") return <section><header><p>Campaign</p><h1>Set up campaign</h1><span>Use the fixed controlled production plan.</span></header><div className="workspace-plan"><div><b>24</b><span>jobs per day</span></div><div><b>1</b><span>approved email per hour</span></div><div><b>30</b><span>campaign days</span></div><div><b>720</b><span>maximum applications</span></div></div><div className="workspace-card"><h3>{campaign?.name || "No campaign selected"}</h3><p>{campaign ? `${campaignRole(campaign)} · ${campaignLocation(campaign)}` : "Choose a template or create a custom campaign."}</p><div className="workspace-actions"><Link className="workspace-secondary" href="/campaign/new">Custom campaign</Link><button className="workspace-primary" onClick={onToggleCampaign} disabled={busy || !campaign}>{status === "active" || status === "launched" || status === "scheduled" ? "Pause Campaign" : "Start Campaign"}</button></div></div></section>;

  if (active === "tracker") return <section><header><p>Tracker</p><h1>Application tracker</h1><span>Review prepared, approved, scheduled, sent, and failed applications.</span></header><div className="workspace-plan"><div><b>0 / 24</b><span>sent today</span></div><div><b>0 / 720</b><span>campaign total</span></div><div><b>{status}</b><span>campaign status</span></div></div><Link className="workspace-primary inline" href="/tracker">Open full tracker</Link></section>;

  return <section><header><p>Workspace</p><h1>Welcome back</h1><span>Your Applix control centre.</span></header>{message && <div className="workspace-message">{message}</div>}<div className="workspace-plan"><div><b>{resumeReady ? "Ready" : "Missing"}</b><span>resume</span></div><div><b>{gmailReady ? "Connected" : "Disconnected"}</b><span>Gmail</span></div><div><b>{status}</b><span>campaign</span></div><div><b>{CAMPAIGN_PLAN.hourly_email_limit}/hour</b><span>send limit</span></div></div><div className="workspace-card"><h3>{campaign?.name || "Set up your first campaign"}</h3><p>{campaign ? `${campaignRole(campaign)} · ${campaignLocation(campaign)}` : "Browse templates, upload your resume, connect Gmail, and start."}</p><button className="workspace-primary" onClick={onToggleCampaign} disabled={busy || !campaign}>{status === "active" || status === "launched" || status === "scheduled" ? "Pause Campaign" : "Start Campaign"}</button></div></section>;
}
