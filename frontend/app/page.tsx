import Link from "next/link";

const steps = [
  "Create your work profile",
  "Swipe through job matches",
  "Open the live apply dashboard",
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
          <Link href="/login" style={styles.redButton}>
            Sign up
          </Link>
          <Link href="/profile" style={styles.secondaryButton}>
            Create Profile
          </Link>
          <Link href="/api/google/connect" style={styles.gmailButton}>
            Connect Gmail
          </Link>
          <Link href="/matching" style={styles.primaryButton}>
            Start Matching
          </Link>
          <Link href="/applying/live" style={styles.applyButton}>
            Apply Jobs
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
    background: "#eef0f4",
    color: "white",
    fontFamily: "Arial, Helvetica, sans-serif",
    padding: "80px 28px",
  },
  hero: {
    maxWidth: 1180,
    margin: "0 auto",
    padding: "86px 70px 40px",
    background: "linear-gradient(135deg, #0b1220 0%, #101a30 55%, #171944 100%)",
    borderTop: "10px solid #8065b7",
    boxShadow: "0 30px 80px rgba(15, 23, 42, 0.18)",
  },
  badge: {
    display: "inline-block",
    padding: "10px 18px",
    borderRadius: 999,
    background: "rgba(255,255,255,0.09)",
    border: "1px solid rgba(255,255,255,0.12)",
    color: "#cfe0ff",
    fontWeight: 900,
  },
  title: {
    maxWidth: 760,
    margin: "48px 0 22px",
    fontSize: "clamp(54px, 8vw, 92px)",
    lineHeight: 0.98,
    letterSpacing: -4,
  },
  subtitle: {
    maxWidth: 720,
    color: "#d6def0",
    fontSize: 21,
    lineHeight: 1.65,
  },
  actions: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 26,
    alignItems: "center",
    marginTop: 34,
  },
  redButton: {
    padding: "17px 32px",
    borderRadius: 999,
    background: "#ff1717",
    color: "#050505",
    textDecoration: "none",
    fontWeight: 900,
    fontSize: 20,
    textTransform: "uppercase" as const,
  },
  primaryButton: {
    padding: "17px 32px",
    borderRadius: 999,
    background: "#ffffff",
    color: "#111827",
    textDecoration: "none",
    fontWeight: 900,
  },
  secondaryButton: {
    padding: "19px 36px",
    borderRadius: 999,
    background: "rgba(255,255,255,0.08)",
    color: "white",
    border: "1px solid rgba(255,255,255,0.14)",
    textDecoration: "none",
    fontWeight: 900,
  },
  gmailButton: {
    padding: "17px 32px",
    borderRadius: 999,
    background: "#21c86a",
    color: "#06160c",
    textDecoration: "none",
    fontWeight: 900,
  },
  applyButton: {
    padding: "17px 32px",
    borderRadius: 999,
    background: "linear-gradient(135deg, #00d4ff, #7c3aed)",
    color: "white",
    textDecoration: "none",
    fontWeight: 900,
    boxShadow: "0 0 30px rgba(0, 212, 255, 0.28)",
  },
  panel: {
    maxWidth: 1180,
    margin: "0 auto",
    padding: 24,
    background: "#101a30",
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