export default function HomePage() {
  return (
    <main style={styles.main}>
      <section style={styles.hero}>
        <p style={styles.badge}>Applix by ASSI</p>

        <h1 style={styles.title}>
          Your AI employment symbiote.
        </h1>

        <p style={styles.subtitle}>
          Applix helps users understand jobs, applications, resumes,
          interviews, and workplace tasks with guided AI support.
        </p>

        <div style={styles.buttons}>
          <a href="#start" style={styles.primaryButton}>
            Start with Applix
          </a>
          <a href="#features" style={styles.secondaryButton}>
            See features
          </a>
        </div>
      </section>

      <section id="features" style={styles.section}>
        <h2>What Applix will do</h2>

        <div style={styles.grid}>
          <div style={styles.card}>
            <h3>Resume guidance</h3>
            <p>Help users improve resumes, cover letters, and job applications.</p>
          </div>

          <div style={styles.card}>
            <h3>Job search support</h3>
            <p>Guide users through job listings, requirements, and next steps.</p>
          </div>

          <div style={styles.card}>
            <h3>Interview preparation</h3>
            <p>Practice questions, answers, and confidence-building support.</p>
          </div>

          <div style={styles.card}>
            <h3>Workplace assistant</h3>
            <p>Help users understand tasks, emails, forms, and workplace systems.</p>
          </div>
        </div>
      </section>

      <section id="start" style={styles.section}>
        <h2>Early access</h2>
        <p>
          Applix is currently being built. This page confirms the deployment
          pipeline is working and ready for the next product features.
        </p>
      </section>
    </main>
  );
}

const styles = {
  main: {
    minHeight: "100vh",
    background: "#0b0f19",
    color: "#ffffff",
    fontFamily: "Arial, Helvetica, sans-serif",
  },
  hero: {
    padding: "90px 24px",
    maxWidth: "1000px",
    margin: "0 auto",
  },
  badge: {
    display: "inline-block",
    padding: "8px 14px",
    border: "1px solid #334155",
    borderRadius: "999px",
    color: "#93c5fd",
    marginBottom: "24px",
  },
  title: {
    fontSize: "56px",
    lineHeight: "1.05",
    margin: "0 0 24px",
    maxWidth: "760px",
  },
  subtitle: {
    fontSize: "20px",
    lineHeight: "1.6",
    color: "#cbd5e1",
    maxWidth: "720px",
  },
  buttons: {
    display: "flex",
    gap: "14px",
    marginTop: "32px",
    flexWrap: "wrap" as const,
  },
  primaryButton: {
    background: "#3b82f6",
    color: "#ffffff",
    padding: "14px 20px",
    borderRadius: "10px",
    textDecoration: "none",
    fontWeight: "bold",
  },
  secondaryButton: {
    background: "transparent",
    color: "#ffffff",
    padding: "14px 20px",
    borderRadius: "10px",
    textDecoration: "none",
    border: "1px solid #334155",
    fontWeight: "bold",
  },
  section: {
    maxWidth: "1000px",
    margin: "0 auto",
    padding: "40px 24px",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "18px",
    marginTop: "24px",
  },
  card: {
    background: "#111827",
    border: "1px solid #1f2937",
    borderRadius: "16px",
    padding: "22px",
  },
};
