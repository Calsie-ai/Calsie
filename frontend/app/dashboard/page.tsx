import { Suspense } from "react";
import DashboardWorkspace from "./DashboardWorkspace";

function DashboardLoading() {
  return (
    <main className="applix-workspace" aria-live="polite" aria-busy="true">
      <p role="status" style={{ margin: "auto" }}>Restoring your workspace…</p>
    </main>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardLoading />}>
      <DashboardWorkspace />
    </Suspense>
  );
}

