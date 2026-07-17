import { Suspense, type ReactNode } from "react";
import "./tracker-sheet.css";
import "./tracker-polish.css";
import "./tracker-compact.css";
import "./tracker-responsive.css";
import "./tracker-scroll-controls.css";
import "./tracker-final.css";
import "./tracker-zoom-final.css";
import "./tracker-request-fixes.css";
import TrackerBulkApprove from "./TrackerBulkApprove";
import TrackerSheetZoom from "./TrackerSheetZoom";

export default function TrackerLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<main aria-busy="true" aria-label="Loading application tracker" />}>
      {children}
      <TrackerBulkApprove />
      <TrackerSheetZoom />
    </Suspense>
  );
}
