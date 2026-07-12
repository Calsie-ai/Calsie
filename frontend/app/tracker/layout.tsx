import type { ReactNode } from "react";
import "./tracker-sheet.css";
import "./tracker-polish.css";
import "./tracker-compact.css";
import "./tracker-responsive.css";
import "./tracker-scroll-controls.css";
import "./tracker-final.css";
import TrackerBulkApprove from "./TrackerBulkApprove";
import TrackerHorizontalScroll from "./TrackerHorizontalScroll";

export default function TrackerLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <TrackerBulkApprove />
      <TrackerHorizontalScroll />
    </>
  );
}
