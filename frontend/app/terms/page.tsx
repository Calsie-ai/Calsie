import type { Metadata } from "next";
import Link from "next/link";
import LegalShell, { LegalSection, type TocEntry } from "../components/LegalShell";
import { CALSIE_CONTACT_EMAIL } from "../../lib/contact";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "The terms that apply when you use Calsie Jobs to prepare, review and send job applications in Australia.",
  alternates: { canonical: "/terms" },
};

const TOC: TocEntry[] = [
  { id: "service", label: "1. The service" },
  { id: "responsibilities", label: "2. Your responsibilities" },
  { id: "acceptable-use", label: "3. Acceptable use" },
  { id: "billing", label: "4. Billing and refunds" },
  { id: "contact", label: "5. Contact" },
];

export default function TermsPage() {
  return (
    <LegalShell
      eyebrow="Legal · Terms"
      title="Terms of Service"
      lede="These terms cover what Calsie Jobs does, what stays your responsibility, and how billing works. Plain English, no surprises."
      updated="10 July 2026"
      active="terms"
      toc={TOC}
    >
      <LegalSection id="service" n={1} title="The service">
        <p>
          Calsie Jobs is provided to help you organise job-search campaigns, prepare outreach drafts, and track
          activity. It finds roles, tailors your resume to each one and drafts the application email.
        </p>
        <p>
          <strong>Nothing is sent without your approval.</strong> Every application waits in your queue until you
          review and approve it.
        </p>
      </LegalSection>

      <LegalSection id="responsibilities" n={2} title="Your responsibilities">
        <p>
          You are responsible for reviewing campaign settings, drafts, recipients, and any messages before they are
          sent. You are also responsible for keeping your account credentials secure.
        </p>
        <p>
          Because you approve every send, the content of each application you approve is treated as sent by you.
        </p>
      </LegalSection>

      <LegalSection id="acceptable-use" n={3} title="Acceptable use">
        <p>
          You must use Calsie Jobs lawfully and respect the rules of any third-party platform you connect or apply
          through, including job boards and email providers.
        </p>
        <p>
          Do not use the service for spam, fraud, harassment, or unauthorised access. Accounts used this way may be
          suspended.
        </p>
      </LegalSection>

      <LegalSection id="billing" n={4} title="Billing and refunds">
        <p>
          Creating an account and browsing campaign templates is free. Paid access, cancellation, and refund details
          are governed by the billing terms shown during checkout or in your account support channel.
        </p>
        <p>Prices are shown in Australian dollars at checkout before any payment is taken.</p>
      </LegalSection>

      <LegalSection id="contact" n={5} title="Contact">
        <p>
          Questions about these terms can be sent to{" "}
          <a href={`mailto:${CALSIE_CONTACT_EMAIL}`}>{CALSIE_CONTACT_EMAIL}</a>. For how your information is handled,
          see our <Link href="/privacy">Privacy Policy</Link>.
        </p>
      </LegalSection>
    </LegalShell>
  );
}
