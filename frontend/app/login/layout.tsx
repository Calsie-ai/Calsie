import type { ReactNode } from "react";

/* The `applix-auth-scope` wrapper pulled in auth-theme.css, which forces a pink
   palette with !important and would override the Calsie Jobs design system this
   page now uses. No other route references that class, so the login page renders
   unscoped and styles itself entirely via login-theme.css. */
export default function LoginLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
