const SUPPORT_EMAIL = "hostsajan@gmail.com";

const footerGroups = [
  {
    title: "Product",
    links: [
      ["Features", "#features"],
      ["How it works", "#how-it-works"],
      ["Pricing", "#pricing"],
      ["Application tracking", "/tracker"],
    ],
  },
  {
    title: "Company",
    links: [
      ["About", "#about"],
      ["Contact", "/contact"],
      ["Support", "/support"],
    ],
  },
  {
    title: "Resources",
    links: [
      ["Dashboard", "/dashboard"],
      ["Resume tools", "/resume-canvas"],
      ["Help centre", "/support"],
      ["Get started", "#start-check"],
    ],
  },
];

export default function AppFooter() {
  return (
    <footer
      className="applix-footer"
      style={{
        background: "#ffebed",
        color: "#111111",
        borderTop: "1px solid rgba(17,17,17,0.12)",
        padding: "82px 32px 30px",
      }}
    >
      <div style={{ width: "min(1280px, 100%)", margin: "0 auto" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(260px, 1.3fr) repeat(3, minmax(150px, 0.7fr))",
            gap: "48px",
            alignItems: "start",
          }}
        >
          <div style={{ maxWidth: "330px" }}>
            <a href="#top" aria-label="Applix home" style={{ display: "inline-flex", alignItems: "center", gap: "12px", fontSize: "22px", fontWeight: 900 }}>
              <img src="/applix-logo.svg" alt="" style={{ width: "38px", height: "38px", objectFit: "contain" }} />
              <span>Applix</span>
            </a>
            <p style={{ margin: "18px 0 0", color: "#555", fontSize: "15px", lineHeight: 1.65 }}>
              AI-powered job application support that helps people move faster while keeping every important decision in their hands.
            </p>
            <a href={`mailto:${SUPPORT_EMAIL}`} style={{ display: "inline-block", marginTop: "16px", fontSize: "14px", fontWeight: 800 }}>
              {SUPPORT_EMAIL}
            </a>
            <div style={{ display: "flex", gap: "10px", marginTop: "24px" }} aria-label="Social links">
              {["in", "x", "ig"].map((label) => (
                <a
                  key={label}
                  href="/contact"
                  aria-label={label}
                  style={{
                    width: "38px",
                    height: "38px",
                    display: "grid",
                    placeItems: "center",
                    border: "1px solid rgba(17,17,17,0.35)",
                    borderRadius: "6px",
                    fontSize: "12px",
                    fontWeight: 900,
                    textTransform: "uppercase",
                  }}
                >
                  {label}
                </a>
              ))}
            </div>
          </div>

          {footerGroups.map((group) => (
            <nav key={group.title} aria-label={`${group.title} links`}>
              <p style={{ margin: "0 0 18px", fontSize: "12px", fontWeight: 900, textTransform: "uppercase", color: "#111" }}>
                {group.title}
              </p>
              <div style={{ display: "grid", gap: "13px" }}>
                {group.links.map(([label, href]) => (
                  <a key={label} href={href} style={{ fontSize: "14px", color: "#555", fontWeight: 700 }}>
                    {label}
                  </a>
                ))}
              </div>
            </nav>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "30px", alignItems: "end", marginTop: "64px" }}>
          <nav aria-label="Legal links">
            <p style={{ margin: "0 0 16px", fontSize: "12px", fontWeight: 900, textTransform: "uppercase" }}>Legal</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "18px" }}>
              <a href="/privacy">Privacy Policy</a>
              <a href="/terms">Terms of Service</a>
              <a href="/contact">Contact</a>
            </div>
          </nav>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", gap: "24px", flexWrap: "wrap", marginTop: "34px", paddingTop: "22px", borderTop: "1px solid rgba(17,17,17,0.42)", color: "#666", fontSize: "12px" }}>
          <span>© 2026 Applix. All rights reserved.</span>
          <div style={{ display: "flex", gap: "18px" }}>
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
            <a href="/contact">Contact</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
