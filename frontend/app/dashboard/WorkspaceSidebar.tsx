"use client";

import type { WorkspaceTab } from "./workspace-data";

const primary: Array<[WorkspaceTab, string, string]> = [
  ["overview", "Overview", "⌂"],
  ["templates", "Browse Templates", "⌕"],
  ["resume", "Update Resume", "↥"],
  ["gmail", "Gmail Connection", "✉"],
];

type Props = {
  active: WorkspaceTab;
  onNavigate: (tab: WorkspaceTab) => void;
  running: boolean;
  approvedCount: number;
  actionLoading: boolean;
  actionDisabled: boolean;
  onToggleCampaign: () => void;
  logoutLoading: boolean;
  onLogout: () => void;
};

export default function WorkspaceSidebar({
  active,
  onNavigate,
  running,
  approvedCount,
  actionLoading,
  actionDisabled,
  onToggleCampaign,
  logoutLoading,
  onLogout,
}: Props) {
  const campaign: Array<[WorkspaceTab, string, string]> = [
    ["campaign", "Set Up Campaign", "+"],
    ["approve", "SMASH OR PASS", "✓"],
    ["tracker", `Application Tracker${approvedCount ? ` (${approvedCount})` : ""}`, "◎"],
  ];

  const navButton = ([tab, label, icon]: [WorkspaceTab, string, string]) => (
    <button type="button" key={tab} className={active === tab ? "is-active" : ""} onClick={() => onNavigate(tab)}>
      <span>{icon}</span>
      <b>
        {tab === "approve" ? (
          <>
            <i style={{ color: "#ff5575", fontStyle: "normal" }}>SMASH</i>{" "}
            <i style={{ color: "#ffffff", fontStyle: "normal" }}>OR PASS</i>
          </>
        ) : label}
      </b>
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
      <button type="button" className="workspace-campaign-toggle" disabled={actionDisabled} onClick={onToggleCampaign}>
        {actionLoading ? (running ? "Pausing campaign…" : "Starting campaign…") : running ? "Pause Campaign" : "Start Campaign"}
      </button>
      <div className="workspace-sidebar-bottom">
        <button type="button" onClick={() => window.location.assign("/support")}><span>?</span><b>Help</b></button>
        <button type="button" disabled={logoutLoading} onClick={onLogout}><span>↪</span><b>{logoutLoading ? "Logging out…" : "Log out"}</b></button>
      </div>
    </aside>
  );
}
