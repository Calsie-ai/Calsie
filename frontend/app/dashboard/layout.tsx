import type { ReactNode } from "react";
import DashboardTemplateBrowser from "../components/DashboardTemplateBrowser";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <DashboardTemplateBrowser />
    </>
  );
}
