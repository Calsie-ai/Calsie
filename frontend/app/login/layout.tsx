import type { ReactNode } from "react";

export default function LoginLayout({ children }: { children: ReactNode }) {
  return <div className="applix-auth-scope">{children}</div>;
}
