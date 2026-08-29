"use client";

import {
  BarChart3,
  ChevronDown,
  FileEdit,
  Flame,
  HelpCircle,
  Image as ImageIcon,
  LayoutGrid,
  Mail,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Power,
  Target,
  type LucideIcon,
} from "lucide-react";
import type { WorkspaceTab } from "./workspace-data";

const primary: Array<[WorkspaceTab, string, LucideIcon]> = [
  ["overview", "Overview", LayoutGrid],
  ["templates", "Browse Templates", ImageIcon],
  ["resume", "Update Resume", Pencil],
  ["buildResume", "Build Resume", FileEdit],
  ["gmail", "Gmail Connection", Mail],
];

type Props = {
  active: WorkspaceTab;
  onNavigate: (tab: WorkspaceTab) => void;
  running: boolean;
  approvedCount: number;
  actionLoading: boolean;
  actionDisabled: boolean;
  disabledReason?: string;
  onToggleCampaign: () => void;
  logoutLoading: boolean;
  onLogout: () => void;
  displayName: string;
  email: string;
  initial: string;
  collapsed: boolean;
  onToggleCollapsed: () => void;
};

export default function WorkspaceSidebar({
  active,
  onNavigate,
  running,
  approvedCount,
  actionLoading,
  actionDisabled,
  disabledReason,
  onToggleCampaign,
  logoutLoading,
  onLogout,
  displayName,
  email,
  initial,
  collapsed,
  onToggleCollapsed,
}: Props) {
  const campaign: Array<[WorkspaceTab, string, LucideIcon]> = [
    ["campaign", "Set Up Campaign", Target],
    ["approve", "Smash or Pass", Flame],
    ["tracker", `Application Tracker${approvedCount ? ` (${approvedCount})` : ""}`, BarChart3],
  ];

  const campaignToggleLabel = actionLoading
    ? (running ? "Pausing campaign…" : "Starting campaign…")
    : running ? "Pause Campaign" : "Start Campaign";

  // Collapsed to a rail the label is clipped away, so the native tooltip is
  // the only thing naming the target — always supply it there.
  const navButton = ([tab, label, Icon]: [WorkspaceTab, string, LucideIcon]) => {
    const isActive = active === tab;
    return (
      <button
        type="button"
        key={tab}
        className={isActive ? "is-active" : ""}
        aria-current={isActive ? "page" : undefined}
        title={collapsed ? label : undefined}
        onClick={() => onNavigate(tab)}
      >
        <Icon size={20} strokeWidth={1.7} />
        <b>{label}</b>
      </button>
    );
  };

  return (
    <aside className="workspace-sidebar">
      <div className="ws-sidebar-inner">
        <div className="ws-sidebar-head">
          {/* Deliberately NOT `.workspace-brand` — that legacy class carries
              padding/size rules in workspace.css plus a `display:none` on its
              text below 850px. Own class, no inherited baggage. */}
          <div className="ws-brand" aria-label="Calsie Jobs">
            <img className="ws-brand-logo" src="/applix-logo.svg" alt="" />
            <strong className="ws-brand-name">Calsie | Jobs</strong>
          </div>
          <button
            type="button"
            className="ws-collapse-toggle"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={onToggleCollapsed}
          >
            {collapsed ? <PanelLeftOpen size={17} strokeWidth={1.8} /> : <PanelLeftClose size={17} strokeWidth={1.8} />}
          </button>
        </div>

        <div className="ws-scroll">
          <div className="ws-group">
            <p className="workspace-label">Workspace</p>
            <nav>{primary.map(navButton)}</nav>
          </div>

          <div className="ws-group">
            <p className="workspace-label">Campaign</p>
            <nav>{campaign.map(navButton)}</nav>
          </div>

          <button
            type="button"
            className="workspace-campaign-toggle"
            disabled={actionDisabled}
            title={actionDisabled && disabledReason ? disabledReason : collapsed ? campaignToggleLabel : undefined}
            onClick={onToggleCampaign}
          >
            <Plus size={18} strokeWidth={2.4} />
            <b>{campaignToggleLabel}</b>
          </button>

          <div className="ws-group ws-group-help">
            <p className="workspace-label">Help</p>
            <nav>
              <button
                type="button"
                title={collapsed ? "Help Center" : undefined}
                onClick={() => window.location.assign("/support")}
              >
                <HelpCircle size={20} strokeWidth={1.7} />
                <b>Help Center</b>
              </button>
              <button
                type="button"
                disabled={logoutLoading}
                title={collapsed ? "Logout" : undefined}
                onClick={onLogout}
              >
                <Power size={20} strokeWidth={1.7} />
                <b>{logoutLoading ? "Logging out…" : "Logout"}</b>
              </button>
            </nav>
          </div>

          <div className="ws-profile" title={collapsed ? `${displayName} — ${email}` : email}>
            <span className="ws-profile-avatar" aria-hidden="true">{initial}</span>
            <span className="ws-profile-text">
              <strong>{displayName}</strong>
              <small>{email}</small>
            </span>
            <ChevronDown size={18} strokeWidth={2} aria-hidden="true" />
          </div>
        </div>
      </div>
    </aside>
  );
}
