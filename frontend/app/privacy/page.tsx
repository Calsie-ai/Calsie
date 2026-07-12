import Link from "next/link";

const SUPPORT_EMAIL = "hostsajan@gmail.com";

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

const headingStyle = { margin: "18px 0 0", fontSize: "28px", lineHeight: 1.2 } as const;
const textStyle = { margin: 0, fontSize: "17px", lineHeight: 1.75 } as const;
const listStyle = { margin: 0, paddingLeft: "24px", fontSize: "17px", lineHeight: 1.75 } as const;

export default function PrivacyPage() {
  return (
    <main style={shellStyle}>
      <section style={contentStyle}>
        <Link href="/" style={linkStyle}>Back to Applix</Link>
        <div>
          <p style={{ margin: "0 0 10px", color: "#FE818D", fontWeight: 900, letterSpacing: ".12em", textTransform: "uppercase" }}>Privacy</p>
          <h1 style={{ margin: 0, fontSize: "clamp(38px, 8vw, 72px)", lineHeight: 1 }}>Privacy Policy</h1>
        </div>

        <p style={textStyle}>Applix processes account, resume, campaign, job, application and connected-email authorisation data only to provide and secure the job-application workflow requested by the user.</p>

        <h2 style={headingStyle}>Google account and Gmail data</h2>
        <p style={textStyle}>When you connect Google, Applix may receive your Google email address, basic profile identifier, granted OAuth scopes, connection status, token expiry information and OAuth credentials needed to maintain the connection.</p>
        <p style={textStyle}>Applix requests the Gmail Send permission (<code>https://www.googleapis.com/auth/gmail.send</code>) only to send job-application emails from the connected Gmail account after the relevant application has been reviewed and approved.</p>

        <h2 style={headingStyle}>What Applix does not access</h2>
        <ul style={listStyle}>
          <li>Applix does not request permission to read or search your Gmail inbox.</li>
          <li>Applix does not access, modify, move or delete your existing Gmail messages.</li>
          <li>Applix does not access your Gmail contacts.</li>
          <li>Applix does not sell Google user data or use it for advertising.</li>
          <li>Google Workspace data is not used to train general-purpose AI models.</li>
        </ul>

        <h2 style={headingStyle}>How Gmail authorisation is used</h2>
        <ul style={listStyle}>
          <li>Identify the Gmail account connected to your Applix account.</li>
          <li>Send application emails that you have reviewed and approved.</li>
          <li>Attach the resume selected for an approved application.</li>
          <li>Maintain the authorised connection while your campaign is active.</li>
          <li>Display connection status and investigate security or abuse issues.</li>
        </ul>

        <h2 style={headingStyle}>Separate Gmail account recommendation</h2>
        <p style={textStyle}><strong>For additional privacy, we recommend connecting a new, unused or dedicated Gmail account created only for job applications.</strong> This helps keep job outreach separate from personal messages, financial records, medical information and other real personal data. This is a recommendation, not a requirement.</p>

        <h2 style={headingStyle}>Storage, service providers and sharing</h2>
        <p style={textStyle}>Applix uses protected server-side systems to operate the connection. Infrastructure providers may include Supabase for authentication, database, storage and server functions, and Vercel for application hosting. Google data is not transferred to advertising platforms, data brokers or information resellers.</p>

        <h2 style={headingStyle}>AI processing</h2>
        <p style={textStyle}>Applix may use job details, resume information and application text to prepare tailored drafts. Existing Gmail inbox content is not accessed or supplied to AI systems because Applix does not request inbox-reading permission.</p>

        <h2 style={headingStyle}>Retention, revocation and deletion</h2>
        <p style={textStyle}>Google authorisation information may be retained while the Gmail connection remains active and as necessary for operation, security and legal compliance. You may revoke Applix access from your Google Account permissions. You may also request access, correction or deletion by contacting Applix support.</p>

        <h2 style={headingStyle}>Google API Limited Use</h2>
        <p style={textStyle}>Applix&apos;s use and transfer of information received from Google APIs will adhere to the Google API Services User Data Policy, including the Limited Use requirements.</p>

        <h2 style={headingStyle}>Contact</h2>
        <p style={textStyle}>For privacy questions, Google-account assistance, access, correction or deletion requests, email <a href={`mailto:${SUPPORT_EMAIL}`} style={linkStyle}>{SUPPORT_EMAIL}</a>.</p>

        <p style={{ fontSize: "14px", lineHeight: 1.6 }}>Last updated: July 12, 2026</p>
      </section>
    </main>
  );
}
