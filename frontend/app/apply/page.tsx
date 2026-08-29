import Link from "next/link";

const kitItems = [
  "Tailored resume summary",
  "Role-specific cover letter",
  "Interview talking points",
  "Application checklist",
];

export default function ApplyPage() {
  return (
    <main style={styles.main}>
      <section style={styles.card}>
        <Link href="/" style={styles.backLink}>← Home</Link>
        <p style={styles.badge}>Application kit</p>
        <h1 style={styles.title}>Turn a job match into an application.</h1>
        <p style={styles.subtitle}>
          This page will become the AI workspace for resumes, cover letters, interview notes, and final application review.
        </p>

        <div style={styles.grid}>
          {kitItems.map((item) => (
            <div key={item} style={styles.itemCard}>
              <span style={styles.check}>✓</span>
              <h2 style={styles.itemTitle}>{item}</h2>
              <p style={styles.itemText}>Draft content will appear here after Applix connects to the AI backend.</p>
            </div>
          ))}
        </div>

        <div style={styles.actions}>
          <Link href="/matching" style={styles.secondaryButton}>Back to matches</Link>
          <button type="button" style={styles.primaryButton}>Generate kit soon</button>
        </div>
      </section>
    </main>
  );
}

const styles = {
  main: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #ecfeff 0%, #f8fafc 50%, #fef3c7 100%)",
    fontFamily: "Arial, Helvetica, sans-serif",
    padding: 24,
  },
  card: {
    maxWidth: 980,
    margin: "0 auto",
    background: "white",
    borderRadius: 30,
    padding: 28,
    boxShadow: "0 20px 60px rgba(15,23,42,0.08)",
  },
  backLink: {
    color: "#111827",
    textDecoration: "none",
    fontWeight: 900,
  },
  badge: {
    display: "inline-block",
    marginTop: 40,
    padding: "8px 12px",
    borderRadius: 999,
    background: "#dcfce7",
    color: "#166534",
    fontWeight: 900,
  },
  title: {
    maxWidth: 720,
    margin: "18px 0 12px",
    fontSize: "clamp(36px, 7vw, 64px)",
    lineHeight: 0.98,
    letterSpacing: -2,
  },
  subtitle: {
    maxWidth: 680,
    color: "#64748b",
    lineHeight: 1.7,
    fontSize: 18,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 14,
    marginTop: 30,
  },
  itemCard: {
    border: "1px solid #e5e7eb",
    borderRadius: 24,
    padding: 20,
    background: "#f8fafc",
  },
  check: {
    display: "grid",
    placeItems: "center",
    width: 34,
    height: 34,
    borderRadius: 999,
    background: "#22c55e",
    color: "white",
    fontWeight: 900,
  },
  itemTitle: {
    fontSize: 19,
    margin: "18px 0 8px",
  },
  itemText: {
    color: "#64748b",
    lineHeight: 1.6,
  },
  actions: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 12,
    marginTop: 26,
  },
  primaryButton: {
    border: 0,
    borderRadius: 999,
    background: "#111827",
    color: "white",
    padding: "15px 20px",
    fontWeight: 900,
    fontSize: 16,
  },
  secondaryButton: {
    borderRadius: 999,
    background: "white",
    color: "#111827",
    border: "1px solid #e5e7eb",
    padding: "15px 20px",
    fontWeight: 900,
    textDecoration: "none",
  },
};
