const plans = [
  {
    name: "Starter",
    price: "Free",
    note: "Try the core Applix workflow before starting a paid campaign.",
    features: [
      "Guided profile setup",
      "Resume upload and preferences",
      "Limited job matching",
      "Application tracking",
      "Review before applying",
    ],
    action: "Start free",
    href: "#start-check",
    featured: false,
  },
  {
    name: "Applix Pro",
    price: "A$20",
    suffix: "one-time",
    note: "The complete 10-day application campaign for active job seekers.",
    features: [
      "2-minute guided setup",
      "Up to 100 opportunities per day",
      "Up to 1,000 opportunities in 10 days",
      "AI-tailored resume drafts",
      "AI-written application emails",
      "Review and approval controls",
      "Application tracking dashboard",
    ],
    action: "Choose Applix Pro",
    href: "/payment",
    featured: true,
  },
  {
    name: "Custom",
    price: "Let’s talk",
    note: "For organisations, employment services, and larger hiring-support programs.",
    features: [
      "Custom campaign limits",
      "Team or participant workflows",
      "Tailored onboarding",
      "Priority implementation support",
      "Custom integrations",
      "Reporting requirements",
    ],
    action: "Contact us",
    href: "/contact",
    featured: false,
  },
];

export default function PricingSection() {
  return (
    <section
      id="pricing"
      aria-labelledby="pricing-title"
      style={{
        background: "#fffdf8",
        color: "#111111",
        padding: "120px 32px 132px",
        scrollMarginTop: "88px",
        fontFamily: "inherit",
      }}
    >
      <div style={{ width: "min(1380px, 100%)", margin: "0 auto" }}>
        <header style={{ textAlign: "center", maxWidth: "900px", margin: "0 auto 70px" }}>
          <p className="applix-eyebrow" style={{ margin: "0 0 18px" }}>
            Pricing
          </p>
          <h2
            id="pricing-title"
            style={{
              margin: 0,
              fontSize: "clamp(52px, 6vw, 82px)",
              lineHeight: 0.98,
              fontWeight: 800,
              letterSpacing: "-0.055em",
              fontFamily: "inherit",
            }}
          >
            Simple, transparent pricing
          </h2>
          <p
            style={{
              margin: "26px auto 0",
              maxWidth: "760px",
              fontSize: "clamp(18px, 1.5vw, 22px)",
              lineHeight: 1.6,
              color: "#555",
            }}
          >
            Start free, choose the complete Applix campaign, or contact us for a custom workflow.
          </p>
        </header>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            alignItems: "stretch",
            maxWidth: "1280px",
            margin: "0 auto",
          }}
        >
          {plans.map((plan) => (
            <article
              key={plan.name}
              style={{
                position: "relative",
                display: "flex",
                flexDirection: "column",
                minHeight: "690px",
                padding: plan.featured ? "42px 38px 38px" : "52px 38px 38px",
                border: plan.featured ? "1px solid #111111" : "1px solid rgba(17,17,17,0.2)",
                background: plan.featured ? "#111111" : "#ffffff",
                color: plan.featured ? "#ffffff" : "#111111",
                transform: plan.featured ? "translateY(-18px)" : "none",
                boxShadow: plan.featured ? "0 30px 80px rgba(0,0,0,0.2)" : "none",
                zIndex: plan.featured ? 2 : 1,
                fontFamily: "inherit",
              }}
            >
              {plan.featured ? (
                <span
                  style={{
                    alignSelf: "flex-start",
                    marginBottom: "28px",
                    padding: "8px 12px",
                    border: "1px solid rgba(255,255,255,0.72)",
                    fontSize: "12px",
                    fontWeight: 800,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                  }}
                >
                  Most popular
                </span>
              ) : null}

              <p style={{ margin: 0, fontSize: "18px", fontWeight: 800 }}>{plan.name}</p>
              <div style={{ display: "flex", alignItems: "baseline", gap: "10px", margin: "22px 0 18px" }}>
                <strong
                  style={{
                    fontSize: plan.price.length > 7 ? "50px" : "68px",
                    lineHeight: 1,
                    fontWeight: 800,
                    letterSpacing: "-0.05em",
                  }}
                >
                  {plan.price}
                </strong>
                {plan.suffix ? <span style={{ opacity: 0.72, fontSize: "16px" }}>{plan.suffix}</span> : null}
              </div>

              <p style={{ margin: 0, minHeight: "92px", fontSize: "17px", lineHeight: 1.65, opacity: 0.76 }}>
                {plan.note}
              </p>

              <div style={{ display: "grid", gap: "18px", margin: "38px 0" }}>
                {plan.features.map((feature) => (
                  <div
                    key={feature}
                    style={{ display: "flex", gap: "13px", alignItems: "flex-start", fontSize: "16px", lineHeight: 1.5 }}
                  >
                    <span aria-hidden="true" style={{ fontWeight: 900 }}>✓</span>
                    <span>{feature}</span>
                  </div>
                ))}
              </div>

              <a
                className="applix-button applix-button--primary"
                href={plan.href}
                style={{
                  marginTop: "auto",
                  minHeight: "58px",
                  width: "100%",
                  fontSize: "14px",
                  textTransform: "uppercase",
                }}
              >
                {plan.action}
              </a>
            </article>
          ))}
        </div>

        <p style={{ margin: "34px auto 0", textAlign: "center", color: "#666", fontSize: "15px" }}>
          Prices are shown in Australian dollars. You review and approve applications before they move forward.
        </p>
      </div>
    </section>
  );
}
