import type { CSSProperties, ReactNode } from "react";

const adminScopeStyle: CSSProperties = {
  minHeight: "100vh",
  background: "#f4f7fb",
  color: "#111827",
  colorScheme: "light",
  isolation: "isolate",
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <div style={adminScopeStyle}>{children}</div>;
}
