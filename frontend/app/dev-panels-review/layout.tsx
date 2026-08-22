import type { ReactNode } from "react";
import "../dashboard/workspace.css";
import "../dashboard/workspace-contrast.css";
import "../dashboard/workspace-tracker.css";
import "../dashboard/workspace-final.css";
import "../dashboard/workspace-macos-theme.css";

export default function DevLayout({ children }: { children: ReactNode }) {
  return (
    <main className="applix-workspace">
      <div className="workspace-main">{children}</div>
    </main>
  );
}
