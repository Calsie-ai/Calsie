import Link from "next/link";

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

export default function TermsPage() {
  return (
    <main style={shellStyle}>
      <section style={contentStyle}>
        <Link href="/" style={linkStyle}>Back to Applix</Link>
        <div>
          <p style={{ margin: "0 0 10px", color: "#FE818D", fontWeight: 900, letterSpacing: ".12em", textTransform: "uppercase" }}>Terms</p>
          <h1 style={{ margin: 0, fontSize: "clamp(38px, 8vw, 72px)", lineHeight: 1 }}>Terms of Service</h1>
        </div>
        <p style={{ fontSize: "18px", lineHeight: 1.7 }}>
          Applix is provided to help users organize job-search campaigns, prepare outreach drafts, and track activity. You are responsible for reviewing campaign settings, drafts, recipients, and any messages before they are sent.
        </p>
        <p style={{ fontSize: "18px", lineHeight: 1.7 }}>
          You must use Applix lawfully, respect third-party platform rules, and keep your account credentials secure. Do not use the service for spam, fraud, harassment, or unauthorized access.
        </p>
        <p style={{ fontSize: "18px", lineHeight: 1.7 }}>
          Paid access, cancellation, and refund details are governed by the billing terms shown during checkout or in your account support channel.
        </p>
        <p style={{ fontSize: "14px", lineHeight: 1.6 }}>Last updated: July 10, 2026</p>
      </section>
    </main>
  );
}
