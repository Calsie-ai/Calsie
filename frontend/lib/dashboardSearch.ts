// Pure matching/ranking logic for the dashboard's ⌘K search. No React and
// no Supabase here so it can be unit-tested directly (see
// tests/dashboardSearch.test.mts), matching how dashboardNavigation.ts and
// pendingIntent.ts are structured.

import type { WorkspaceTab } from "../app/dashboard/workspace-data";
// Explicit .ts extension so `node --experimental-strip-types --test` can
// resolve this value import — same convention as lib/pendingIntent.ts.
import { DASHBOARD_PANELS } from "./dashboardNavigation.ts";

export type SearchItemKind = "page" | "section" | "template";

export type SearchItem = {
  id: string;
  kind: SearchItemKind;
  label: string;
  sublabel?: string;
  /** Extra words that should match this item but aren't in its label. */
  keywords: string[];
  panel: WorkspaceTab;
  /** Only set for templates — used to deep-link via ?template=<slug>. */
  templateSlug?: string;
};

export const SEARCH_RESULT_LIMIT = 8;

/** Label + search synonyms for each panel, keyed by the canonical tab id. */
const PANEL_META: Record<WorkspaceTab, { label: string; sublabel: string; keywords: string[] }> = {
  overview: {
    label: "Overview",
    sublabel: "Your job search at a glance",
    keywords: ["home", "dashboard", "summary", "status", "welcome"],
  },
  templates: {
    label: "Browse Templates",
    sublabel: "Pick a campaign template",
    keywords: ["campaign", "template", "browse", "pricing", "buy", "checkout"],
  },
  resume: {
    label: "Update Resume",
    sublabel: "Replace or preview your current resume",
    keywords: ["cv", "upload", "file", "pdf", "preview", "document"],
  },
  buildResume: {
    label: "Build Resume",
    sublabel: "Create a new ATS-friendly resume",
    keywords: ["cv", "create", "make", "new", "generate", "ats", "builder", "format"],
  },
  gmail: {
    label: "Gmail Connection",
    sublabel: "Connect the account Calsie sends from",
    keywords: ["google", "email", "connect", "oauth", "consent", "privacy", "mail"],
  },
  campaign: {
    label: "Set Up Campaign",
    sublabel: "Start, pause and configure your campaign",
    keywords: ["start", "pause", "resume", "schedule", "limits", "plan", "run"],
  },
  approve: {
    label: "Smash or Pass",
    sublabel: "Review matched jobs",
    keywords: ["approve", "review", "queue", "decide", "jobs", "matches", "smash", "pass"],
  },
  tracker: {
    label: "Application Tracker",
    sublabel: "Jobs you have smashed",
    keywords: ["applications", "history", "sent", "applied", "progress", "tracking"],
  },
  profile: {
    label: "Profile",
    sublabel: "Your account, preferences and support",
    keywords: [
      "account", "me", "my details", "settings", "preferences", "avatar", "photo",
      "picture", "name", "phone", "location", "theme", "appearance", "dark mode",
      "sign out", "log out", "logout", "support", "help", "contact", "policy",
    ],
  },
};

// Built from the canonical DASHBOARD_PANELS list rather than a second
// hand-maintained array, so a newly added panel cannot silently go missing
// from search. The test suite asserts every panel resolves to an item.
export const DASHBOARD_PAGE_ITEMS: SearchItem[] = DASHBOARD_PANELS.map((panel) => ({
  id: `page:${panel}`,
  kind: "page" as const,
  label: PANEL_META[panel].label,
  sublabel: PANEL_META[panel].sublabel,
  keywords: PANEL_META[panel].keywords,
  panel,
}));

