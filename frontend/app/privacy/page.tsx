import Link from "next/link";
import { CALSIE_CONTACT_EMAIL } from "../../lib/contact";

const shellStyle = {
  minHeight: "100vh",
  background: "#ffffff",
  color: "#000000",
  fontFamily: "Arial, Helvetica, sans-serif",
  padding: "48px 20px",
} as const;

const contentStyle = {
  maxWidth: "820px",
  margin: "0 auto",
  display: "grid",
  gap: "22px",
} as const;

const linkStyle = {
  color: "#000000",
  fontWeight: 800,
  textDecorationColor: "#FE818D",
  textDecorationThickness: "2px",
} as const;

const textStyle = { margin: 0, fontSize: "17px", lineHeight: 1.75 } as const;

export default function PrivacyPage() {
  return (
    <main style={shellStyle}>
      <section style={contentStyle}>
        <Link href="/dashboard" style={linkStyle}>Back to Calsie</Link>
        <div>
          <p style={{ margin: "0 0 10px", color: "#FE818D", fontWeight: 900, letterSpacing: ".12em", textTransform: "uppercase" }}>Privacy</p>
          <h1 style={{ margin: 0, fontSize: "clamp(38px, 8vw, 72px)", lineHeight: 1 }}>Calsie Privacy Policy</h1>
        </div>

        <p style={textStyle}>Calsie collects and uses account, resume, campaign, job and application information only to provide and protect the job-application service chosen by the user. When a user connects a Google account, Calsie may receive the user&apos;s email address, basic account details and the permission needed to send approved job-application emails from that account. Calsie only sends an application after the user has reviewed and approved it.</p>

        <p style={textStyle}>Calsie does not read or search the user&apos;s inbox, access existing emails, view contacts, move or delete messages, sell personal information or use Google account data for advertising. Existing email content is not provided to artificial intelligence systems. Calsie may use the user&apos;s resume, selected job details and application information to prepare tailored application documents and messages.</p>

        <p style={textStyle}>Calsie uses trusted service providers to help protect user accounts and information. Google provides secure account connection and authorisation, while Supabase provides protected sign-in, database and file-storage services. Calsie also uses secure hosting systems to operate the website. Personal information is only shared with service providers when necessary to operate, maintain and protect the service, and it is not shared with advertisers, data brokers or information resellers.</p>

        <p style={textStyle}>Users may connect a separate Google account created specifically for job applications to keep employment activity separate from personal emails, although this is optional. A user may disconnect their Google account at any time through their Google Account settings and may request access, correction or deletion of their Calsie information by contacting <a href={`mailto:${CALSIE_CONTACT_EMAIL}`} style={linkStyle}>{CALSIE_CONTACT_EMAIL}</a>.</p>

        <p style={textStyle}>Calsie handles information received from Google in accordance with Google&apos;s user-data and privacy requirements.</p>

        <p style={{ fontSize: "14px", lineHeight: 1.6 }}>Last updated: 30 July 2026.</p>
      </section>
    </main>
  );
}
