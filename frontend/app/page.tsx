"use client";

import { useState } from "react";

const jobs = [
  {
    title: "NDIS Support Worker",
    company: "CareConnect Services",
    logo: "🏢",
    location: "Sydney NSW",
    salary: "$35–$40/hr",
    type: "Part-time",
    match: "95%",
    description:
      "Support NDIS participants with daily living, community access, appointments, and independence goals.",
  },
  {
    title: "Aged Care Support Worker",
    company: "SilverCare Australia",
    logo: "💙",
    location: "Parramatta NSW",
    salary: "$32–$38/hr",
    type: "Casual",
    match: "91%",
    description:
      "Provide personal care, companionship, mobility support, and daily assistance to aged care clients.",
  },
];

export default function HomePage() {
  const [index, setIndex] = useState(0);
  const [resumeCreated, setResumeCreated] = useState(false);

  const job = jobs[index];

  function nextJob() {
    setResumeCreated(false);
    setIndex((index + 1) % jobs.length);
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(135deg, #ff5f6d 0%, #ffc371 45%, #7c3aed 100%)",
        fontFamily: "Arial, sans-serif",
        padding: 20,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <section
        style={{
          width: "100%",
          maxWidth: 430,
          height: "92vh",
          background: "#111827",
          borderRadius: 36,
          padding: 14,
          boxShadow: "0 30px 80px rgba(0,0,0,0.35)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <header
          style={{
            color: "white",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "8px 10px 14px",
          }}
        >
          <strong style={{ fontSize: 22 }}>Aplix</strong>
          <span style={{ fontSize: 13, opacity: 0.75 }}>
            New matches →
          </span>
        </header>

        <div
          style={{
            flex: 1,
            background: "white",
            borderRadius: 30,
            overflowY: "auto",
            position: "relative",
          }}
        >
          <div
            style={{
              minHeight: 560,
              background:
                "linear-gradient(180deg, #ede9fe 0%, #ffffff 45%)",
              padding: 22,
            }}
          >
            <div
              style={{
                height: 190,
                borderRadius: 28,
                background:
                  "linear-gradient(135deg, #7c3aed, #ec4899)",
                color: "white",
                padding: 20,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
              }}
            >
              <div
                style={{
                  width: 70,
                  height: 70,
                  borderRadius: 22,
                  background: "rgba(255,255,255,0.22)",
                  display: "grid",
                  placeItems: "center",
                  fontSize: 34,
                }}
              >
                {job.logo}
              </div>

              <div>
                <span
                  style={{
                    background: "rgba(255,255,255,0.25)",
                    padding: "6px 10px",
                    borderRadius: 999,
                    fontSize: 12,
                  }}
                >
                  {job.match} match
                </span>
                <h1 style={{ margin: "10px 0 4px", fontSize: 28 }}>
                  {job.title}
                </h1>
                <p style={{ margin: 0, opacity: 0.9 }}>{job.company}</p>
              </div>
            </div>

            <div style={{ paddingTop: 22 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {[job.location, job.salary, job.type].map((item) => (
                  <span
                    key={item}
                    style={{
                      background: "#f3f4f6",
                      padding: "8px 12px",
                      borderRadius: 999,
                      fontSize: 13,
                    }}
                  >
                    {item}
                  </span>
                ))}
              </div>

              <h3 style={{ marginTop: 24 }}>Job description</h3>
              <p style={{ color: "#4b5563", lineHeight: 1.7 }}>
                {job.description}
              </p>

              <h3>Why it matches you</h3>
              <p style={{ color: "#4b5563", lineHeight: 1.7 }}>
                This role matches your preferred location, support-care
                experience, and NDIS-related skills.
              </p>

              <div style={{ height: 180 }} />

              <div
                style={{
                  border: "1px solid #ddd6fe",
                  background: "#faf5ff",
                  borderRadius: 24,
                  padding: 18,
                }}
              >
                <h2 style={{ marginTop: 0 }}>Create tailored resume</h2>
                <p style={{ color: "#6b7280" }}>
                  AI will create a resume version for this specific job.
                </p>

                <button
                  onClick={() => setResumeCreated(true)}
                  style={{
                    width: "100%",
                    border: 0,
                    borderRadius: 18,
                    padding: 16,
                    background: "#7c3aed",
                    color: "white",
                    fontSize: 16,
                    fontWeight: 700,
                  }}
                >
                  Create Resume
                </button>
              </div>

              {resumeCreated && (
                <div
                  style={{
                    marginTop: 16,
                    border: "1px solid #bbf7d0",
                    background: "#f0fdf4",
                    borderRadius: 24,
                    padding: 18,
                  }}
                >
                  <h3 style={{ marginTop: 0 }}>Resume ready</h3>
                  <p style={{ color: "#166534" }}>
                    Tailored resume created for {job.title}.
                  </p>
                  <button
                    style={{
                      width: "100%",
                      border: "1px solid #86efac",
                      borderRadius: 16,
                      padding: 14,
                      background: "white",
                      color: "#166534",
                      fontWeight: 700,
                    }}
                  >
                    Preview Resume
                  </button>
                </div>
              )}

              <button
                disabled={!resumeCreated}
                style={{
                  width: "100%",
                  marginTop: 16,
                  border: 0,
                  borderRadius: 18,
                  padding: 17,
                  background: resumeCreated ? "#22c55e" : "#d1d5db",
                  color: resumeCreated ? "white" : "#6b7280",
                  fontSize: 17,
                  fontWeight: 800,
                }}
              >
                {resumeCreated ? "Approve & Apply" : "Apply locked"}
              </button>

              <button
                onClick={nextJob}
                style={{
                  width: "100%",
                  marginTop: 14,
                  marginBottom: 22,
                  border: 0,
                  borderRadius: 18,
                  padding: 17,
                  background: "#111827",
                  color: "white",
                  fontSize: 16,
                  fontWeight: 700,
                }}
              >
                Next Job / Continue
              </button>
            </div>
          </div>
        </div>

        <footer
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            padding: "14px 4px 0",
          }}
        >
          <button
            onClick={nextJob}
            style={{
              padding: 16,
              borderRadius: 999,
              border: 0,
              background: "white",
              color: "#ef4444",
              fontWeight: 800,
              fontSize: 16,
            }}
          >
            ← Old / Skip
          </button>

          <button
            onClick={() => setResumeCreated(false)}
            style={{
              padding: 16,
              borderRadius: 999,
              border: 0,
              background: "white",
              color: "#22c55e",
              fontWeight: 800,
              fontSize: 16,
            }}
          >
            New / Interested →
          </button>
        </footer>
      </section>
    </main>
  );
}
