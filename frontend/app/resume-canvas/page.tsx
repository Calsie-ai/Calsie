"use client";

import Link from "next/link";
import { ChangeEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "../../lib/supabaseClient";
import { ACTION_TIMEOUTS, normaliseAppError, readJsonResponse, withActionTimeout } from "../../lib/actionState";

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

function safeExt(file: File) {
  const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (ext) return ext;
  return "docx";
}

function isDocResume(file: File) {
  const name = file.name.toLowerCase();
  return name.endsWith(".doc") || name.endsWith(".docx");
}

export default function ResumeCanvasPage() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [resumeId, setResumeId] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileType, setFileType] = useState("");
  const [filePath, setFilePath] = useState("");
  const [parsed, setParsed] = useState<ParsedData>(emptyParsed);
  const [status, setStatus] = useState("Upload or update your resume. Applix will keep the original file and prepare reusable data privately.");
  const [loading, setLoading] = useState(true);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const uploadRef = useRef(false);
  const uploadAbortRef = useRef<AbortController | null>(null);

  useEffect(() => () => uploadAbortRef.current?.abort(), []);

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
          .select("id,full_name,target_role,email,phone,location,profile_summary,skills,work_experience,education_locked,certifications_locked,resume_file_path,resume_file_name,resume_file_type")
          .eq("profile_id", userData.user.id)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) {
          setStatus(normaliseAppError(error, "Could not load your resume.") || "");
          return;
        }

        if (data) {
          setResumeId(data.id || "");
          setFileName(data.resume_file_name || "Saved resume");
          setFileType(data.resume_file_type || "");
          setFilePath(data.resume_file_path || "");
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
          setStatus("Resume is connected. Upload a new DOC or DOCX file anytime to update it.");
        } else {
          setParsed((current) => ({ ...current, email: userData.user.email || "" }));
          setStatus("No resume connected yet. Upload your DOC or DOCX resume to activate Applix.");
        }
      } catch (error) {
        setStatus(normaliseAppError(error, "Could not load resume.") || "");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [router]);

  async function uploadResume(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    if (uploadRef.current) {
      input.value = "";
      return;
    }

    if (!isDocResume(file)) {
      setStatus("Only DOC or DOCX resume files are accepted.");
      input.value = "";
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      setStatus("The resume must be 6 MB or smaller.");
      input.value = "";
      return;
    }

    const detectedFileType = file.type || file.name.split(".").pop() || "";
    uploadRef.current = true;
    const controller = new AbortController();
    uploadAbortRef.current = controller;
    setStatus("");
    setParsing(true);

    try {
      const supabase = getSupabaseClient();
      const { data: userData, error: userError } = await supabase.auth.getUser();
      const activeUserId = userId || userData.user?.id || "";
      const activeUserEmail = userData.user?.email || parsed.email || "";

      if (userError || !activeUserId) throw new Error("Missing user session. Please refresh and sign in again.");

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (sessionError || !accessToken) throw new Error("Missing login session. Please sign in again.");

      if (!userId) setUserId(activeUserId);

      const path = `${activeUserId}/master-source-${Date.now().toString(36)}.${safeExt(file)}`;
      const uploadRequest = supabase.storage
        .from("resumes")
        .upload(path, file, {
          upsert: false,
          contentType: file.type || "application/octet-stream",
        });
      const { error: storageError } = await withActionTimeout(Promise.resolve(uploadRequest), ACTION_TIMEOUTS.upload, () => controller.abort());

      if (storageError) throw storageError;

      const formData = new FormData();
      formData.append("resume", file);
      const response = await withActionTimeout(fetch("/api/applix/parse-resume", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: formData,
        signal: controller.signal,
      }), ACTION_TIMEOUTS.upload, () => controller.abort());
      const data = await readJsonResponse<{ ok?: boolean; parsed?: Record<string, string> }>(response, "Could not parse resume.");
      if (!data.ok) throw new Error("Resume parsing failed");

      const p = data.parsed || {};
      const nextParsed: ParsedData = {
        ...parsed,
        fullName: p.fullName || parsed.fullName,
        targetRole: p.targetRole || parsed.targetRole,
        email: p.email || parsed.email || activeUserEmail,
        phone: p.phone || parsed.phone,
        location: p.location || parsed.location,
        summary: p.resumeSummary || parsed.summary,
        skills: p.skills || parsed.skills,
        experience: p.experience || parsed.experience,
        education: p.education || parsed.education,
        certifications: p.certificates || parsed.certifications,
      };

      setParsing(false);
      setSaving(true);

      const { error: profileError } = await supabase.from("profiles").upsert({
        id: activeUserId,
        full_name: nextParsed.fullName || null,
        email: nextParsed.email || null,
        phone: nextParsed.phone || null,
        location: nextParsed.location || null,
        preferred_roles: nextParsed.targetRole ? [nextParsed.targetRole] : [],
      }, { onConflict: "id" });

      if (profileError) throw profileError;

      const payload = {
        profile_id: activeUserId,
        full_name: nextParsed.fullName || null,
        target_role: nextParsed.targetRole || null,
        email: nextParsed.email || null,
        phone: nextParsed.phone || null,
        location: nextParsed.location || null,
        profile_summary: nextParsed.summary || null,
        skills: splitList(nextParsed.skills),
        work_experience: block(nextParsed.experience),
        education_locked: block(nextParsed.education),
        certifications_locked: splitList(nextParsed.certifications),
        resume_file_path: path,
        resume_file_name: file.name,
        resume_file_type: detectedFileType || null,
      };

      if (resumeId) {
        const { error } = await supabase.from("resume_profiles").update(payload).eq("id", resumeId).eq("profile_id", activeUserId);
        if (error) throw error;
      } else {
        const { data: resumeProfile, error } = await supabase.from("resume_profiles").insert(payload).select("id").single();
        if (error) throw error;
        setResumeId(resumeProfile.id);
      }

      setFileName(file.name);
      setFileType(detectedFileType);
      setFilePath(path);
      setParsed(nextParsed);
      setStatus("Resume saved. Returning to dashboard...");
      router.replace("/dashboard?panel=resume");
    } catch (error) {
      setStatus(normaliseAppError(error, "Resume upload failed. Your previous resume was kept.") || "");
    } finally {
      uploadAbortRef.current = null;
      uploadRef.current = false;
      setParsing(false);
      setSaving(false);
      input.value = "";
    }
  }

  const resumeReady = Boolean(fileName || filePath);
  const uploadLabel = saving ? "Saving..." : parsing ? "Uploading..." : resumeReady ? "Upload / Change Resume" : "Upload Resume";
  const statusIsError = /could not|failed|only|missing|must be|sign in again/i.test(status);

  return (
    <main className="applix-home-shell" style={{ gridTemplateRows: "auto 1fr", overflow: "auto", paddingTop: "24px" }}>
      <header
        style={{
          position: "relative",
          zIndex: 2,
          width: "min(980px, 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "16px",
        }}
      >
        <Link href="/dashboard?panel=resume" style={{ display: "inline-flex", alignItems: "center", gap: "12px" }}>
          <img src="/applix-logo.svg" alt="Applix logo" style={{ width: "54px", height: "54px", objectFit: "contain" }} />
          <div style={{ textAlign: "left" }}>
            <strong style={{ display: "block", color: "#ff7fa8", letterSpacing: ".18em", fontSize: "16px" }}>APPLIX</strong>
            <span style={{ color: "rgba(255,255,255,.62)", fontSize: "12px", fontWeight: 800 }}>Resume</span>
          </div>
        </Link>

        <Link className="applix-setup-outline" href="/dashboard?panel=resume" style={{ width: "auto", minHeight: "48px", padding: "10px 18px", fontSize: "15px", borderWidth: "1px" }}>
          Home
        </Link>
      </header>

      <section
        className="applix-home-center"
        style={{
          alignContent: "center",
          width: "min(760px, 100%)",
          paddingTop: "24px",
          paddingBottom: "36px",
        }}
      >
        <img
          src="/applix-logo.svg"
          alt="Applix logo"
          style={{
            width: "clamp(230px, 34vw, 390px)",
            height: "auto",
            objectFit: "contain",
            marginBottom: "-20px",
            filter: "drop-shadow(0 24px 52px rgba(0, 0, 0, .45))",
          }}
        />

        <p
          style={{
            margin: "0 0 8px",
            color: "#ff7fa8",
            fontSize: "clamp(32px, 6vw, 64px)",
            lineHeight: .9,
            fontWeight: 950,
            letterSpacing: ".16em",
            textShadow: "0 0 22px rgba(255, 80, 180, .28)",
          }}
        >
          APPLIX
        </p>

        <h1 style={{ margin: 0, fontSize: "clamp(36px, 6.8vw, 72px)", lineHeight: .95, letterSpacing: "-2px" }}>
          {resumeReady ? "Resume is connected" : "Upload your resume"}
        </h1>

        <div style={{ width: "min(680px, 100%)", marginTop: "18px", padding: "18px 22px", border: "1px solid rgba(255,255,255,.22)", borderRadius: "24px", background: "rgba(255,255,255,.1)", color: "rgba(255,255,255,.86)", lineHeight: 1.45, fontWeight: 800, textAlign: "center", backdropFilter: "blur(18px)" }}>
          Your Resume Will Be Attached to the Mail. Please use the current and best resume.<br />Only DOC or DOCX files are accepted.
        </div>

        <p className="applix-home-copy" role={statusIsError ? "alert" : "status"} aria-live={statusIsError ? "assertive" : "polite"} style={{ marginTop: "16px" }}>{loading ? "Checking resume..." : status}</p>

        <div style={{ width: "min(680px, 100%)", display: "grid", gap: "14px", marginTop: "32px" }}>
          <label
            className="applix-setup-primary"
            style={{
              cursor: parsing || saving || loading ? "not-allowed" : "pointer",
              gap: "12px",
              minHeight: "74px",
              fontSize: "clamp(20px, 3vw, 30px)",
            }}
          >
            <img src="/applix-logo.svg" alt="" aria-hidden="true" style={{ width: "54px", height: "54px", objectFit: "contain" }} />
            {uploadLabel}
            <input
              type="file"
              accept=".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={uploadResume}
              style={{ display: "none" }}
              disabled={parsing || saving || loading}
            />
          </label>

          {resumeReady && (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                gap: "10px",
                padding: "14px 18px",
                border: "1px solid rgba(255,255,255,.18)",
                borderRadius: "999px",
                background: "rgba(255,255,255,.08)",
                color: "rgba(255,255,255,.78)",
                fontWeight: 850,
              }}
            >
              <span style={{ width: 9, height: 9, borderRadius: 999, background: "#8fffd2", boxShadow: "0 0 18px rgba(143,255,210,.7)" }} />
              {fileName || "Resume uploaded"}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
