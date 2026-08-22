import { CALSIE_CONTACT_EMAIL } from "../../lib/contact";

const footerGroups = [
  {
    title: "Platform",
    links: [
      ["Features", "#features"],
      ["How it works", "#how-it-works"],
      ["Pricing", "#pricing"],
      ["Live Tracker", "/tracker"],
    ],
  },
  {
    title: "Details",
    links: [
      ["About", "#about"],
      ["Contact Support", "/contact"],
      ["Help Centre", "/support"],
    ],
  },
  {
    title: "Campaigns",
    links: [
      ["Go to Dashboard", "/dashboard"],
      ["Resume Editor", "/resume-canvas"],
      ["Create Account", "#start-check"],
    ],
  },
];

export default function AppFooter() {
  return (
    <footer
      className="applix-footer"
      style={{
        background: "#ffffff",
        color: "#09090b",
        borderTop: "1.5px solid #e4e4e7",
        padding: "80px 24px 48px",
        fontFamily: "'Inter', -apple-system, system-ui, sans-serif",
      }}
    >
      <div style={{ width: "min(1200px, 100%)", margin: "0 auto" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(280px, 1.5fr) repeat(3, minmax(140px, 0.8fr))",
            gap: "48px",
            alignItems: "start",
          }}
        >
          {/* Main Info Column */}
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <a
              href="#top"
              aria-label="Calsie Jobs home"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "10px",
                fontSize: "18px",
                fontWeight: 800,
                color: "#09090b",
                textDecoration: "none",
              }}
            >
              <img
                src="/applix-logo.svg"
                alt="Calsie Jobs Logo"
                style={{ width: "32px", height: "32px", objectFit: "contain" }}
              />
              <span>Calsie | Jobs</span>
            </a>
            <p style={{ margin: 0, color: "#52525b", fontSize: "14px", lineHeight: 1.6 }}>
              AI-powered job applications for Australian vacancies. Discover roles, generate custom tailored profiles, and manage automatic submissions securely.
            </p>
            <a
              href={`mailto:${CALSIE_CONTACT_EMAIL}`}
              style={{
                fontSize: "14px",
                fontWeight: 600,
                color: "#ff5757",
                textDecoration: "none",
              }}
            >
              {CALSIE_CONTACT_EMAIL}
            </a>

            {/* Flat Social Icons */}
            <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
              {["LinkedIn", "X", "Instagram"].map((label) => (
                <a
                  key={label}
                  href="/contact"
                  style={{
                    padding: "6px 12px",
                    border: "1.5px solid #e4e4e7",
                    borderRadius: "4px",
                    fontSize: "11px",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    color: "#52525b",
                    textDecoration: "none",
                  }}
                >
                  {label}
                </a>
              ))}
            </div>
          </div>

          {/* Group Columns */}
          {footerGroups.map((group) => (
            <nav key={group.title} aria-label={`${group.title} links`}>
              <p
                style={{
                  margin: "0 0 16px",
                  fontSize: "11px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: "#09090b",
                }}
              >
                {group.title}
              </p>
              <div style={{ display: "grid", gap: "10px" }}>
                {group.links.map(([label, href]) => (
                  <a
                    key={label}
                    href={href}
                    style={{
                      fontSize: "13px",
                      color: "#52525b",
                      textDecoration: "none",
                    }}
                  >
                    {label}
                  </a>
                ))}
              </div>
            </nav>
          ))}
        </div>

        {/* Legal & Copyright Bar */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "24px",
            marginTop: "64px",
            paddingTop: "24px",
            borderTop: "1.5px solid #e4e4e7",
            fontSize: "13px",
            color: "#8c8c9a",
          }}
        >
          <span>© 2026 Calsie Jobs. All rights reserved.</span>
          <div style={{ display: "flex", gap: "20px" }}>
            <a href="/privacy" style={{ color: "#8c8c9a", textDecoration: "none" }}>
              Privacy Policy
            </a>
            <a href="/terms" style={{ color: "#8c8c9a", textDecoration: "none" }}>
              Terms of Service
            </a>
            <a href="/contact" style={{ color: "#8c8c9a", textDecoration: "none" }}>
              Contact
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
