import Link from "next/link";
import type { ReactNode } from "react";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="applix-admin-scope">
      <nav style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", padding: "14px 24px", borderBottom: "1px solid #ddd", background: "#fff", fontFamily: "Arial, Helvetica, sans-serif" }} aria-label="Admin navigation">
        <strong style={{ marginRight: 8 }}>Calsie Admin</strong>
        <Link href="/admin">Templates</Link>
        <Link href="/admin/pricing">Pricing & features</Link>
        <Link href="/dashboard">User dashboard</Link>
      </nav>
      {children}
    </div>
  );
}
