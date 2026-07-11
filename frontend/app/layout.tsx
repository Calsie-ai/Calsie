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
import "./tracker-editorial.css";

export const metadata = {
  title: "Applix | AI Job Application Assistant",
  description: "AI-powered job application support for modern job seekers.",
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
