import Link from "next/link";

export default function ProfilePage() {
  return (
    <main style={styles.main}>
      <section style={styles.card}>
        <Link href="/" style={styles.backLink}>← Home</Link>
        <p style={styles.badge}>Profile setup</p>
        <h1 style={styles.title}>Tell Applix what work fits you.</h1>
        <p style={styles.subtitle}>
          This screen will collect the user profile that powers job matching: location, experience, skills, availability, pay expectations, and preferred roles.
        </p>

        <div style={styles.formGrid}>
          <label style={styles.field}>
            Preferred role
            <input style={styles.input} placeholder="Support Worker, Admin Assistant..." />
          </label>
          <label style={styles.field}>
            Location
            <input style={styles.input} placeholder="Sydney NSW" />
          </label>
          <label style={styles.field}>
            Availability
            <input style={styles.input} placeholder="Part-time, casual, full-time" />
          </label>
          <label style={styles.field}>
            Key skills
            <textarea style={styles.textarea} placeholder="NDIS, personal care, customer service..." />
          </label>
        </div>

        <Link href="/matching" style={styles.primaryButton}>Save profile and match jobs</Link>
      </section>
    </main>
  );
}

const styles = {
  main: {
    minHeight: "100vh",
    background: "#f8fafc",
    fontFamily: "Arial, Helvetica, sans-serif",
    padding: 24,
  },
  card: {
    maxWidth: 820,
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
    background: "#eef2ff",
    color: "#4338ca",
    fontWeight: 900,
  },
  title: {
    maxWidth: 650,
    margin: "18px 0 12px",
    fontSize: "clamp(36px, 7vw, 64px)",
    lineHeight: 0.98,
    letterSpacing: -2,
  },
  subtitle: {
    maxWidth: 650,
    color: "#64748b",
    lineHeight: 1.7,
    fontSize: 18,
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: 14,
    marginTop: 28,
  },
  field: {
    display: "grid",
    gap: 8,
    color: "#334155",
    fontWeight: 900,
  },
  input: {
    border: "1px solid #e5e7eb",
    borderRadius: 16,
    padding: 14,
    fontSize: 16,
  },
  textarea: {
    border: "1px solid #e5e7eb",
    borderRadius: 16,
    padding: 14,
    fontSize: 16,
    minHeight: 120,
    resize: "vertical" as const,
  },
  primaryButton: {
    display: "inline-block",
    marginTop: 24,
    borderRadius: 999,
    background: "#111827",
    color: "white",
    padding: "15px 20px",
    textDecoration: "none",
    fontWeight: 900,
  },
};
