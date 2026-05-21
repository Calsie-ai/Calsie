import Link from "next/link";

export default function AdzunaTestPage() {
  return (
    <main style={styles.main}>
      <section style={styles.card}>
        <p style={styles.badge}>System managed</p>
        <h1 style={styles.title}>Job fetching is automatic now.</h1>
        <p style={styles.text}>
          Applix collects jobs in the background. Users do not choose fetch limits,
          max results, or manual Adzuna controls.
        </p>
        <Link href="/matching" style={styles.button}>
          Go to matching
        </Link>
      </section>
    </main>
  );
}

const styles = {
  main: {
    minHeight: "100vh",
    padding: 24,
    display: "grid",
    placeItems: "center",
    background: "#f8fafc",
    color: "#111827",
    fontFamily: "Arial, Helvetica, sans-serif",
  },
  card: {
    maxWidth: 680,
    background: "white",
    borderRadius: 28,
    padding: 30,
    boxShadow: "0 20px 60px rgba(15,23,42,0.08)",
  },
  badge: {
    display: "inline-block",
    padding: "8px 12px",
    borderRadius: 999,
    background: "#eef2ff",
    color: "#4338ca",
    fontWeight: 900,
  },
  title: {
    margin: "18px 0 12px",
    fontSize: "clamp(34px, 7vw, 58px)",
    lineHeight: 1,
    letterSpacing: -2,
  },
  text: {
    color: "#64748b",
    fontSize: 18,
    lineHeight: 1.7,
  },
  button: {
    display: "inline-block",
    marginTop: 18,
    borderRadius: 999,
    background: "#111827",
    color: "white",
    padding: "14px 18px",
    fontWeight: 900,
    textDecoration: "none",
  },
};
