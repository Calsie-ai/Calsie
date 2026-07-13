import type { ReactNode } from "react";
import "./globals.css";
import "./resume-status-overrides.css";
import "./campaign-actions-overrides.css";
import "./tracker-theme-overrides.css";
import "./brand-colors.css";
import "./outrun-background.css";
import "./landing-editorial.css";
import "./landing-centered.css";
import "./dashboard-editorial.css";
import "./dashboard-template-overrides.css";
import "./dashboard-template-browser.css";
import "./tracker-editorial.css";
import "./auth-theme.css";
import "./admin-theme.css";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
