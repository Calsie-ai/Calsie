"use client";

import { useEffect, useMemo, useState } from "react";
import OverviewDashboard from "../dashboard/OverviewDashboard";
import ProfilePanel from "../dashboard/ProfilePanel";
import WorkspaceSidebar from "../dashboard/WorkspaceSidebar";
import WorkspaceTopbar from "../dashboard/WorkspaceTopbar";
import WorkspacePanels from "../dashboard/WorkspacePanels";
import type { CampaignRecord, CampaignTemplate, WorkspaceTab } from "../dashboard/workspace-data";
import { createActionStateMap, DASHBOARD_ACTION_KEYS } from "../../lib/actionState";
import styles from "../tracker/tracker.module.css";

const MOCK_CAMPAIGN: CampaignRecord = {
  id: "design-preview-campaign",
  name: "Disability Support Worker Campaign",
  location: "Sydney NSW",
  target_business_type: "Disability Support Worker",
  search: { target_role: "Disability Support Worker", target_location: "Sydney NSW" },
  outreach: { active: true, scheduled: true },
  status: "active",
  created_at: new Date().toISOString(),
};

const MOCK_ROWS = [
  ["85", "Support Worker - Northern Beaches", "Catholic Healthcare", "Dee Why NSW", "Waiting"],
  ["82", "Personal Care Worker", "Santa Clara Home Care", "Drummoyne NSW", "Smashed"],
  ["80", "Community Support Worker", "Alliance Health", "Prospect NSW", "Waiting"],
  ["78", "Aged Care Support Worker", "El Finlay Care", "Chester Hill NSW", "Smashed"],
  ["76", "Disability Support Worker", "CareBridge Group", "Bankstown NSW", "Waiting"],
];
const MOCK_ACTION_STATES = createActionStateMap(DASHBOARD_ACTION_KEYS);

const MOCK_PROFILE = {
  full_name: "Sanjaya Rajbhandari",
  email: "design-preview@calsie.jobs",
  phone: "0400 123 456",
  location: "Sydney NSW",
  avatar_url: null,
  preferences: {},
  created_at: "2026-02-11T00:00:00.000Z",
};

// A real Google avatar URL shape, for previewing the default-photo state.
const MOCK_GOOGLE_AVATAR = "https://lh3.googleusercontent.com/a/ACg8ocL6YS1Byl1Q3K6AxL3UJ3h9L61n2vcV_g2bb_Mz9QbBoxIYqQ=s96-c";

const MOCK_RESUME_SIGNALS = {
  targetRole: "Disability Support Worker",
  profileSummary: "Experienced support worker.",
  skillsCount: 6,
  experienceCount: 2,
};

function DesignTracker() {
  const [rows, setRows] = useState(MOCK_ROWS);
  const approved = rows.filter((row) => row[4] === "Smashed").length;
  const waiting = rows.length - approved;
  function decide(index: number, decision: "Smashed" | "Passed") {
    if (decision === "Passed") { setRows((current) => current.filter((_, rowIndex) => rowIndex !== index)); return; }
    setRows((current) => current.map((row, rowIndex) => rowIndex === index ? [...row.slice(0, 4), "Smashed"] : row));
  }
  return <section className="workspace-tracker-section"><header className="workspace-tracker-heading"><div><p>AI mission control</p><h1>Application tracker</h1><span>Design preview with mock data only.</span></div><span className="workspace-status-pill is-running"><i /> Campaign running</span></header><div className={styles.summary}><div className={styles.summaryCard}><span>Jobs awaiting review</span><strong>{waiting}</strong></div><div className={styles.summaryCard}><span>Approved tracker</span><strong>{approved}</strong></div><div className={styles.summaryCard}><span>Application history</span><strong>210</strong></div></div><div className={styles.tabs}><button className={`${styles.tab} ${styles.activeTab}`}>Review & Tracker</button><button className={styles.tab}>Application History</button></div><div className={styles.toolbar}><span className={styles.toolbarLabel}>{waiting} waiting · {approved} approved</span><span className={styles.toolbarLabel}>Mock design mode</span></div><div className={styles.sheetWrap}><table className={styles.sheet}><thead><tr><th className={styles.rowNumber}>#</th><th className={styles.scoreColumn}>AI score</th><th className={styles.titleColumn}>Job title</th><th className={styles.companyColumn}>Company</th><th className={styles.locationColumn}>Location</th><th className={styles.actionColumn}>Your move</th></tr></thead><tbody>{rows.map((row, index) => { const smashed = row[4] === "Smashed"; return <tr key={`${row[1]}-${index}`} className={smashed ? styles.approvedRow : ""}><td className={styles.rowNumber}>{index + 1}</td><td><span className={styles.score}>{row[0]}</span></td><td className={styles.titleCell}><strong>{row[1]}</strong><small>Mock job description for visual editing.</small></td><td className={styles.companyCell}><strong>{row[2]}</strong><small>Design preview</small></td><td>{row[3]}</td><td>{smashed ? <span className={styles.approvedBadge}>✓ Smashed</span> : <div className={styles.actions}><button className={styles.skip} onClick={() => decide(index, "Passed")}>Pass</button><button className={styles.approve} onClick={() => decide(index, "Smashed")}>Smash</button></div>}</td></tr>; })}</tbody></table></div></section>;
}

