import type { WorkspaceTab } from "../app/dashboard/workspace-data";

export const DEFAULT_DASHBOARD_PANEL: WorkspaceTab = "overview";

export const DASHBOARD_PANELS = [
  "overview",
  "templates",
  "resume",
  "buildResume",
  "gmail",
  "campaign",
  "approve",
  "tracker",
] as const satisfies readonly WorkspaceTab[];

export const DASHBOARD_ONE_TIME_PARAMS = [
  "restoreIntent",
  "payment",
  "session_id",
  "template",
  "postcode",
  "gmail",
  "reason",
] as const;

type DashboardOneTimeParam = (typeof DASHBOARD_ONE_TIME_PARAMS)[number];

type SearchParamsReader = {
  get(name: string): string | null;
};

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const CHECKOUT_SESSION_PATTERN = /^[A-Za-z0-9_]{8,200}$/;
const GMAIL_REASON_PATTERN = /^[a-z_]{3,40}$/;

const RETAINED_QUERY_PARAMS: ReadonlyArray<{
  name: DashboardOneTimeParam;
  isValid: (value: string) => boolean;
}> = [
  { name: "restoreIntent", isValid: (value) => value === "1" },
  { name: "payment", isValid: (value) => value === "success" || value === "cancelled" },
  { name: "session_id", isValid: (value) => CHECKOUT_SESSION_PATTERN.test(value) },
  { name: "template", isValid: (value) => IDENTIFIER_PATTERN.test(value) },
  { name: "postcode", isValid: (value) => /^\d{4}$/.test(value) },
  { name: "gmail", isValid: (value) => value === "connected" || value === "error" },
  { name: "reason", isValid: (value) => GMAIL_REASON_PATTERN.test(value) },
];

export function isDashboardPanel(value: unknown): value is WorkspaceTab {
  return typeof value === "string"
    && (DASHBOARD_PANELS as readonly string[]).includes(value);
}

export function parseDashboardPanel(value: string | null | undefined): WorkspaceTab {
  return isDashboardPanel(value) ? value : DEFAULT_DASHBOARD_PANEL;
}

export function dashboardPanelPath(
  panel: WorkspaceTab,
  current?: SearchParamsReader | null,
  options: { remove?: readonly DashboardOneTimeParam[] } = {},
) {
  const params = new URLSearchParams();
  params.set("panel", panel);
  const removed = new Set(options.remove || []);

  for (const retained of RETAINED_QUERY_PARAMS) {
    if (removed.has(retained.name)) continue;
    const value = current?.get(retained.name);
    if (value && retained.isValid(value)) params.set(retained.name, value);
  }

  return `/dashboard?${params.toString()}`;
}

export function canonicalDashboardPanelPath(current: SearchParamsReader) {
  if (isDashboardPanel(current.get("panel"))) return null;
  return dashboardPanelPath(DEFAULT_DASHBOARD_PANEL, current);
}

export function dashboardPathAfterProcessing(
  panel: WorkspaceTab,
  current: SearchParamsReader,
  processed: boolean,
  processedParams: readonly DashboardOneTimeParam[],
) {
  if (!processed) return null;
  return dashboardPanelPath(panel, current, { remove: processedParams });
}
