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

const applixFont = "Arial, Helvetica, sans-serif";

export default function PricingSection() {
  return (
    <section
      id="pricing"
      aria-labelledby="pricing-title"
      style={{
        background: "#fffdf8",
        color: "#111111",
        padding: "96px 20px 112px",
        scrollMarginTop: "88px",
        fontFamily: applixFont,
      }}
    >
      <div style={{ width: "min(1120px, 100%)", margin: "0 auto" }}>
        <header style={{ textAlign: "center", maxWidth: "720px", margin: "0 auto 48px" }}>
          <p
            style={{
              margin: "0 0 12px",
              fontSize: "12px",
              fontWeight: 800,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              fontFamily: applixFont,
            }}
          >
            Pricing
          </p>
          <h2
            id="pricing-title"
            style={{
              margin: 0,
              fontSize: "clamp(36px, 5vw, 58px)",
              lineHeight: 1.02,
              fontWeight: 800,
              letterSpacing: "-0.045em",
              fontFamily: applixFont,
            }}
          >
            Simple, transparent pricing
          </h2>
          <p
            style={{
              margin: "18px auto 0",
              maxWidth: "620px",
              fontSize: "17px",
              lineHeight: 1.65,
              color: "#555",
              fontFamily: applixFont,
            }}
          >
            Start free, choose the complete Applix campaign, or contact us for a custom workflow.
          </p>
        </header>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(270px, 1fr))",
            alignItems: "stretch",
            maxWidth: "1040px",
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
                minHeight: "590px",
                padding: plan.featured ? "34px 30px 30px" : "42px 30px 30px",
                border: plan.featured ? "1px solid #111" : "1px solid rgba(17,17,17,0.22)",
                background: plan.featured ? "#111111" : "#ffffff",
                color: plan.featured ? "#ffffff" : "#111111",
                transform: plan.featured ? "translateY(-14px)" : "none",
                boxShadow: plan.featured ? "0 24px 70px rgba(0,0,0,0.18)" : "none",
                zIndex: plan.featured ? 2 : 1,
                fontFamily: applixFont,
              }}
            >
              {plan.featured ? (
                <span
                  style={{
                    alignSelf: "flex-start",
                    marginBottom: "22px",
                    padding: "6px 10px",
                    border: "1px solid rgba(255,255,255,0.7)",
                    fontSize: "10px",
                    fontWeight: 800,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    fontFamily: applixFont,
                  }}
                >
                  Most popular
                </span>
              ) : null}

              <p style={{ margin: 0, fontSize: "15px", fontWeight: 700, fontFamily: applixFont }}>{plan.name}</p>
              <div style={{ display: "flex", alignItems: "baseline", gap: "8px", margin: "18px 0 14px" }}>
                <strong
                  style={{
                    fontSize: plan.price.length > 7 ? "38px" : "52px",
                    lineHeight: 1,
                    fontWeight: 800,
                    letterSpacing: "-0.04em",
                    fontFamily: applixFont,
                  }}
                >
                  {plan.price}
                </strong>
                {plan.suffix ? <span style={{ opacity: 0.7, fontFamily: applixFont }}>{plan.suffix}</span> : null}
              </div>
              <p style={{ margin: 0, minHeight: "76px", lineHeight: 1.6, opacity: 0.74, fontFamily: applixFont }}>{plan.note}</p>

              <div style={{ display: "grid", gap: "15px", margin: "30px 0" }}>
                {plan.features.map((feature) => (
                  <div key={feature} style={{ display: "flex", gap: "11px", alignItems: "flex-start", lineHeight: 1.45, fontFamily: applixFont }}>
                    <span aria-hidden="true" style={{ fontWeight: 900 }}>✓</span>
                    <span>{feature}</span>
                  </div>
                ))}
              </div>

              <a
                href={plan.href}
                style={{
                  marginTop: "auto",
                  minHeight: "50px",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "0 18px",
                  border: plan.featured ? "1px solid #ffffff" : "1px solid #111111",
                  background: plan.featured ? "#ffffff" : "#111111",
                  color: plan.featured ? "#111111" : "#ffffff",
                  textDecoration: "none",
                  fontSize: "13px",
                  fontWeight: 800,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  fontFamily: applixFont,
                }}
              >
                {plan.action}
              </a>
            </article>
          ))}
        </div>

        <p style={{ margin: "26px auto 0", textAlign: "center", color: "#666", fontSize: "13px", fontFamily: applixFont }}>
          Prices are shown in Australian dollars. You review and approve applications before they move forward.
        </p>
      </div>
    </section>
  );
}
