"use client";

export default function HomePage() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#fff7fb", fontFamily: "Arial, Helvetica, sans-serif", textAlign: "center", padding: 24 }}>
      <section style={{ width: "min(420px, 100%)", padding: 28, borderRadius: 28, background: "rgba(255,255,255,.78)", boxShadow: "0 18px 45px rgba(0,0,0,.12)" }}>
        <img src="/applix-logo.svg" alt="Applix logo" style={{ width: 90 }} />
        <h1 style={{ color: "#ff5ca8", fontSize: 64, margin: "12px 0", letterSpacing: ".08em" }}>APPLIX</h1>
        <p style={{ fontWeight: 900, letterSpacing: ".08em", textTransform: "uppercase" }}>Magic link login has been removed.</p>
        <p style={{ fontWeight: 700 }}>Google login setup is ready in Supabase. Add the login button code after provider testing.</p>
      </section>
    </main>
  );
}