export default function DashboardDesignPage() {
  const [active, setPreviewPanel] = useState<WorkspaceTab>("overview");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [campaign, setCampaign] = useState<CampaignRecord>(MOCK_CAMPAIGN);
  const [message, setMessage] = useState("Design mode: no production actions will run.");
  const approvedCount = 127;
  const passedCount = 93;
  const actionStates = MOCK_ACTION_STATES;

  // Lets the profile panel's loading and Google-photo states be previewed:
  // /dashboard-design?profile=loading and ?profile=google. Read from
  // location rather than useSearchParams so this page stays statically
  // prerendered (useSearchParams would force it dynamic).
  const [profileVariant, setProfileVariant] = useState("");
  useEffect(() => {
    setProfileVariant(new URLSearchParams(window.location.search).get("profile") || "");
  }, []);

  const panel = useMemo(() => {
    if (active === "overview") return <OverviewDashboard campaign={campaign} resumeReady resumeName="User Resume Name Here" gmailReady approvedCount={approvedCount} passedCount={passedCount} greetingName="Sanjaya" onOpenTracker={() => setPreviewPanel("tracker")} onBrowseTemplates={() => setPreviewPanel("templates")} onUpdateResume={() => setPreviewPanel("resume")} onConnectGmail={() => setPreviewPanel("gmail")} onSetUpCampaign={() => setPreviewPanel("campaign")} />;
    if (active === "tracker") return <DesignTracker />;
    // The panel reads no data itself — everything below is passed in, so this
    // preview makes no network calls. The uuid is only used for write paths
    // (photo upload, preference saves), which RLS rejects in design mode.
    if (active === "profile") return <ProfilePanel userId="00000000-0000-4000-8000-000000000000" email="design-preview@calsie.jobs" memberSince="2026-02-11T00:00:00.000Z" emailConfirmed profile={MOCK_PROFILE} profileResumeSignals={MOCK_RESUME_SIGNALS} profileLoading={profileVariant === "loading"} googleAvatarUrl={profileVariant === "google" ? MOCK_GOOGLE_AVATAR : null} uploadedAvatarUrl="" campaign={campaign} purchasedTemplate={null} resumeReady resumeName="Sajan-Giri-Resume.pdf" gmailReady approvedCount={approvedCount} passedCount={passedCount} actionStates={actionStates} onNavigate={setPreviewPanel} onToggleCampaign={() => setCampaign((current) => ({ ...current, status: current.status === "active" ? "paused" : "active" }))} onConnectGmail={() => setMessage("Mock Gmail connection clicked.")} onRevokeGmail={() => setMessage("Mock Gmail connection revoked.")} onLogout={() => setMessage("Mock logout clicked.")} onProfileChange={() => {}} />;
    return <WorkspacePanels active={active} campaign={campaign} resumeReady resumeName="Sajan-Giri-Resume.pdf" gmailReady actionStates={actionStates} selectedTemplateActionId="" onUseTemplate={(template: CampaignTemplate) => { setCampaign({ ...MOCK_CAMPAIGN, name: `${template.title} Campaign`, location: template.location, target_business_type: template.role }); setMessage("Mock campaign updated for design preview."); setPreviewPanel("campaign"); }} onResumeUpload={async () => { setMessage("Mock resume upload clicked."); }} onConnectGmail={() => setMessage("Mock Gmail connection clicked.")} onRevokeGmail={() => setMessage("Mock Gmail connection revoked.")} onToggleCampaign={() => setCampaign((current) => ({ ...current, status: current.status === "active" ? "paused" : "active" }))} onFindJobsNow={() => setMessage("Mock job search completed.")} />;
  }, [active, campaign, message, profileVariant]);

  return <main className={`applix-workspace${sidebarCollapsed ? " is-sidebar-collapsed" : ""}`}><WorkspaceSidebar active={active} onNavigate={setPreviewPanel} running={campaign.status === "active"} approvedCount={approvedCount} actionLoading={false} actionDisabled={false} onToggleCampaign={() => setCampaign((current) => ({ ...current, status: current.status === "active" ? "paused" : "active" }))} logoutLoading={false} onLogout={() => setMessage("Mock logout clicked.")} displayName="Sanjaya Rajbhandari" email="design-preview@calsie.jobs" initial="S" profileActive={active === "profile"} onOpenProfile={() => setPreviewPanel("profile")} collapsed={sidebarCollapsed} onToggleCollapsed={() => setSidebarCollapsed((value) => !value)} /><div className="workspace-main"><WorkspaceTopbar displayName="Sanjaya Rajbhandari" initial="S" onOpenProfile={() => setPreviewPanel("profile")} onNavigate={setPreviewPanel} onOpenTemplate={() => {}} />{panel}</div></main>;
}
