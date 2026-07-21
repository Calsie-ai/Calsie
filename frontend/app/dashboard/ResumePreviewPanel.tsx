"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "../../lib/supabaseClient";

type Props = {
  resumeReady: boolean;
  resumeName: string;
  busy: boolean;
  onResumeUpload: (file: File) => void;
};

export default function ResumePreviewPanel({ resumeReady, resumeName, busy, onResumeUpload }: Props) {
  const [previewUrl, setPreviewUrl] = useState("");
  const [fileType, setFileType] = useState("");
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState("");

  useEffect(() => {
    let alive = true;

    async function loadPreview() {
      if (!resumeReady) {
        setPreviewUrl("");
        setFileType("");
        setPreviewError("");
        return;
      }

      setLoadingPreview(true);
      setPreviewError("");

      try {
        const supabase = getSupabaseClient();
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) throw new Error("Please sign in again.");

        const { data: profile, error: profileError } = await supabase
          .from("resume_profiles")
          .select("resume_file_path,resume_file_type,resume_file_name")
          .eq("profile_id", userData.user.id)
          .maybeSingle();

        if (profileError) throw profileError;
        if (!profile?.resume_file_path) throw new Error("The saved resume file could not be found.");

        const { data: signed, error: signedError } = await supabase.storage
          .from("resumes")
          .createSignedUrl(profile.resume_file_path, 60 * 30);

        if (signedError) throw signedError;
        if (!alive) return;

        setPreviewUrl(signed.signedUrl);
        setFileType(String(profile.resume_file_type || profile.resume_file_name || resumeName).toLowerCase());
      } catch (error) {
        if (!alive) return;
        setPreviewUrl("");
        setPreviewError(error instanceof Error ? error.message : "Could not load the resume preview.");
      } finally {
        if (alive) setLoadingPreview(false);
      }
    }

    void loadPreview();
    return () => { alive = false; };
  }, [resumeReady, resumeName]);

  const isPdf = fileType.includes("pdf") || resumeName.toLowerCase().endsWith(".pdf");

  return (
    <section>
      <header>
        <p>Resume</p>
        <h1>Update resume</h1>
        <span>Keep the current resume Calsie attaches to approved applications.</span>
      </header>

      <div className="workspace-card workspace-resume-card">
        <div className="workspace-resume-heading">
          <div>
            <small>Current resume</small>
            <h3>{resumeReady ? "Your resume is ready" : "Resume required"}</h3>
            <p>{resumeReady ? resumeName || "Resume saved" : "Upload a PDF, DOC, or DOCX file."}</p>
          </div>
          <label className="workspace-primary">
            {busy ? "Working..." : resumeReady ? "Upload or replace resume" : "Upload resume"}
            <input hidden type="file" accept=".pdf,.doc,.docx" disabled={busy} onChange={(event) => event.target.files?.[0] && onResumeUpload(event.target.files[0])} />
          </label>
        </div>

        {resumeReady && (
          <div className="workspace-resume-preview">
            <div className="workspace-resume-preview-bar">
              <strong>Resume preview</strong>
              {previewUrl && <a href={previewUrl} target="_blank" rel="noreferrer">Open in new tab</a>}
            </div>

            {loadingPreview && <div className="workspace-resume-preview-state">Loading secure preview...</div>}
            {previewError && <div className="workspace-resume-preview-state is-error">{previewError}</div>}
            {!loadingPreview && !previewError && previewUrl && isPdf && (
              <iframe src={previewUrl} title={`${resumeName || "Resume"} preview`} />
            )}
            {!loadingPreview && !previewError && previewUrl && !isPdf && (
              <div className="workspace-resume-preview-state">
                <strong>Preview is available in a new tab.</strong>
                <span>Word documents are opened securely instead of embedded in the dashboard.</span>
                <a className="workspace-secondary" href={previewUrl} target="_blank" rel="noreferrer">Open resume</a>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
