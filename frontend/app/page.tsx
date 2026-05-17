export default function HomePage() {
  return (
    <main style={{ minHeight: "100vh", background: "#f7f6fb", padding: 24, fontFamily: "Arial" }}>
      <h1>Aplix Job Swipe</h1>
      <p>Swipe right for new matched jobs. Swipe left for old matched jobs. Scroll down to create resume and apply.</p>

      <section style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 24, marginTop: 24 }}>
        {/* LEFT JOB LIST */}
        <aside>
          <div style={{ background: "white", borderRadius: 18, padding: 18 }}>
            <h3 style={{ color: "#6d35e8" }}>New Matched Jobs →</h3>

            {["NDIS Support Worker", "Aged Care Support Worker", "Disability Support Worker"].map((job) => (
              <div key={job} style={{ border: "1px solid #eee", borderRadius: 14, padding: 14, marginTop: 12 }}>
                <strong>{job}</strong>
                <p>CareConnect Services</p>
                <small>Sydney NSW • $35–$40/hr • 95% match</small>
              </div>
            ))}
          </div>

          <div style={{ background: "white", borderRadius: 18, padding: 18, marginTop: 20 }}>
            <h3 style={{ color: "#6d35e8" }}>← Old Matched Jobs</h3>

            {["Support Worker", "Community Support Worker", "Support Coordinator"].map((job) => (
              <div key={job} style={{ border: "1px solid #eee", borderRadius: 14, padding: 14, marginTop: 12 }}>
                <strong>{job}</strong>
                <p>Older match</p>
                <small>NSW • 80% match</small>
              </div>
            ))}
          </div>
        </aside>

        {/* MAIN SINGLE PAGE JOB CARD */}
        <section style={{ background: "white", borderRadius: 24, padding: 28, maxHeight: "85vh", overflowY: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ width: 70, height: 70, borderRadius: 18, background: "#e8fff6", display: "grid", placeItems: "center", fontSize: 30 }}>
              💜
            </div>
            <div>
              <span style={{ background: "#6d35e8", color: "white", padding: "6px 10px", borderRadius: 10 }}>NEW MATCH</span>
              <h2>NDIS Support Worker</h2>
              <p>CareConnect Services</p>
            </div>
          </div>

          <p style={{ marginTop: 16 }}>📍 Sydney NSW • 💰 $35–$40/hr • ⏱ Part-time</p>
          <p>Posted 2 hours ago • 2.3 km away</p>

          <hr />

          <h3>About the role</h3>
          <p style={{ lineHeight: 1.7 }}>
            We are looking for a compassionate and reliable Support Worker to support NDIS participants with daily living,
            community access, appointments, and independence goals.
          </p>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {["NDIS", "Community Support", "Disability Care"].map((tag) => (
              <span key={tag} style={{ background: "#f1f1f5", padding: "8px 12px", borderRadius: 999 }}>{tag}</span>
            ))}
          </div>

          <div style={{ height: 180 }} />

          <h3>Create Your Resume</h3>
          <div style={{ border: "1px solid #d8c9ff", background: "#fbf8ff", borderRadius: 18, padding: 18 }}>
            <strong>Tailor a resume for this job</strong>
            <p>AI will create a resume using your saved profile and this job description.</p>
            <button style={{ width: "100%", background: "#6d35e8", color: "white", border: 0, borderRadius: 14, padding: 16 }}>
              Create Resume
            </button>
          </div>

          <div style={{ marginTop: 26 }}>
            <h3>Your Tailored Resume</h3>
            <div style={{ border: "1px solid #eee", borderRadius: 14, padding: 14 }}>
              📄 NDIS_Support_Worker_Resume.pdf
              <button style={{ float: "right" }}>Preview</button>
            </div>

            <h3>Cover Letter</h3>
            <div style={{ border: "1px solid #eee", borderRadius: 14, padding: 14 }}>
              📄 Cover_Letter_NDIS_Support_Worker.pdf
              <button style={{ float: "right" }}>Preview</button>
            </div>
          </div>

          <div style={{ marginTop: 26, border: "1px solid #b9efc8", background: "#f3fff6", borderRadius: 18, padding: 18 }}>
            <h3>Apply To This Job</h3>
            <p>Before resume creation, this button is grey. After resume creation, it turns green.</p>

            <button style={{ width: "100%", background: "#22b96b", color: "white", border: 0, borderRadius: 14, padding: 16 }}>
              Apply
            </button>
          </div>

          <div style={{ marginTop: 18, border: "1px solid #d8c9ff", background: "#fbf8ff", borderRadius: 18, padding: 18 }}>
            <strong>Approve before applying</strong>
            <p>Your application will be submitted only after your approval.</p>
            <button style={{ width: "100%", background: "#6d35e8", color: "white", border: 0, borderRadius: 14, padding: 16 }}>
              Approve & Apply
            </button>
          </div>

          <button style={{ marginTop: 20, width: "100%", background: "#6d35e8", color: "white", border: 0, borderRadius: 14, padding: 18 }}>
            Next Job / Continue →
          </button>
        </section>
      </section>
    </main>
  );
}
