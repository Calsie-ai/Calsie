import type { ReactNode } from "react";
// This preview route renders the same sidebar/overview components as the
// real dashboard but lives outside app/dashboard/, so it never picked up
// dashboard/layout.tsx's stylesheet imports — it was rendering completely
// unstyled. Mirror the same imports so this page is actually representative
// of the real, authenticated dashboard.
import "../dashboard/workspace.css";
import "../dashboard/workspace-contrast.css";
import "../dashboard/workspace-tracker.css";
import "../dashboard/workspace-final.css";
import "../dashboard/workspace-macos-theme.css";

export default function DashboardDesignLayout({ children }: { children: ReactNode }) {
  return children;
}
