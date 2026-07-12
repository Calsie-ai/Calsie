import type { ReactNode } from "react";
import "./tracker-sheet.css";
import "./tracker-polish.css";
import "./tracker-compact.css";
import "./tracker-responsive.css";
import TrackerBulkApprove from "./TrackerBulkApprove";

export default function TrackerLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <TrackerBulkApprove />
    </>
  );
}
