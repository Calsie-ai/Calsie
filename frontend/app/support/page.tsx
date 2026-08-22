import type { Metadata } from "next";
import Link from "next/link";
import LegalShell, { LegalSection, CheckStep, type TocEntry } from "../components/LegalShell";
import { CALSIE_CONTACT_EMAIL } from "../../lib/contact";

export const metadata: Metadata = {
  title: "Support",
  description:
    "Get help with Calsie Jobs — troubleshooting steps for campaigns, Gmail connection, resume parsing and billing, plus how to reach the support team.",
  alternates: { canonical: "/support" },
};

const TOC: TocEntry[] = [
  { id: "checks", label: "1. Try these first" },
  { id: "topics", label: "2. What we help with" },
  { id: "contact", label: "3. Contact support" },
];

const TOPICS = [
  "Billing and payments",
  "Account access",
  "Gmail connection",
  "Tracker approvals",
  "Resume parsing",
  "Privacy questions",
  "Account deletion",
  "Campaign settings",
];

export default function SupportPage() {
  return (
    <LegalShell
      eyebrow="Help · Support"
      title="Support"
      lede="Most issues clear up with a quick check of your setup. If they don't, we're one email away."
      updated="30 July 2026"
      active="support"
      toc={TOC}
    >
      <LegalSection id="checks" n={1} title="Try these first">
        <p>
          If Calsie is not behaving as expected, work through these four checks before restarting the workflow — they
          resolve the majority of reports.
        </p>
        <ol className="csl-steps">
          <CheckStep n={1} title="You are signed in">
            Open the <Link href="/dashboard">dashboard</Link> and confirm your session is still active. Sessions can
            expire after a long break.
          </CheckStep>
          <CheckStep n={2} title="Your resume is uploaded">
            Calsie needs a base resume to tailor applications from. Check it has parsed correctly and the details look
            right.
          </CheckStep>
          <CheckStep n={3} title="Your connector is active">
            Confirm your Gmail connection is still authorised. Revoking access in your Google Account settings will
            pause sending.
          </CheckStep>
          <CheckStep n={4} title="Your campaign is configured">
            Check the role, location and hours are set. A campaign with no matching criteria will not queue
            applications.
          </CheckStep>
        </ol>
      </LegalSection>

      <LegalSection id="topics" n={2} title="What we can help with">
        <p>Email the support team about any of the following and we&apos;ll take a look at your account:</p>
        <div className="csl-topics">
          {TOPICS.map((topic) => (
            <span className="csl-topic" key={topic}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 12.5 9 17.5 20 6" />
              </svg>
              {topic}
            </span>
          ))}
        </div>
      </LegalSection>

      <LegalSection id="contact" n={3} title="Contact support">
        <div className="csl-contact">
          <p className="csl-contact-label">Email Calsie support</p>
          <a className="csl-mailto" href={`mailto:${CALSIE_CONTACT_EMAIL}`}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3" y="5" width="18" height="14" rx="1.5" />
              <path d="M3.5 6 12 13 20.5 6" />
            </svg>
            {CALSIE_CONTACT_EMAIL}
          </a>
          <p className="csl-contact-alt">
            Prefer a form? Use the <Link href="/contact">contact page</Link> instead. Include your account email and
            what you expected to happen — it gets you a faster answer.
          </p>
        </div>
      </LegalSection>
    </LegalShell>
  );
}
