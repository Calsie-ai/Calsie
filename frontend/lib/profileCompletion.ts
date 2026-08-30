// Pure logic for the dashboard profile screen's "Profile strength" meter.
// No React and no Supabase here so it can be unit-tested directly (see
// tests/profileCompletion.test.mts), matching how dashboardSearch.ts,
// dashboardNavigation.ts and pendingIntent.ts are structured.

import type { WorkspaceTab } from "../app/dashboard/workspace-data";

export type ProfileChecklistItem = {
  id: string;
  label: string;
  /** Why it matters — shown under the label when the item is outstanding. */
  hint: string;
  done: boolean;
  /**
   * Required items are the ones that actually block the campaign from
   * running. DashboardWorkspace enforces exactly these three before it will
   * enable Start Campaign (resume + Gmail + a campaign), so the meter is
   * describing real gating, not an invented score.
   */
  required: boolean;
  /** Where the user goes to complete it. */
  panel: WorkspaceTab;
};

export type ProfileSignals = {
  fullName?: string | null;
  phone?: string | null;
  location?: string | null;
  avatarUrl?: string | null;
  targetRole?: string | null;
  profileSummary?: string | null;
  skillsCount?: number;
  experienceCount?: number;
  resumeReady?: boolean;
  gmailReady?: boolean;
  hasCampaign?: boolean;
};

/** Treats whitespace-only strings as empty — " " is not a filled field. */
function filled(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * The checklist, in the order it should be shown and worked through:
 * blocking items first, then the details that improve match quality.
 */
export function buildProfileChecklist(signals: ProfileSignals): ProfileChecklistItem[] {
  return [
    {
      id: "resume",
      label: "Add your resume",
      hint: "Calsie attaches this to every approved application.",
      done: Boolean(signals.resumeReady),
      required: true,
      panel: "resume",
    },
    {
      id: "gmail",
      label: "Connect Gmail",
      hint: "Applications are sent from your own account, with your approval.",
      done: Boolean(signals.gmailReady),
      required: true,
      panel: "gmail",
    },
    {
      id: "campaign",
      label: "Choose a campaign template",
      hint: "Sets the roles and locations Calsie searches for you.",
      done: Boolean(signals.hasCampaign),
      required: true,
      panel: "templates",
    },
    {
      id: "name",
      label: "Add your full name",
      hint: "Used on your resume and in application emails.",
      done: filled(signals.fullName),
      required: false,
      panel: "profile",
    },
    {
      id: "phone",
      label: "Add a contact number",
      hint: "Employers reply to shortlisted applicants by phone.",
      done: filled(signals.phone),
      required: false,
      panel: "profile",
    },
    {
      id: "location",
      label: "Set your location",
      hint: "Improves how closely matched jobs are to you.",
      done: filled(signals.location),
      required: false,
      panel: "profile",
    },
    {
      id: "photo",
      label: "Add a profile photo",
      hint: "Personalises your workspace. Never sent to employers.",
      done: filled(signals.avatarUrl),
      required: false,
      panel: "profile",
    },
    {
      id: "target-role",
      label: "Set your target role",
      hint: "Tells the matching engine which jobs to score highest.",
      done: filled(signals.targetRole),
      required: false,
      panel: "buildResume",
    },
    {
      id: "summary",
      label: "Write a profile summary",
      hint: "The opening section recruiters read first.",
      done: filled(signals.profileSummary),
      required: false,
      panel: "buildResume",
    },
    {
      id: "experience",
      label: "Add work experience",
      hint: "At least one role, so applications carry real history.",
      done: (signals.experienceCount ?? 0) > 0,
      required: false,
      panel: "buildResume",
    },
    {
      id: "skills",
      label: "List your skills",
      hint: "Keyword matches are what get a resume past ATS filters.",
      done: (signals.skillsCount ?? 0) > 0,
      required: false,
      panel: "buildResume",
    },
  ];
}

export type ProfileStrength = {
  done: number;
  total: number;
  /** 0–100, rounded. */
  percent: number;
  /** Outstanding blocking items, in checklist order. */
  missingRequired: ProfileChecklistItem[];
  /** Outstanding items overall, in checklist order. */
  outstanding: ProfileChecklistItem[];
  /** True once every blocking item is satisfied. */
  campaignReady: boolean;
};

export function profileStrength(items: ProfileChecklistItem[]): ProfileStrength {
  const total = items.length;
  const done = items.filter((item) => item.done).length;
  const outstanding = items.filter((item) => !item.done);
  const missingRequired = outstanding.filter((item) => item.required);
  return {
    done,
    total,
    percent: total === 0 ? 0 : Math.round((done / total) * 100),
    missingRequired,
    outstanding,
    campaignReady: missingRequired.length === 0,
  };
}

/** Short human label for the meter, e.g. "Getting started" / "Complete". */
export function profileStrengthLabel(percent: number): string {
  if (percent >= 100) return "Complete";
  if (percent >= 75) return "Strong";
  if (percent >= 45) return "Getting there";
  return "Just started";
}