// Named things *inside* a panel. Selecting one opens its panel — these are
// findable labels, not deep links into wizard state.
export const DASHBOARD_SECTION_ITEMS: SearchItem[] = [
  { id: "section:personal", kind: "section", label: "Personal Details", sublabel: "Build Resume", keywords: ["name", "email", "phone", "address", "contact"], panel: "buildResume" },
  { id: "section:role", kind: "section", label: "Target Role", sublabel: "Build Resume", keywords: ["industry", "job title", "headline", "specialisation"], panel: "buildResume" },
  { id: "section:experience", kind: "section", label: "Work Experience", sublabel: "Build Resume", keywords: ["employment", "job history", "employer", "duties"], panel: "buildResume" },
  { id: "section:education", kind: "section", label: "Education", sublabel: "Build Resume", keywords: ["qualification", "study", "school", "tafe", "degree"], panel: "buildResume" },
  { id: "section:certifications", kind: "section", label: "Certifications & Licences", sublabel: "Build Resume", keywords: ["licence", "license", "police check", "ndis", "first aid", "ticket"], panel: "buildResume" },
  { id: "section:skills", kind: "section", label: "Skills", sublabel: "Build Resume", keywords: ["abilities", "strengths", "keywords"], panel: "buildResume" },
  { id: "section:references", kind: "section", label: "References", sublabel: "Build Resume", keywords: ["referee", "referees", "contacts"], panel: "buildResume" },
  { id: "section:review", kind: "section", label: "Review & Generate", sublabel: "Build Resume", keywords: ["download", "pdf", "export", "generate", "finish"], panel: "buildResume" },
  { id: "section:resume-format", kind: "section", label: "Resume Format", sublabel: "Build Resume", keywords: ["template", "style", "design", "professional", "academic", "ats"], panel: "buildResume" },

  { id: "section:resume-upload", kind: "section", label: "Upload Resume", sublabel: "Update Resume", keywords: ["replace", "file", "attach", "docx", "pdf"], panel: "resume" },
  { id: "section:resume-preview", kind: "section", label: "Resume Preview", sublabel: "Update Resume", keywords: ["view", "open", "current resume"], panel: "resume" },

  { id: "section:privacy", kind: "section", label: "Privacy Policy", sublabel: "Gmail Connection", keywords: ["data", "information", "gdpr", "handling", "policy"], panel: "gmail" },
  { id: "section:consent", kind: "section", label: "Consent", sublabel: "Gmail Connection", keywords: ["agree", "permission", "authorise", "authorize", "checkbox"], panel: "gmail" },
  { id: "section:connect-google", kind: "section", label: "Connect Google", sublabel: "Gmail Connection", keywords: ["oauth", "sign in", "link account", "revoke", "disconnect"], panel: "gmail" },

  { id: "section:campaign-plan", kind: "section", label: "Campaign Plan & Limits", sublabel: "Set Up Campaign", keywords: ["jobs per day", "send limit", "hourly", "cap", "days"], panel: "campaign" },
  { id: "section:campaign-controls", kind: "section", label: "Start or Pause Campaign", sublabel: "Set Up Campaign", keywords: ["start", "pause", "stop", "resume", "find jobs"], panel: "campaign" },

  { id: "section:account-details", kind: "section", label: "Account Details", sublabel: "Profile", keywords: ["full name", "phone", "location", "email", "edit profile", "member since"], panel: "profile" },
  { id: "section:profile-photo", kind: "section", label: "Profile Photo", sublabel: "Profile", keywords: ["avatar", "picture", "image", "upload photo", "headshot"], panel: "profile" },
  { id: "section:profile-strength", kind: "section", label: "Profile Strength", sublabel: "Profile", keywords: ["completeness", "checklist", "setup", "progress", "percent"], panel: "profile" },
  { id: "section:appearance", kind: "section", label: "Appearance", sublabel: "Profile", keywords: ["theme", "dark mode", "light mode", "system", "colour", "color", "display"], panel: "profile" },
  { id: "section:connected-accounts", kind: "section", label: "Connected Accounts", sublabel: "Profile", keywords: ["google", "gmail", "linked", "disconnect", "revoke", "sending account"], panel: "profile" },
  { id: "section:legal", kind: "section", label: "Policies & Legal", sublabel: "Profile", keywords: ["privacy policy", "terms", "conditions", "data", "legal", "compliance"], panel: "profile" },
  { id: "section:support", kind: "section", label: "Support & Contact", sublabel: "Profile", keywords: ["help", "help centre", "help center", "contact us", "email us", "question", "issue"], panel: "profile" },
  { id: "section:signout", kind: "section", label: "Sign Out", sublabel: "Profile", keywords: ["log out", "logout", "exit", "leave", "sign off"], panel: "profile" },
];

/** Lowercase + strip accents so "cafe" matches "café". */
function normalise(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

// Higher is better. Ranks an exact label hit above a word-start hit above a
// mid-word substring, so typing "res" surfaces "Resume ..." before
// "Application Tracker" (which only matches inside a keyword).
function scoreText(haystack: string, needle: string, weight: number): number {
  const text = normalise(haystack);
  if (!text) return 0;
  if (text === needle) return 100 * weight;
  if (text.startsWith(needle)) return 70 * weight;
  // Word-boundary start, e.g. "resume" in "Build Resume".
  if (new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(text)) return 50 * weight;
  if (text.includes(needle)) return 25 * weight;
  return 0;
}

function scoreItem(item: SearchItem, needle: string): number {
  let best = scoreText(item.label, needle, 1);
  best = Math.max(best, scoreText(item.sublabel || "", needle, 0.5));
  for (const keyword of item.keywords) {
    best = Math.max(best, scoreText(keyword, needle, 0.6));
  }
  return best;
}

/**
 * Ranked matches for `query`. A blank query returns [] — the palette shows
 * nothing until the user actually types, rather than dumping every item.
 */
export function searchDashboard(query: string, items: SearchItem[], limit = SEARCH_RESULT_LIMIT): SearchItem[] {
  const needle = normalise(query);
  if (!needle) return [];

  const scored: Array<{ item: SearchItem; score: number; index: number }> = [];
  items.forEach((item, index) => {
    const score = scoreItem(item, needle);
    if (score > 0) scored.push({ item, score, index });
  });

  scored.sort((a, b) => (b.score - a.score) || (a.index - b.index));
  return scored.slice(0, limit).map((entry) => entry.item);
}

/** Stable, human-readable group headings for the result list. */
export const SEARCH_GROUP_LABELS: Record<SearchItemKind, string> = {
  page: "Pages",
  section: "Sections",
  template: "Templates",
};
