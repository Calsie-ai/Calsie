import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AuthProvider } from "./providers/AuthProvider";
import { THEME_INIT_SCRIPT } from "../lib/theme";
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

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://calsie.com.au";
const siteTitle = "Calsie Jobs — AI Job Applications for Australia";
const siteDescription =
  "AI job applications for Australian job seekers. Calsie Jobs finds NDIS, aged care and community support roles across Australia, tailors your resume and drafts every email — you approve each send.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: siteTitle,
    template: "%s | Calsie Jobs",
  },
  description: siteDescription,
  keywords: [
    // Core intent — Australian job search
    "jobs Australia",
    "job applications Australia",
    "AI job search Australia",
    "automated job applications Australia",
    "job application automation",
    // Sector intent — where Calsie actually plays
    "NDIS jobs",
    "NDIS support worker jobs",
    "disability support worker jobs Australia",
    "aged care jobs Australia",
    "community services jobs Australia",
    "support worker jobs Sydney",
    "support worker jobs Melbourne",
    "care jobs Brisbane",
    "youth worker jobs Australia",
    // Task intent
    "resume tailoring Australia",
    "cover letter for support worker",
    "apply for jobs automatically",
    "Calsie Jobs",
  ],
  applicationName: "Calsie Jobs",
  authors: [{ name: "Calsie Jobs" }],
  creator: "Calsie Jobs",
  publisher: "Calsie Jobs",
  category: "Employment Services",
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
  alternates: {
    canonical: "/",
    languages: { "en-AU": "/" },
  },
  other: {
    "geo.region": "AU",
    "geo.placename": "Australia",
    "distribution": "Australia",
  },
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml", sizes: "any" }],
    shortcut: "/favicon.svg",
    apple: [{ url: "/favicon.svg", sizes: "180x180" }],
  },
  openGraph: {
    type: "website",
    locale: "en_AU",
    url: "/",
    siteName: "Calsie Jobs",
    title: siteTitle,
    description: siteDescription,
    images: [{ url: "/applix-logo.svg", width: 1200, height: 1200, alt: "Calsie Jobs" }],
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
    images: ["/applix-logo.svg"],
  },
};

export const viewport: Viewport = {
  themeColor: "#ff5757",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Applies the stored theme before first paint so dark mode never
            flashes light on load. Must stay ahead of the stylesheets. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body suppressHydrationWarning><AuthProvider>{children}</AuthProvider></body>
    </html>
  );
}
