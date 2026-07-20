"use client";

import type { WorkspaceTab } from "./workspace-data";

const primary: Array<[WorkspaceTab, string, string]> = [
  ["overview", "Overview", "⌂"],
  ["templates", "Browse Templates", "⌕"],
  ["resume", "Update Resume", "↥"],
  ["gmail", "Gmail Connection", "✉"],
];

export default function WorkspaceSidebar({
  active,
  setActive,
  running,
  approvedCount,
  onToggleCampaign,
  onLogout,
}: {
  active: WorkspaceTab;
  setActive: (tab: WorkspaceTab) => void;
  running: boolean;
  approvedCount: number;
  onToggleCampaign: () => void;
  onLogout: () => void;
}) {
  const campaign: Array<[WorkspaceTab, string, string]> = [
    ["campaign", "Set Up Campaign", "+"],
    ["approve", "Approve Jobs", "✓"],
    ["tracker", `Application Tracker${approvedCount ? ` (${approvedCount})` : ""}`, "◎"],
  ];

  const navButton = ([tab, label, icon]: [WorkspaceTab, string, string]) => (
    <button key={tab} className={active === tab ? "is-active" : ""} onClick={() => setActive(tab)}>
      <span>{icon}</span><b>{label}</b>
    </button>
  );

  return (
    <aside className="workspace-sidebar">
      <div className="workspace-brand" aria-label="Calsie Jobs">
        <img src="/applix-logo.svg" alt="" />
        <strong>Calsie | Jobs</strong>
      </div>
      <p className="workspace-label">Workspace</p>
      <nav>{primary.map(navButton)}</nav>
      <p className="workspace-label">Campaign</p>
      <nav>{campaign.map(navButton)}</nav>
      <button className="workspace-campaign-toggle" onClick={onToggleCampaign}>{running ? "Pause Campaign" : "Start Campaign"}</button>
      <div className="workspace-sidebar-bottom">
        <button onClick={() => window.location.assign("/support")}><span>?</span><b>Help</b></button>
        <button onClick={onLogout}><span>↪</span><b>Log out</b></button>
      </div>
    </aside>
  );
}
