import Link from "next/link";

const steps = [
  "Create your work profile",
  "Swipe through job matches",
  "Generate an AI application kit",
];

export default function HomePage() {
  return (
    <main style={styles.main}>
      <section style={styles.hero}>
        <p style={styles.badge}>Applix by ASSI</p>
        <h1 style={styles.title}>Your AI employment symbiote.</h1>
        <p style={styles.subtitle}>
          Applix helps job seekers match with roles, understand why they fit,
          and prepare tailored applications faster.
        </p>

        <div style={styles.actions}>
          <Link href="/matching" style={styles.primaryButton}>
            Start Matching
          </Link>
          <Link href="/profile" style={styles.secondaryButton}>
            Create Profile
          </Link>
          <Link href="/apply" style={styles.secondaryButton}>
            Application Kit
          </Link>
        </div>
      </section>

      <section style={styles.panel}>
        <h2 style={styles.panelTitle}>Build flow</h2>
        <div style={styles.steps}>
          {steps.map((step, index) => (
            <div key={step} style={styles.stepCard}>
              <span style={styles.stepNumber}>{index + 1}</span>
              <p style={styles.stepText}>{step}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

const styles = {
  main: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #0f172a 0%, #111827 55%, #312e81 100%)",
    color: "white",
    fontFamily: "Arial, Helvetica, sans-serif",
    padding: "48px 24px",
  },
  hero: {
    maxWidth: 960,
    margin: "0 auto",
    padding: "72px 0 40px",
  },
  badge: {
    display: "inline-block",
    padding: "9px 14px",
    borderRadius: 999,
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.14)",
    color: "#bfdbfe",
    fontWeight: 700,
  },
  title: {
    maxWidth: 760,
    margin: "24px 0 18px",
    fontSize: "clamp(44px, 8vw, 82px)",
    lineHeight: 0.95,
    letterSpacing: -3,
  },
  subtitle: {
    maxWidth: 680,
    color: "#cbd5e1",
    fontSize: 20,
    lineHeight: 1.7,
  },
  actions: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 14,
    marginTop: 34,
  },
  primaryButton: {
    padding: "15px 22px",
    borderRadius: 999,
    background: "#ffffff",
    color: "#111827",
    textDecoration: "none",
    fontWeight: 900,
  },
  secondaryButton: {
    padding: "15px 22px",
    borderRadius: 999,
    background: "rgba(255,255,255,0.08)",
    color: "white",
    border: "1px solid rgba(255,255,255,0.14)",
    textDecoration: "none",
    fontWeight: 800,
  },
  panel: {
    maxWidth: 960,
    margin: "0 auto",
    padding: 24,
    borderRadius: 28,
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.12)",
  },
  panelTitle: {
    margin: "0 0 18px",
  },
  steps: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 14,
  },
  stepCard: {
    background: "rgba(255,255,255,0.08)",
    borderRadius: 22,
    padding: 20,
  },
  stepNumber: {
    display: "grid",
    placeItems: "center",
    width: 36,
    height: 36,
    borderRadius: 999,
    background: "white",
    color: "#111827",
    fontWeight: 900,
  },
  stepText: {
    margin: "16px 0 0",
    color: "#e5e7eb",
    fontWeight: 700,
  },
};
