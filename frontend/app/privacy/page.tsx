import type { Metadata } from "next";
import Link from "next/link";
import LegalShell, { LegalSection, YesNoItem, type TocEntry } from "../components/LegalShell";
import { CALSIE_CONTACT_EMAIL } from "../../lib/contact";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How Calsie Jobs collects, uses and protects your account, resume and application information — and what we never do with it.",
  alternates: { canonical: "/privacy" },
};

const TOC: TocEntry[] = [
  { id: "collect", label: "1. What we collect" },
  { id: "never", label: "2. What we never do" },
  { id: "providers", label: "3. Service providers" },
  { id: "controls", label: "4. Your controls" },
  { id: "google", label: "5. Google user data" },
];

export default function PrivacyPage() {
  return (
    <LegalShell
      eyebrow="Legal · Privacy"
      title="Privacy Policy"
      lede="What Calsie Jobs collects, why we collect it, and the things we will never do with your data — including your inbox."
      updated="30 July 2026"
      active="privacy"
      toc={TOC}
    >
      <LegalSection id="collect" n={1} title="What we collect and why">
        <p>
          Calsie collects and uses account, resume, campaign, job and application information{" "}
          <strong>only to provide and protect the job-application service you chose</strong>.
        </p>
        <p>
          When you connect a Google account, Calsie may receive your email address, basic account details and the
          permission needed to send approved job-application emails from that account. Calsie only sends an
          application after you have reviewed and approved it.
        </p>
      </LegalSection>

      <LegalSection id="never" n={2} title="What we never do">
        <p>Calsie does not:</p>
        <div className="csl-list">
          <YesNoItem kind="no">Read or search your inbox</YesNoItem>
          <YesNoItem kind="no">Access your existing emails</YesNoItem>
          <YesNoItem kind="no">View your contacts</YesNoItem>
          <YesNoItem kind="no">Move or delete your messages</YesNoItem>
          <YesNoItem kind="no">Sell your personal information</YesNoItem>
          <YesNoItem kind="no">Use Google account data for advertising</YesNoItem>
          <YesNoItem kind="no">Provide existing email content to artificial intelligence systems</YesNoItem>
        </div>
        <div className="csl-callout">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <line x1="12" y1="11" x2="12" y2="16.5" />
            <line x1="12" y1="7.5" x2="12" y2="7.5" />
          </svg>
          <p>
            Calsie may use your resume, selected job details and application information to prepare tailored
            application documents and messages. That is the one place your data is used to generate content.
          </p>
        </div>
      </LegalSection>

      <LegalSection id="providers" n={3} title="Service providers">
        <p>
          Calsie uses trusted service providers to help protect user accounts and information. Google provides secure
          account connection and authorisation, while Supabase provides protected sign-in, database and file-storage
          services. Calsie also uses secure hosting systems to operate the website.
        </p>
        <div className="csl-list">
          <YesNoItem kind="yes">
            Shared with providers <strong>only</strong> when necessary to operate, maintain and protect the service
          </YesNoItem>
          <YesNoItem kind="no">Never shared with advertisers, data brokers or information resellers</YesNoItem>
        </div>
      </LegalSection>

      <LegalSection id="controls" n={4} title="Your controls and choices">
        <p>
          You may connect a separate Google account created specifically for job applications, to keep employment
          activity separate from your personal email. This is optional.
        </p>
        <p>
          You can disconnect your Google account at any time through your Google Account settings, and you may
          request access, correction or deletion of your Calsie information by contacting{" "}
          <a href={`mailto:${CALSIE_CONTACT_EMAIL}`}>{CALSIE_CONTACT_EMAIL}</a>.
        </p>
      </LegalSection>

      <LegalSection id="google" n={5} title="Google user data">
        <p>
          Calsie handles information received from Google in accordance with Google&apos;s user-data and privacy
          requirements, including the Limited Use requirements.
        </p>
        <p>
          For the terms covering your use of the service, see our <Link href="/terms">Terms of Service</Link>.
        </p>
      </LegalSection>
    </LegalShell>
  );
}
