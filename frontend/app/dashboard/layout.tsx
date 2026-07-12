import type { ReactNode } from "react";
import Link from "next/link";
import "./workspace.css";
import "./workspace-contrast.css";
import "./workspace-tracker.css";
import "./workspace-final.css";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <aside
        style={{
          margin: "14px auto 0",
          width: "min(1180px, calc(100% - 28px))",
          padding: "16px 18px",
          border: "1px solid rgba(17,17,17,0.16)",
          borderRadius: "14px",
          background: "#fff7f8",
          color: "#111",
          fontSize: "14px",
          lineHeight: 1.6,
        }}
        aria-label="Gmail privacy notice"
      >
        <strong>Gmail privacy notice:</strong> Applix requests Gmail Send permission only to send job applications you review and approve. It cannot read, search, modify or delete your existing inbox messages or access Gmail contacts. For additional privacy, use a new, unused or dedicated Gmail account for job applications rather than an account containing personal, financial, medical or other sensitive data. This is recommended, not required.{" "}
        <Link href="/privacy" style={{ fontWeight: 800, textDecoration: "underline" }}>Read the Privacy Policy</Link>.
      </aside>
      {children}
    </>
  );
}
