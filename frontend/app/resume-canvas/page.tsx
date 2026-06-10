"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "../../lib/supabaseClient";

type ParsedData = {
  fullName: string;
  targetRole: string;
  email: string;
  phone: string;
  location: string;
  summary: string;
  skills: string;
  experience: string;
  education: string;
  certifications: string;
};

const emptyParsed: ParsedData = {
  fullName: "",
  targetRole: "",
  email: "",
  phone: "",
  location: "",
  summary: "",
  skills: "",
  experience: "",
  education: "",
  certifications: "",
};

function splitList(value: string) {
  return value.split(/\n|,/).map((item) => item.trim()).filter(Boolean);
}

function block(value: string) {
  return value.trim() ? [{ text: value.trim() }] : [];
}

function toText(value: any): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(toText).filter(Boolean).join("\n");
  if (typeof value === "object") return value.text || Object.values(value).map(toText).filter(Boolean).join(" — ");
  return String(value);
}

export default function ResumeCanvasPage() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [resumeId, setResumeId] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileType, setFileType] = useState("");
  const [parsed, setParsed] = useState<ParsedData>(emptyParsed);
  const [status, setStatus] = useState("Upload the original resume. Applix keeps that layout and stores parsed data separately.");
  const [loading, setLoading] = useState(true);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const supabase = getSupabaseClient();
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData.user) {
          router.replace("/");
          return;
        }

        setUserId(userData.user.id);
        const { data, error } = await supabase
          .from("resume_profiles")
          .select("id,full_name,target_role,email,phone,location,profile_summary,skills,work_experience,education_locked,certifications_locked")
          .eq("profile_id", userData.user.id)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) {
          setStatus(error.message);
          return;
        }

        if (data) {
          setResumeId(data.id || "");
          setFileName("Saved resume source");
          setParsed({
            fullName: data.full_name || "",
            targetRole: data.target_role || "",
            email: data.email || userData.user.email || "",
            phone: data.phone || "",
            location: data.location || "",
            summary: data.profile_summary || "",
            skills: toText(data.skills),
            experience: toText(data.work_experience),
            education: toText(data.education_locked),
            certifications: toText(data.certifications_locked),
          });
          setStatus("Loaded saved parsed resume data. Upload source file again only if replacing the layout/source.");
        } else {
          setParsed((current) => ({ ...current, email: userData.user.email || "" }));
          setStatus("No resume source saved yet. Upload the user's original resume.");
        }
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Could not load resume source.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [router]);

  function update(field: keyof ParsedData, value: string) {
    setParsed((current) => ({ ...current, [field]: value }));
  }

  async function uploadResume(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setFileType(file.type || file.name.split(".").pop() || "");
    setParsing(true);
    setStatus(`Parsing ${file.name}. Layout stays as original source.`);

    try {
      const formData = new FormData();
      formData.append("resume", file);
      const response = await fetch("/api/applix/parse-resume", { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok || !data?.ok) throw new Error(data?.error || "Could not parse resume.");

      const p = data.parsed || {};
      setParsed((current) => ({
        ...current,
        fullName: p.fullName || current.fullName,
        email: p.email || current.email,
        phone: p.phone || current.phone,
        location: p.location || current.location,
        summary: p.resumeSummary || current.summary,
        skills: p.skills || current.skills,
        experience: p.experience || current.experience,
        certifications: p.certificates || current.certifications,
      }));
      setStatus("Parsed data created. Original resume remains the layout/source concept; structured data is ready to save.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Resume parsing failed.");
    } finally {
      setParsing(false);
      event.target.value = "";
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setStatus("Saving parsed reusable data...");

    try {
      const supabase = getSupabaseClient();
      const { error: profileError } = await supabase.from("profiles").upsert({
        id: userId,
        full_name: parsed.fullName || null,
        email: parsed.email || null,
        phone: parsed.phone || null,
        location: parsed.location || null,
        preferred_roles: parsed.targetRole ? [parsed.targetRole] : [],
      }, { onConflict: "id" });

      if (profileError) throw profileError;

      const payload = {
        profile_id: userId,
        full_name: parsed.fullName || null,
        target_role: parsed.targetRole || null,
        email: parsed.email || null,
        phone: parsed.phone || null,
        location: parsed.location || null,
        profile_summary: parsed.summary || null,
        skills: splitList(parsed.skills),
        work_experience: block(parsed.experience),
        education_locked: block(parsed.education),
        certifications_locked: splitList(parsed.certifications),
      };

      if (resumeId) {
        const { error } = await supabase.from("resume_profiles").update(payload).eq("id", resumeId).eq("profile_id", userId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("resume_profiles").insert(payload).select("id").single();
        if (error) throw error;
        setResumeId(data.id);
      }

      setStatus(`Saved. Parsed reusable data is stored. Source file noted for showcase: ${fileName || "not uploaded"}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save resume source.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="dashboard-card">
        <div className="dashboard-header">
          <div>
            <p className="eyebrow">Resume Source</p>
            <h1>Keep layout. Store data.</h1>
            <p className="muted">The uploaded resume is the user's original layout source. Applix stores parsed data separately for later reuse.</p>
          </div>
          <Link className="ghost-link" href="/dashboard">Dashboard</Link>
        </div>

        <p className="form-status">{loading ? "Checking login..." : status}</p>

        <div className="empty-state">
          <h2>Original resume layout source</h2>
          <p>Upload the user's real resume. We keep it as the style/layout source concept and do not force it into a resume box.</p>
          <label className="primary-link" style={{ cursor: "pointer" }}>
            {parsing ? "Parsing..." : "Upload Original Resume"}
            <input type="file" accept=".pdf,.doc,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" onChange={uploadResume} style={{ display: "none" }} disabled={parsing || loading} />
          </label>
          <p className="muted" style={{ marginTop: 14 }}>Current source: {fileName || "No file uploaded"}</p>
        </div>

        <form className="campaign-form" onSubmit={save}>
          <h2>Parsed reusable data</h2>
          <pre style={{ whiteSpace: "pre-wrap", background: "#050814", color: "#a7f3d0", padding: 16, borderRadius: 16, overflow: "auto", maxHeight: 260 }}>{JSON.stringify(parsed, null, 2)}</pre>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
            <Field label="Full name" value={parsed.fullName} onChange={(value) => update("fullName", value)} />
            <Field label="Target role" value={parsed.targetRole} onChange={(value) => update("targetRole", value)} />
            <Field label="Email" value={parsed.email} onChange={(value) => update("email", value)} />
            <Field label="Phone" value={parsed.phone} onChange={(value) => update("phone", value)} />
            <Field label="Location" value={parsed.location} onChange={(value) => update("location", value)} />
          </div>

          <TextArea label="Summary" value={parsed.summary} onChange={(value) => update("summary", value)} rows={4} />
          <TextArea label="Skills" value={parsed.skills} onChange={(value) => update("skills", value)} rows={4} />
          <TextArea label="Experience" value={parsed.experience} onChange={(value) => update("experience", value)} rows={6} />
          <TextArea label="Education" value={parsed.education} onChange={(value) => update("education", value)} rows={3} />
          <TextArea label="Certifications" value={parsed.certifications} onChange={(value) => update("certifications", value)} rows={3} />

          <div className="form-actions">
            <Link className="ghost-link" href="/dashboard">Back</Link>
            <button className="primary-button" type="submit" disabled={saving || loading}>{saving ? "Saving..." : "Save Parsed Data"}</button>
          </div>
        </form>
      </section>
    </main>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label>{label}<input value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function TextArea({ label, value, onChange, rows }: { label: string; value: string; onChange: (value: string) => void; rows: number }) {
  return <label>{label}<textarea value={value} onChange={(event) => onChange(event.target.value)} rows={rows} /></label>;
}
