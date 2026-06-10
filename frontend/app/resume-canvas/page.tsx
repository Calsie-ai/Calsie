"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "../../lib/supabaseClient";

type ResumeState = {
  fullName: string;
  targetRole: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  website: string;
  profileSummary: string;
  skills: string;
  workExperience: string;
  education: string;
  certifications: string;
  licences: string;
  workRights: string;
  references: string;
  rawText: string;
};

const emptyResume: ResumeState = {
  fullName: "",
  targetRole: "",
  email: "",
  phone: "",
  location: "",
  linkedin: "",
  website: "",
  profileSummary: "",
  skills: "",
  workExperience: "",
  education: "",
  certifications: "",
  licences: "",
  workRights: "",
  references: "",
  rawText: "",
};

function splitList(value: string) {
  return value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function textBlock(value: string) {
  return value.trim() ? [{ text: value.trim() }] : [];
}

export default function ResumeCanvasPage() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [resumeId, setResumeId] = useState("");
  const [resume, setResume] = useState<ResumeState>(emptyResume);
  const [status, setStatus] = useState("Upload your resume, review the editable master resume, then save it for later.");
  const [checkingUser, setCheckingUser] = useState(true);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadMasterResume() {
      setCheckingUser(true);

      try {
        const supabase = getSupabaseClient();
        const { data: userData, error: userError } = await supabase.auth.getUser();

        if (userError || !userData.user) {
          router.replace("/");
          return;
        }

        setUserId(userData.user.id);

        const { data: existingResume, error } = await supabase
          .from("resume_profiles")
          .select("id,full_name,target_role,phone,email,location,linkedin,website_or_portfolio,profile_summary,skills,work_experience,education_locked,certifications_locked,licences_locked,work_rights_locked,references_locked")
          .eq("profile_id", userData.user.id)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) {
          setStatus(error.message);
          return;
        }

        if (existingResume) {
          setResumeId(existingResume.id || "");
          setResume({
            fullName: existingResume.full_name || "",
            targetRole: existingResume.target_role || "",
            email: existingResume.email || userData.user.email || "",
            phone: existingResume.phone || "",
            location: existingResume.location || "",
            linkedin: existingResume.linkedin || "",
            website: existingResume.website_or_portfolio || "",
            profileSummary: existingResume.profile_summary || "",
            skills: Array.isArray(existingResume.skills) ? existingResume.skills.join("\n") : "",
            workExperience: Array.isArray(existingResume.work_experience) ? existingResume.work_experience.map((item: any) => item?.text || item?.role || JSON.stringify(item)).join("\n\n") : "",
            education: Array.isArray(existingResume.education_locked) ? existingResume.education_locked.map((item: any) => item?.text || JSON.stringify(item)).join("\n") : "",
            certifications: Array.isArray(existingResume.certifications_locked) ? existingResume.certifications_locked.join("\n") : "",
            licences: Array.isArray(existingResume.licences_locked) ? existingResume.licences_locked.join("\n") : "",
            workRights: existingResume.work_rights_locked ? JSON.stringify(existingResume.work_rights_locked, null, 2) : "",
            references: Array.isArray(existingResume.references_locked) ? existingResume.references_locked.map((item: any) => item?.text || JSON.stringify(item)).join("\n") : "",
            rawText: "",
          });
          setStatus("Loaded your saved Master Resume. Edit and save when ready.");
        } else {
          setResume((current) => ({ ...current, email: userData.user.email || "" }));
          setStatus("No Master Resume found yet. Upload or type your resume details to create one.");
        }
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Could not load Master Resume.");
      } finally {
        setCheckingUser(false);
      }
    }

    loadMasterResume();
  }, [router]);

  function update(field: keyof ResumeState, value: string) {
    setResume((current) => ({ ...current, [field]: value }));
  }

  async function uploadResume(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || parsing) return;

    setParsing(true);
    setStatus(`Parsing ${file.name}...`);

    try {
      const formData = new FormData();
      formData.append("resume", file);

      const response = await fetch("/api/applix/parse-resume", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || "Could not parse resume.");
      }

      const parsed = data.parsed || {};
      setResume((current) => ({
        ...current,
        fullName: parsed.fullName || current.fullName,
        email: parsed.email || current.email,
        phone: parsed.phone || current.phone,
        location: parsed.location || current.location,
        profileSummary: parsed.resumeSummary || current.profileSummary,
        skills: parsed.skills || current.skills,
        workExperience: parsed.experience || current.workExperience,
        certifications: parsed.certificates || current.certifications,
        rawText: data.rawText || current.rawText,
      }));

      setStatus("Resume parsed. Review the editable Master Resume and save it.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Resume parsing failed. Try DOCX, TXT, or a text-based PDF.");
    } finally {
      setParsing(false);
      event.target.value = "";
    }
  }

  async function saveMasterResume(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setSaving(true);
    setStatus("Saving Master Resume...");

    try {
      if (!userId) {
        setStatus("Please sign in again before saving.");
        return;
      }

      const supabase = getSupabaseClient();

      await supabase.from("profiles").upsert({
        id: userId,
        full_name: resume.fullName || null,
        email: resume.email || null,
        phone: resume.phone || null,
        location: resume.location || null,
        preferred_roles: resume.targetRole ? [resume.targetRole] : [],
      }, { onConflict: "id" });

      const payload = {
        profile_id: userId,
        full_name: resume.fullName || null,
        target_role: resume.targetRole || null,
        phone: resume.phone || null,
        email: resume.email || null,
        location: resume.location || null,
        linkedin: resume.linkedin || null,
        website_or_portfolio: resume.website || null,
        profile_summary: resume.profileSummary || null,
        skills: splitList(resume.skills),
        work_experience: textBlock(resume.workExperience),
        education_locked: textBlock(resume.education),
        certifications_locked: splitList(resume.certifications),
        licences_locked: splitList(resume.licences),
        work_rights_locked: resume.workRights.trim() ? { text: resume.workRights.trim() } : {},
        references_locked: textBlock(resume.references),
      };

      if (resumeId) {
        const { error } = await supabase.from("resume_profiles").update(payload).eq("id", resumeId).eq("profile_id", userId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("resume_profiles").insert(payload).select("id").single();
        if (error) throw error;
        setResumeId(data.id);
      }

      setStatus("Master Resume saved. Applix can reuse it for later campaigns.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save Master Resume.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main style={styles.main}>
      <section style={styles.card}>
        <div style={styles.topRow}>
          <div>
            <p style={styles.eyebrow}>Master Resume</p>
            <h1 style={styles.title}>Upload, parse, edit, save.</h1>
            <p style={styles.copy}>This becomes the user&apos;s permanent Master Resume source for later campaigns and tailored resumes.</p>
          </div>
          <Link href="/dashboard" style={styles.backLink}>Dashboard</Link>
        </div>

        <div style={styles.status}>{checkingUser ? "Checking your login..." : status}</div>

        <label style={styles.uploadBox}>
          <input
            type="file"
            accept=".pdf,.doc,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            onChange={uploadResume}
            style={styles.fileInput}
            disabled={parsing || checkingUser}
          />
          <strong>{parsing ? "Parsing resume..." : "Upload Resume PDF / DOCX / TXT"}</strong>
          <span>Applix will parse it and fill the editable Master Resume below.</span>
        </label>

        <form onSubmit={saveMasterResume} style={styles.form}>
          <div style={styles.grid2}>
            <Field label="Full name" value={resume.fullName} onChange={(value) => update("fullName", value)} />
            <Field label="Target role" value={resume.targetRole} onChange={(value) => update("targetRole", value)} />
            <Field label="Email" value={resume.email} onChange={(value) => update("email", value)} />
            <Field label="Phone" value={resume.phone} onChange={(value) => update("phone", value)} />
            <Field label="Location" value={resume.location} onChange={(value) => update("location", value)} />
            <Field label="LinkedIn" value={resume.linkedin} onChange={(value) => update("linkedin", value)} />
            <Field label="Website / portfolio" value={resume.website} onChange={(value) => update("website", value)} />
          </div>

          <TextArea label="Professional summary" value={resume.profileSummary} onChange={(value) => update("profileSummary", value)} rows={4} />
          <TextArea label="Skills" value={resume.skills} onChange={(value) => update("skills", value)} rows={5} placeholder="One per line or comma separated" />
          <TextArea label="Work experience" value={resume.workExperience} onChange={(value) => update("workExperience", value)} rows={8} />
          <TextArea label="Education" value={resume.education} onChange={(value) => update("education", value)} rows={4} />
          <TextArea label="Certifications / checks" value={resume.certifications} onChange={(value) => update("certifications", value)} rows={4} />
          <TextArea label="Licences" value={resume.licences} onChange={(value) => update("licences", value)} rows={3} />
          <TextArea label="Work rights" value={resume.workRights} onChange={(value) => update("workRights", value)} rows={3} />
          <TextArea label="References" value={resume.references} onChange={(value) => update("references", value)} rows={3} />

          <div style={styles.actions}>
            <Link href="/dashboard" style={styles.secondaryButton}>Back</Link>
            <button type="submit" style={styles.primaryButton} disabled={saving || checkingUser}>{saving ? "Saving..." : "Save Master Resume"}</button>
          </div>
        </form>
      </section>
    </main>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label style={styles.label}>
      {label}
      <input style={styles.input} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function TextArea({ label, value, onChange, rows, placeholder }: { label: string; value: string; onChange: (value: string) => void; rows: number; placeholder?: string }) {
  return (
    <label style={styles.label}>
      {label}
      <textarea style={styles.textarea} value={value} onChange={(event) => onChange(event.target.value)} rows={rows} placeholder={placeholder} />
    </label>
  );
}

const styles = {
  main: { minHeight: "100vh", padding: 20, background: "linear-gradient(180deg, #120b2d 0%, #070711 55%, #030306 100%)", color: "white", fontFamily: "Arial, Helvetica, sans-serif" },
  card: { width: "min(980px, 100%)", margin: "0 auto", border: "1px solid rgba(255,255,255,.16)", borderRadius: 28, padding: "clamp(20px, 4vw, 42px)", background: "rgba(10,12,22,.86)", boxShadow: "0 28px 90px rgba(0,0,0,.45)" },
  topRow: { display: "flex", justifyContent: "space-between", gap: 18, alignItems: "flex-start", flexWrap: "wrap" as const },
  eyebrow: { margin: 0, color: "#a7f3d0", fontSize: 13, fontWeight: 900, letterSpacing: ".12em", textTransform: "uppercase" as const },
  title: { margin: "10px 0 12px", fontSize: "clamp(34px, 6vw, 62px)", lineHeight: .96, letterSpacing: -2.4 },
  copy: { margin: 0, color: "rgba(255,255,255,.68)", lineHeight: 1.5, maxWidth: 650 },
  backLink: { border: "1px solid rgba(255,255,255,.18)", borderRadius: 999, padding: "12px 16px", background: "rgba(255,255,255,.06)", color: "white", fontWeight: 850, textDecoration: "none" },
  status: { marginTop: 20, padding: 14, borderRadius: 16, background: "rgba(255,255,255,.06)", color: "#a7f3d0", fontWeight: 800, lineHeight: 1.4 },
  uploadBox: { display: "grid", gap: 7, marginTop: 18, padding: 18, borderRadius: 18, background: "rgba(94,231,255,.1)", border: "1px dashed rgba(94,231,255,.55)", cursor: "pointer" },
  fileInput: { display: "none" },
  form: { display: "grid", gap: 18, marginTop: 22 },
  grid2: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 },
  label: { display: "grid", gap: 8, color: "rgba(255,255,255,.88)", fontWeight: 850 },
  input: { width: "100%", border: "1px solid rgba(255,255,255,.18)", borderRadius: 16, padding: "14px 15px", background: "rgba(255,255,255,.07)", color: "white", outline: "none" },
  textarea: { width: "100%", border: "1px solid rgba(255,255,255,.18)", borderRadius: 16, padding: "14px 15px", background: "rgba(255,255,255,.07)", color: "white", outline: "none", resize: "vertical" as const, lineHeight: 1.5 },
  actions: { display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap" as const, marginTop: 10 },
  primaryButton: { border: 0, borderRadius: 999, padding: "15px 20px", background: "linear-gradient(135deg, #f472b6, #8b5cf6 55%, #22d3ee)", color: "white", fontWeight: 950, cursor: "pointer" },
  secondaryButton: { border: "1px solid rgba(255,255,255,.18)", borderRadius: 999, padding: "15px 20px", background: "rgba(255,255,255,.06)", color: "white", fontWeight: 850, textDecoration: "none" },
};
