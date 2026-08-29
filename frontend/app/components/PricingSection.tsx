export default function PricingSection() {
  const steps = [
    ["1", "Create your account", "Register and configure your campaign parameters at no cost."],
    ["2", "Select targets", "Input your desired job roles, target locations in Australia, and instructions."],
    ["3", "Unlock templates", "Unlock templates to begin processing and sending automated applications."],
  ];

  return (
    <section
      id="pricing"
      aria-labelledby="pricing-title"
      style={{
        background: "#ffffff",
        color: "#09090b",
        padding: "100px 24px",
        borderTop: "1.5px solid #e4e4e7",
        borderBottom: "1.5px solid #e4e4e7",
      }}
    >
      <div style={{ width: "min(1200px, 100%)", margin: "0 auto" }}>
        <header style={{ textAlign: "center", maxWidth: 720, margin: "0 auto 56px" }}>
          <p
            style={{
              margin: "0 0 16px",
              color: "#ff5757",
              fontFamily: "'Inter', sans-serif",
              fontSize: "12px",
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            Campaign Pricing
          </p>
          <h2
            id="pricing-title"
            style={{
              margin: "0 0 16px",
              fontFamily: "'Inter', sans-serif",
              fontSize: "38px",
              fontWeight: 900,
              letterSpacing: "-0.03em",
              lineHeight: 1.1,
            }}
          >
            Surcharges only for active template templates.
          </h2>
          <p
            style={{
              margin: 0,
              fontFamily: "'Inter', sans-serif",
              fontSize: "16px",
              color: "#52525b",
              lineHeight: 1.6,
            }}
          >
            Registration and campaign creation are completely free. Review your matched target listings before activating template options.
          </p>
        </header>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "24px",
            maxWidth: 1000,
            margin: "0 auto",
          }}
        >
          {steps.map(([number, title, body]) => (
            <article
              key={number}
              style={{
                padding: "32px",
                background: "#f8f9fa",
                border: "1.5px solid #e4e4e7",
                borderRadius: "4px",
                display: "flex",
                flexDirection: "column",
                gap: "16px",
              }}
            >
              <span
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#ff5757",
                  letterSpacing: "0.05em",
                }}
              >
                STEP {number}
              </span>
              <h3
                style={{
                  margin: 0,
                  fontFamily: "'Inter', sans-serif",
                  fontSize: "20px",
                  fontWeight: 800,
                  color: "#09090b",
                }}
              >
                {title}
              </h3>
              <p
                style={{
                  margin: 0,
                  fontFamily: "'Inter', sans-serif",
                  color: "#52525b",
                  lineHeight: 1.6,
                  fontSize: 14,
                }}
              >
                {body}
              </p>
            </article>
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "center", marginTop: 48 }}>
          <a
            href="/login?next=%2Fdashboard%3Fpanel%3Dtemplates"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: 44,
              padding: "0 24px",
              border: "1.5px solid #ff5757",
              background: "#ff5757",
              color: "#ffffff",
              fontFamily: "'Inter', sans-serif",
              fontSize: 14,
              fontWeight: 600,
              borderRadius: "4px",
              textDecoration: "none",
            }}
          >
            Start Free Target Search
          </a>
        </div>
        <p
          style={{
            margin: "16px auto 0",
            textAlign: "center",
            color: "#8c8c9a",
            fontFamily: "'Inter', sans-serif",
            fontSize: 12,
          }}
        >
          All pricing is stated in AUD and calculated based on active campaigns.
        </p>
      </div>
    </section>
  );
}
