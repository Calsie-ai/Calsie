export default function HomePage() {
  return (
    <main
      style={{
        padding: "40px",
        fontFamily: "Arial, sans-serif",
        background: "#f8f8fb",
        minHeight: "100vh",
      }}
    >
      {/* HEADER */}
      <div style={{ marginBottom: "40px" }}>
        <h1
          style={{
            fontSize: "42px",
            fontWeight: 700,
            marginBottom: "10px",
          }}
        >
          Aplix – Job Match & Apply Workflow
        </h1>

        <p
          style={{
            fontSize: "18px",
            color: "#666",
          }}
        >
          Swipe to explore new matches. Create a tailored resume, then apply
          with one click.
        </p>
      </div>

      {/* MAIN GRID */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "320px 1fr 1fr",
          gap: "30px",
          alignItems: "start",
        }}
      >
        {/* LEFT SIDEBAR */}
        <div>
          {/* NEW MATCHES */}
          <div
            style={{
              background: "white",
              borderRadius: "20px",
              padding: "20px",
              marginBottom: "30px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
            }}
          >
            <h2 style={{ color: "#6c3df4" }}>✨ NEW MATCHED JOBS</h2>

            {[
              "NDIS Support Worker",
              "Aged Care Support Worker",
              "Disability Support Worker",
            ].map((job, index) => (
              <div
                key={index}
                style={{
                  border: "1px solid #eee",
                  borderRadius: "16px",
                  padding: "15px",
                  marginTop: "15px",
                }}
              >
                <h3>{job}</h3>
                <p style={{ color: "#777" }}>Sydney, NSW</p>
                <div
                  style={{
                    background: "#dff7e3",
                    color: "#2e8b57",
                    display: "inline-block",
                    padding: "4px 10px",
                    borderRadius: "10px",
                    fontSize: "12px",
                  }}
                >
                  95% Match
                </div>
              </div>
            ))}
          </div>

          {/* OLD MATCHES */}
          <div
            style={{
              background: "white",
              borderRadius: "20px",
              padding: "20px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
            }}
          >
            <h2 style={{ color: "#6c3df4" }}>🕘 OLD MATCHED JOBS</h2>

            {[
              "Support Worker",
              "Community Support Worker",
              "Support Coordinator",
            ].map((job, index) => (
              <div
                key={index}
                style={{
                  border: "1px solid #eee",
                  borderRadius: "16px",
                  padding: "15px",
                  marginTop: "15px",
                }}
              >
                <h3>{job}</h3>
                <p style={{ color: "#777" }}>NSW</p>
              </div>
            ))}
          </div>
        </div>

        {/* JOB DETAILS */}
        <div
          style={{
            background: "white",
            borderRadius: "24px",
            padding: "30px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
          }}
        >
          <div
            style={{
              background: "#6c3df4",
              color: "white",
              display: "inline-block",
              padding: "6px 14px",
              borderRadius: "12px",
              marginBottom: "20px",
            }}
          >
            NEW MATCH
          </div>

          <h1 style={{ fontSize: "36px", marginBottom: "10px" }}>
            NDIS Support Worker
          </h1>

          <p style={{ color: "#777", marginBottom: "20px" }}>
            Sydney, NSW • $35–40/hr • Part-time
          </p>

          <h3>About the role</h3>

          <p
            style={{
              color: "#444",
              lineHeight: 1.7,
            }}
          >
            We are looking for a compassionate and reliable Support Worker to
            join our team and support NDIS participants to achieve their goals
            and live independently.
          </p>

          {/* TAGS */}
          <div
            style={{
              display: "flex",
              gap: "10px",
              marginTop: "20px",
              flexWrap: "wrap",
            }}
          >
            {["NDIS", "Community Support", "Disability Care"].map(
              (tag, index) => (
                <div
                  key={index}
                  style={{
                    background: "#f2f2f7",
                    padding: "8px 14px",
                    borderRadius: "999px",
                    fontSize: "14px",
                  }}
                >
                  {tag}
                </div>
              )
            )}
          </div>

          {/* CREATE RESUME */}
          <div
            style={{
              marginTop: "40px",
              border: "1px solid #ddd",
              borderRadius: "20px",
              padding: "20px",
            }}
          >
            <h3>Create Your Resume</h3>

            <p style={{ color: "#666" }}>
              AI will create a personalized resume tailored for this job.
            </p>

            <button
              style={{
                width: "100%",
                background: "#6c3df4",
                color: "white",
                border: "none",
                padding: "16px",
                borderRadius: "14px",
                marginTop: "20px",
                fontSize: "16px",
                cursor: "pointer",
              }}
            >
              Create Resume
            </button>
          </div>

          {/* ACTIONS */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: "40px",
            }}
          >
            <button
              style={{
                padding: "14px 20px",
                borderRadius: "14px",
                border: "1px solid #ddd",
                background: "white",
              }}
            >
              Skip
            </button>

            <button
              style={{
                padding: "14px 20px",
                borderRadius: "14px",
                border: "1px solid #ddd",
                background: "white",
              }}
            >
              Save
            </button>

            <button
              style={{
                padding: "14px 20px",
                borderRadius: "14px",
                border: "none",
                background: "#20c997",
                color: "white",
              }}
            >
              Interested
            </button>
          </div>

          {/* NEXT JOB */}
          <button
            style={{
              width: "100%",
              marginTop: "30px",
              background: "#6c3df4",
              color: "white",
              border: "none",
              padding: "18px",
              borderRadius: "16px",
              fontSize: "16px",
            }}
          >
            Next Job →
          </button>
        </div>

        {/* APPLY PANEL */}
        <div
          style={{
            background: "white",
            borderRadius: "24px",
            padding: "30px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
          }}
        >
          <h2>Your Tailored Resume</h2>

          {/* RESUME FILE */}
          <div
            style={{
              border: "1px solid #eee",
              borderRadius: "16px",
              padding: "16px",
              marginTop: "20px",
            }}
          >
            <strong>NDIS_Support_Worker_Resume.pdf</strong>
            <p style={{ color: "#777" }}>Created just now</p>
          </div>

          {/* COVER LETTER */}
          <div
            style={{
              border: "1px solid #eee",
              borderRadius: "16px",
              padding: "16px",
              marginTop: "20px",
            }}
          >
            <strong>Cover_Letter.pdf</strong>
            <p style={{ color: "#777" }}>Created just now</p>
          </div>

          {/* APPLY */}
          <div
            style={{
              marginTop: "30px",
              background: "#f5fff8",
              border: "1px solid #b7f0c7",
              borderRadius: "20px",
              padding: "20px",
            }}
          >
            <h3>Apply To This Job</h3>

            <p style={{ color: "#666" }}>
              Review your resume and approve the application.
            </p>

            <button
              style={{
                width: "100%",
                marginTop: "20px",
                background: "#20c997",
                color: "white",
                border: "none",
                padding: "16px",
                borderRadius: "14px",
                fontSize: "16px",
              }}
            >
              Approve & Apply
            </button>
          </div>

          {/* CONTINUE */}
          <button
            style={{
              width: "100%",
              marginTop: "30px",
              background: "#6c3df4",
              color: "white",
              border: "none",
              padding: "18px",
              borderRadius: "16px",
              fontSize: "16px",
            }}
          >
            Next Job / Continue →
          </button>
        </div>
      </div>
    </main>
  );
}
