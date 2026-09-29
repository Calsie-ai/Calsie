"use client";

import { useState } from "react";

type ReviewOpportunity = {
  opportunity_type: "live_job" | "direct_company";
  review_id: string;
  id: string | null;
  campaign_id: string;
  title: string | null;
  company: string | null;
  location: string | null;
  source: string | null;
  apply_url: string | null;
  extracted_email: string | null;
  description: string | null;
  status: string | null;
  created_at: string | null;
  selected_at: string | null;
  reviewed_at: string | null;
  batch_date: string | null;
  campaign_day: number | null;
  ai_role_relevance_score?: number | null;
  ai_reason?: string | null;
  salary?: string | null;
  job_type?: string | null;
  posted_at?: string | null;
  company_logo?: string | null;
};

type Props = {
  job: ReviewOpportunity | null;
  waitingCount: number;
  busy: boolean;
  onSmash: (job: ReviewOpportunity) => void;
  onPass: (job: ReviewOpportunity) => void;
};

function postedLabel(value: string | null | undefined) {
  if (!value) return "Recently";
  const created = new Date(value).getTime();
  if (Number.isNaN(created)) return "Recently";
  const days = Math.max(0, Math.floor((Date.now() - created) / 86400000));
  if (days === 0) return "Today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

function compatibility(score?: number | null) {
  if (typeof score !== "number") return "—";
  return `${Math.max(0, Math.min(10, Math.round(score / 10)))}/10`;
}

export default function JobSwipeDeck({ job, waitingCount, busy, onSmash, onPass }: Props) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  if (!job) {
    return (
      <section style={{ maxWidth: 760, margin: "0 auto", padding: "24px 0 44px" }}>
        <div style={{ borderRadius: 30, background: "#fbfbfc", padding: 36, textAlign: "center", color: "#111827", boxShadow: "0 22px 60px rgba(0,0,0,.22)" }}>
          <h2 style={{ margin: 0, fontSize: 26, fontWeight: 900 }}>No jobs waiting for review</h2>
          <p style={{ margin: "10px 0 0", color: "#6b7280" }}>New matched jobs will appear here when the next campaign batch is ready.</p>
        </div>
      </section>
    );
  }

  const description = job.ai_reason || job.description || "No job summary is available yet.";
  const initials = (job.company || "CO").trim().slice(0, 2).toUpperCase();

  return (
    <section style={{ maxWidth: 760, margin: "0 auto", padding: "8px 0 46px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, padding: 4, marginBottom: 22, border: "1px solid rgba(255,255,255,.12)", borderRadius: 999, background: "rgba(255,255,255,.04)" }}>
        <button type="button" style={{ border: 0, borderRadius: 999, padding: "12px 16px", background: "#fff", color: "#111827", fontWeight: 900, fontSize: 15 }}>Smash or Pass</button>
        <button type="button" aria-disabled="true" title="Recommended will be connected later" style={{ border: 0, borderRadius: 999, padding: "12px 16px", background: "transparent", color: "rgba(255,255,255,.48)", fontWeight: 700, fontSize: 15, cursor: "default" }}>Recommended</button>
      </div>

      <article style={{ borderRadius: 30, background: "#fbfbfc", padding: 26, color: "#111827", boxShadow: "0 24px 70px rgba(0,0,0,.30)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
          {job.company_logo ? (
            <img src={job.company_logo} alt="" style={{ width: 66, height: 66, borderRadius: 18, objectFit: "contain", background: "#f1f5f9", padding: 8 }} />
          ) : (
            <div style={{ width: 66, height: 66, flex: "0 0 66px", display: "grid", placeItems: "center", borderRadius: 18, background: "#eef2f7", color: "#64748b", fontSize: 14, fontWeight: 900 }}>{initials}</div>
          )}
          <div style={{ minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: "clamp(24px,4vw,34px)", lineHeight: 1.08, fontWeight: 950 }}>{job.title || "Untitled job"}</h1>
            <p style={{ margin: "7px 0 0", fontSize: 18, color: "#6b7280", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{job.company || "Company not listed"}</p>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 9, marginTop: 22 }}>
          <div style={pillStyle}>$ {job.salary || "Salary not listed"}</div>
          <div style={pillStyle}>⌖ {job.location || "Location not listed"}</div>
          <div style={pillStyle}>▣ {job.job_type || (job.opportunity_type === "direct_company" ? "Direct company" : "Job")}</div>
        </div>

        <div style={{ marginTop: 16, borderRadius: 23, background: "#f1f3f6", padding: 20 }}>
          <p style={{ margin: 0, fontSize: 11, textTransform: "uppercase", letterSpacing: ".18em", color: "#9ca3af", fontWeight: 800 }}>Summary</p>
          <p style={{ margin: "10px 0 0", fontSize: 16, lineHeight: 1.65, color: "#4b5563", display: detailsOpen ? "block" : "-webkit-box", WebkitLineClamp: detailsOpen ? undefined : 4, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{description}</p>
          {detailsOpen && job.apply_url ? (
            <a href={job.apply_url} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 12, color: "#ea580c", fontWeight: 800, textDecoration: "none" }}>Open original job post ↗</a>
          ) : null}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 9, marginTop: 14 }}>
          <div style={metaStyle}><span style={metaLabelStyle}>Posted at</span><strong>{postedLabel(job.posted_at || job.selected_at || job.created_at)}</strong></div>
          <div style={metaStyle}><span style={metaLabelStyle}>From</span><strong style={{ textTransform: "capitalize", overflow: "hidden", textOverflow: "ellipsis" }}>{job.source || "Job source"}</strong></div>
          <div style={metaStyle}><span style={metaLabelStyle}>Compatibility</span><strong style={{ background: "#dff6df", color: "#245b2b", borderRadius: 999, padding: "3px 9px" }}>{compatibility(job.ai_role_relevance_score)}</strong></div>
        </div>
      </article>

      <button type="button" onClick={() => setDetailsOpen((value) => !value)} style={{ width: "100%", border: 0, background: "transparent", color: "rgba(255,255,255,.72)", padding: "15px 0 0", cursor: "pointer" }}>
        <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1 }}>{detailsOpen ? "⌄" : "⌃"}</div>
        <div style={{ width: 64, height: 5, borderRadius: 99, background: "rgba(255,255,255,.20)", margin: "6px auto 0" }} />
        <p style={{ margin: "9px 0 0", fontSize: 13 }}>{detailsOpen ? "Hide job details" : "Swipe up for more job details"}</p>
      </button>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 36, marginTop: 26, padding: "0 42px" }}>
        <div style={{ textAlign: "center" }}>
          <button type="button" aria-label="Smash job" disabled={busy} onClick={() => onSmash(job)} style={{ ...circleButton, borderColor: "#ff5a1f", color: "#ff5a1f", background: "rgba(255,90,31,.05)", boxShadow: "0 0 34px rgba(255,90,31,.14)" }}>{busy ? "…" : "♥"}</button>
          <p style={actionTitle}>Smash</p>
          <p style={actionHint}>Approve this job</p>
        </div>
        <div style={{ textAlign: "center" }}>
          <button type="button" aria-label="Pass job" disabled={busy} onClick={() => onPass(job)} style={{ ...circleButton, borderColor: "rgba(255,255,255,.24)", color: "rgba(255,255,255,.76)", background: "rgba(255,255,255,.02)" }}>{busy ? "…" : "×"}</button>
          <p style={actionTitle}>Pass</p>
          <p style={actionHint}>Skip this job</p>
        </div>
      </div>

      <p style={{ margin: "22px 0 0", textAlign: "center", fontSize: 12, color: "rgba(255,255,255,.38)" }}>{waitingCount} job{waitingCount === 1 ? "" : "s"} loaded for review</p>
    </section>
  );
}

const pillStyle: React.CSSProperties = {
  minHeight: 44,
  display: "grid",
  placeItems: "center",
  borderRadius: 999,
  background: "#eef1f5",
  padding: "10px 12px",
  textAlign: "center",
  color: "#4b5563",
  fontSize: 13,
  fontWeight: 750,
};

const metaStyle: React.CSSProperties = {
  minHeight: 68,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  minWidth: 0,
  borderRadius: 16,
  background: "#eef1f5",
  padding: 10,
  textAlign: "center",
  fontSize: 13,
};

const metaLabelStyle: React.CSSProperties = { color: "#9ca3af", fontSize: 11 };

const circleButton: React.CSSProperties = {
  width: 112,
  height: 112,
  borderRadius: "50%",
  borderWidth: 1,
  borderStyle: "solid",
  fontSize: 48,
  fontWeight: 400,
  cursor: "pointer",
};

const actionTitle: React.CSSProperties = { margin: "12px 0 0", color: "#fff", fontSize: 20, fontWeight: 900 };
const actionHint: React.CSSProperties = { margin: "4px 0 0", color: "rgba(255,255,255,.42)", fontSize: 12 };
