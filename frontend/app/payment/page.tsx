export default function PaymentPage() {
  const planFeatures = [
    "2-minute guided setup",
    "Up to 100 job opportunities per day",
    "Up to 1,000 opportunities across 10 days",
    "AI-tailored resume and application email drafts",
    "Review and approval before applications move forward",
    "Application tracking in one dashboard",
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

      <section className="applix-hero" aria-labelledby="payment-title">
        <div className="applix-container applix-hero-grid">
          <div>
            <p className="applix-eyebrow">Simple Applix plan</p>
            <h1 id="payment-title">Move faster with one clear payment plan</h1>
            <p className="applix-hero-copy">
              Get the complete Applix workflow for finding opportunities, preparing tailored
              application materials, reviewing drafts, and tracking progress while staying in control.
            </p>

            <div className="applix-stats-grid" style={{ marginTop: "32px" }}>
              <div className="applix-stat">
                <strong>2 min</strong>
                <span>guided setup</span>
              </div>
              <div className="applix-stat">
                <strong>100/day</strong>
                <span>job capability</span>
              </div>
              <div className="applix-stat">
                <strong>10 days</strong>
                <span>campaign period</span>
              </div>
              <div className="applix-stat">
                <strong>Full control</strong>
                <span>review before applying</span>
              </div>
            </div>
          </div>

          <article className="applix-product-panel" aria-label="Applix payment plan">
            <div className="applix-panel-topbar">
              <div className="applix-panel-title">
                <strong>Applix Plan</strong>
                <span>Complete AI job application workflow</span>
              </div>
              <span className="applix-panel-pill">One-time payment</span>
            </div>

            <div style={{ padding: "28px 0 18px" }}>
              <p className="applix-eyebrow">Launch plan</p>
              <div style={{ display: "flex", alignItems: "baseline", gap: "8px", margin: "10px 0 8px" }}>
                <strong style={{ fontSize: "56px", lineHeight: 1 }}>A$20</strong>
                <span>AUD</span>
              </div>
              <p style={{ margin: 0 }}>
                Access the current Applix application campaign workflow for up to 10 days.
              </p>
            </div>

            <div className="applix-workflow-list">
              {planFeatures.map((feature, index) => (
                <div className="applix-workflow-item" key={feature}>
                  <span>{index + 1}</span>
                  <div>
                    <strong>{feature}</strong>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: "24px" }}>
              <a className="applix-button applix-button--primary" href="/dashboard" style={{ width: "100%", justifyContent: "center" }}>
                Continue to Applix
              </a>
              <p className="applix-supporting-line" style={{ marginTop: "12px" }}>
                Secure online payment will be connected when the Stripe checkout setup is completed.
              </p>
            </div>
          </article>
        </div>
      </section>

      <section className="applix-section" aria-labelledby="included-title">
        <div className="applix-container">
          <div className="applix-section-header centered">
            <p className="applix-eyebrow">Included</p>
            <h2 id="included-title">Everything stays aligned with the existing Applix workflow</h2>
            <p>
              The plan, campaign capability, approval controls, and tracking experience remain unchanged.
            </p>
          </div>

          <div className="applix-card-grid">
            <article className="applix-feature-card">
              <span className="applix-feature-number">01</span>
              <h3>Find opportunities</h3>
              <p>Use your selected role, location, and work preferences to discover relevant jobs.</p>
            </article>
            <article className="applix-feature-card">
              <span className="applix-feature-number">02</span>
              <h3>Prepare applications</h3>
              <p>Generate tailored resume and email drafts for the opportunities you choose.</p>
            </article>
            <article className="applix-feature-card">
              <span className="applix-feature-number">03</span>
              <h3>Review and track</h3>
              <p>Keep approval close and follow prepared, approved, and applied opportunities in one place.</p>
            </article>
          </div>
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
