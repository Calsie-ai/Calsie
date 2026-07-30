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
  maxWidth: "780px",
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

export default function SupportPage() {
  return (
    <main style={shellStyle}>
      <section style={contentStyle}>
        <Link href="/" style={linkStyle}>Back to Calsie</Link>
        <div>
          <p style={{ margin: "0 0 10px", color: "#FE818D", fontWeight: 900, letterSpacing: ".12em", textTransform: "uppercase" }}>Support</p>
          <h1 style={{ margin: 0, fontSize: "clamp(38px, 8vw, 72px)", lineHeight: 1 }}>Support</h1>
        </div>
        <p style={{ fontSize: "18px", lineHeight: 1.7 }}>
          If Calsie is not behaving as expected, check that you are signed in, your resume is uploaded, your connector is active, and your campaign is configured before restarting the workflow.
        </p>
        <p style={{ fontSize: "18px", lineHeight: 1.7 }}>
          For help with billing, access, Gmail connection, tracker approvals, resume parsing, privacy, or account deletion, contact Calsie support at:
        </p>
        <a href={`mailto:${CALSIE_CONTACT_EMAIL}`} style={{ ...linkStyle, fontSize: "22px" }}>{CALSIE_CONTACT_EMAIL}</a>
        <Link href="/contact" style={{ ...linkStyle, fontSize: "18px" }}>Contact Calsie</Link>
      </section>
    </main>
  );
}
