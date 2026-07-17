import type { Metadata } from "next";
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
import "./calsie-jobs-brand.css";
import "./canva-overview.css";
import "./template-browser-canva.css";

export const metadata: Metadata = {
  title: "Calsie | Jobs",
  description: "AI-powered job application support with controlled automation, human approval, and application tracking.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}