export default function PricingSection() {
  const steps = [
    ["1", "Create your account", "Login and account creation are free."],
    ["2", "Browse templates", "Review roles, campaign settings, photos, and included features without paying."],
    ["3", "Choose a template", "The exact admin-managed price appears only for the campaign template you select."],
  ];

  return (
    <section
      id="pricing"
      aria-labelledby="pricing-title"
      style={{
        background: "#ffebed",
        color: "#111111",
        padding: "110px 32px 120px",
        scrollMarginTop: "88px",
        borderTop: "1px solid rgba(17,17,17,0.08)",
        borderBottom: "1px solid rgba(17,17,17,0.08)",
      }}
    >
      <div style={{ width: "min(1180px, 100%)", margin: "0 auto" }}>
        <header style={{ textAlign: "center", maxWidth: 880, margin: "0 auto 64px" }}>
          <p className="applix-eyebrow" style={{ margin: "0 0 18px" }}>Pricing</p>
          <h2 id="pricing-title" style={{ margin: 0, fontSize: "clamp(48px, 6vw, 78px)", lineHeight: .98, fontWeight: 800, letterSpacing: "-.055em" }}>
            Browse first. Pay only for the template you choose.
          </h2>
          <p style={{ margin: "26px auto 0", maxWidth: 760, fontSize: "clamp(18px, 1.5vw, 22px)", lineHeight: 1.6, color: "#555" }}>
            Calsie Jobs does not ask for payment during login. Each campaign template has its own price and included features, managed from the admin panel.
          </p>
        </header>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 0, maxWidth: 1080, margin: "0 auto" }}>
          {steps.map(([number, title, body]) => (
            <article key={number} style={{ minHeight: 310, padding: 34, border: "1px solid rgba(17,17,17,.22)", background: "#fff", display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 13, fontWeight: 900, letterSpacing: ".12em" }}>STEP {number}</span>
              <h3 style={{ fontSize: 30, margin: "28px 0 14px" }}>{title}</h3>
              <p style={{ color: "#555", lineHeight: 1.7 }}>{body}</p>
            </article>
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "center", marginTop: 42 }}>
          <a className="applix-button applix-button--primary" href="/login?next=/dashboard" style={{ minHeight: 58, paddingInline: 34, textTransform: "uppercase" }}>
            Login and browse free
          </a>
        </div>
        <p style={{ margin: "24px auto 0", textAlign: "center", color: "#666", fontSize: 15 }}>
          Prices are shown in Australian dollars on the selected template checkout page.
        </p>
      </div>
    </section>
  );
}
