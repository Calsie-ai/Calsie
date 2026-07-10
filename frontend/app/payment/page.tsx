export default function PaymentPage() {
  const included = [
    "2-minute guided setup",
    "Up to 100 opportunities per day",
    "Up to 1,000 opportunities across 10 days",
    "AI-tailored resume drafts",
    "AI-written application emails",
    "Application tracking dashboard",
  ];

  const controls = [
    "Review before anything moves forward",
    "Approve the jobs you want",
    "Keep your existing resume details",
    "Track prepared and applied roles",
    "Use guided or automated workflow",
    "Support available when needed",
  ];

  return (
    <main className="applix-landing" id="top">
      <header className="applix-header">
        <div className="applix-container applix-header-inner">
          <a className="applix-brand" href="/" aria-label="Applix home">
            <img src="/applix-logo.svg" alt="" />
            <span>Applix</span>
          </a>
          <nav className="applix-nav" aria-label="Payment navigation">
            <a href="/#features">Features</a>
            <a href="/#how-it-works">How it works</a>
            <a href="/support">Support</a>
          </nav>
          <div className="applix-actions">
            <a className="applix-button applix-button--subtle" href="/">
              Back home
            </a>
          </div>
        </div>
      </header>

      <section style={{ padding: "72px 20px 88px" }} aria-labelledby="payment-title">
        <div className="applix-container">
          <div style={{ textAlign: "center", maxWidth: "720px", margin: "0 auto 44px" }}>
            <p className="applix-eyebrow">Simple, transparent pricing</p>
            <h1 id="payment-title" style={{ marginBottom: "12px" }}>
              One clear Applix plan
            </h1>
            <p className="applix-hero-copy" style={{ margin: "0 auto" }}>
              Everything you need to prepare, review, and track job applications in one controlled workflow.
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              alignItems: "stretch",
              maxWidth: "1120px",
              margin: "0 auto",
            }}
          >
            <article
              style={{
                border: "1px solid rgba(17,17,17,0.18)",
                padding: "34px 28px 26px",
                background: "#ffffff",
                display: "flex",
                flexDirection: "column",
                minHeight: "520px",
              }}
            >
              <div>
                <p className="applix-eyebrow">Included</p>
                <h2 style={{ fontSize: "30px", margin: "8px 0 8px" }}>Complete workflow</h2>
                <p style={{ marginTop: 0 }}>
                  The tools and limits already included in the current Applix plan.
                </p>
              </div>

              <div style={{ marginTop: "28px", display: "grid", gap: "16px" }}>
                {included.map((item) => (
                  <div key={item} style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                    <span aria-hidden="true">✓</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>

              <a
                className="applix-button"
                href="/#features"
                style={{ marginTop: "auto", justifyContent: "center", width: "100%" }}
              >
                View features
              </a>
            </article>

            <article
              style={{
                border: "1px solid #111111",
                padding: "28px 28px 26px",
                background: "#111111",
                color: "#ffffff",
                display: "flex",
                flexDirection: "column",
                minHeight: "560px",
                transform: "translateY(-14px)",
                boxShadow: "0 22px 60px rgba(0,0,0,0.18)",
                position: "relative",
                zIndex: 2,
              }}
            >
              <div>
                <span
                  style={{
                    display: "inline-flex",
                    border: "1px solid rgba(255,255,255,0.65)",
                    padding: "5px 10px",
                    fontSize: "11px",
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    marginBottom: "18px",
                  }}
                >
                  Current plan
                </span>
                <h2 style={{ fontSize: "30px", margin: "0 0 8px" }}>Applix Plan</h2>
                <div style={{ display: "flex", alignItems: "baseline", gap: "8px", margin: "8px 0 10px" }}>
                  <strong style={{ fontSize: "54px", lineHeight: 1 }}>A$20</strong>
                  <span style={{ opacity: 0.75 }}>AUD</span>
                </div>
                <p style={{ marginTop: 0, opacity: 0.78 }}>
                  One-time payment for the current 10-day application campaign workflow.
                </p>
              </div>

              <div style={{ marginTop: "28px", display: "grid", gap: "16px" }}>
                {included.map((item) => (
                  <div key={item} style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                    <span aria-hidden="true">✓</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>

              <a
                href="/dashboard"
                style={{
                  marginTop: "auto",
                  width: "100%",
                  minHeight: "48px",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "#ffffff",
                  color: "#111111",
                  textDecoration: "none",
                  fontWeight: 700,
                  padding: "0 18px",
                }}
              >
                Continue to Applix
              </a>
            </article>

            <article
              style={{
                border: "1px solid rgba(17,17,17,0.18)",
                padding: "34px 28px 26px",
                background: "#ffffff",
                display: "flex",
                flexDirection: "column",
                minHeight: "520px",
              }}
            >
              <div>
                <p className="applix-eyebrow">Control</p>
                <h2 style={{ fontSize: "30px", margin: "8px 0 8px" }}>You stay in charge</h2>
                <p style={{ marginTop: 0 }}>
                  The plan keeps review, approval, and tracking visible throughout the process.
                </p>
              </div>

              <div style={{ marginTop: "28px", display: "grid", gap: "16px" }}>
                {controls.map((item) => (
                  <div key={item} style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                    <span aria-hidden="true">✓</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>

              <a
                className="applix-button"
                href="/support"
                style={{ marginTop: "auto", justifyContent: "center", width: "100%" }}
              >
                Contact support
              </a>
            </article>
          </div>

          <p style={{ textAlign: "center", marginTop: "28px", fontSize: "13px", opacity: 0.68 }}>
            Stripe checkout is not connected yet. This update changes the page layout only.
          </p>
        </div>
      </section>

      <footer className="applix-footer">
        <div className="applix-container applix-footer-inner">
          <div className="applix-footer-brand">
            <strong>Applix</strong>
            <p>AI-powered job application support for modern job seekers.</p>
          </div>
          <nav className="applix-footer-links" aria-label="Footer navigation">
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
            <a href="/contact">Contact</a>
            <a href="/support">Support</a>
          </nav>
        </div>
      </footer>
    </main>
  );
}
