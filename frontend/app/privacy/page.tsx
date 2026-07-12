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

export default function PrivacyPage() {
  return (
    <main style={shellStyle}>
      <section style={contentStyle}>
        <Link href="/" style={linkStyle}>Back to Applix</Link>
        <div>
          <p style={{ margin: "0 0 10px", color: "#FE818D", fontWeight: 900, letterSpacing: ".12em", textTransform: "uppercase" }}>Privacy</p>
          <h1 style={{ margin: 0, fontSize: "clamp(38px, 8vw, 72px)", lineHeight: 1 }}>Privacy Policy</h1>
        </div>
        <p style={{ fontSize: "18px", lineHeight: 1.7 }}>
          Applix uses account, resume, campaign, and connected-email authorization data only to provide the job outreach workflow you request.
          Resume parsing responses are limited to structured fields needed by the app and do not return raw resume text.
        </p>
        <p style={{ fontSize: "18px", lineHeight: 1.7 }}>
          We protect access to private app actions with authenticated Supabase sessions. Connected provider tokens, billing records, and campaign data should be handled only for product operation, support, security, and compliance needs.
        </p>
        <p style={{ fontSize: "18px", lineHeight: 1.7 }}>
          To request access, correction, deletion, or help with connected Google account data, email Applix support at{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} style={linkStyle}>{SUPPORT_EMAIL}</a>.
        </p>
        <p style={{ fontSize: "14px", lineHeight: 1.6 }}>Last updated: July 12, 2026</p>
      </section>
    </main>
  );
}
