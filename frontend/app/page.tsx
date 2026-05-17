export default function HomePage() {
  return (
    <main style={{ minHeight: "100vh", background: "#F5F3FF", fontFamily: "Arial", padding: 24 }}>
      <section style={{ maxWidth: 1180, margin: "0 auto" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 34 }}>Symbiote Applix</h1>
            <p style={{ color: "#6B7280" }}>Swipe jobs. Create resume. Approve application.</p>
          </div>
          <button style={{ background: "#6D28D9", color: "white", border: 0, borderRadius: 14, padding: "12px 18px" }}>
            Launch Symbiote
          </button>
        </header>

        <div style={{ display: "grid", gridTemplateColumns: "260px 1fr 280px", gap: 20 }}>
          <aside style={{ display: "grid", gap: 16 }}>
            <div style={{ background: "white", borderRadius: 22, padding: 18 }}>
              <h3>➡ New Matched Jobs</h3>
              {["NDIS Support Worker", "Aged Care Worker", "Disability Support"].map((x) => (
                <div key={x} style={{ padding: 12, border: "1px solid #eee", borderRadius: 16, marginTop: 10 }}>
                  <b>{x}</b>
                  <p style={{ margin: "6px 0", color: "#6B7280" }}>Sydney • 95% match</p>
                </div>
              ))}
            </div>

            <div style={{ background: "white", borderRadius: 22, padding: 18 }}>
              <h3>⬅ Old Matched Jobs</h3>
              {["Community Worker", "Care Assistant"].map((x) => (
                <div key={x} style={{ padding: 12, border: "1px solid #eee", borderRadius: 16, marginTop: 10 }}>
                  <b>{x}</b>
                  <p style={{ margin: "6px 0", color: "#6B7280" }}>Older match</p>
                </div>
              ))}
            </div>
          </aside>

          <section style={{ background: "white", borderRadius: 28, padding: 28, height: "78vh", overflowY: "auto" }}>
            <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
              <div style={{ width: 
