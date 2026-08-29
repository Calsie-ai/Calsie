"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, FileText, UploadCloud } from "lucide-react";
import { getSupabaseClient } from "../../lib/supabaseClient";
import { normaliseAppError, type ActionState } from "../../lib/actionState";

type Props = {
  resumeReady: boolean;
  resumeName: string;
  uploadState: ActionState;
  onResumeUpload: (file: File) => Promise<void>;
};

export default function ResumePreviewPanel({ resumeReady, resumeName, uploadState, onResumeUpload }: Props) {
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
        setPreviewError(normaliseAppError(error, "Could not load the resume preview.") || "");
      } finally {
        if (alive) setLoadingPreview(false);
      }
    }

    void loadPreview();
    return () => { alive = false; };
  }, [resumeReady, resumeName]);

  const isPdf = fileType.includes("pdf") || resumeName.toLowerCase().endsWith(".pdf");
  const uploadLoading = uploadState.status === "loading";

  return (
    <div className="ws-panel">
      <header className="ws-panel-head">
        <p className="ws-panel-eyebrow ws-panel-eyebrow-icon"><FileText size={13} strokeWidth={2.4} /> Resume</p>
        <h1 className="ws-panel-title">Update resume</h1>
        <p className="ws-panel-sub">Keep the current resume Calsie attaches to approved applications.</p>
      </header>

      <div className="ws-resume-card">
        <div className="ws-resume-heading">
          <div className="ws-resume-heading-copy">
            <span className={`ws-resume-status-icon${resumeReady ? " is-ready" : ""}`}>
              {resumeReady ? <CheckCircle2 size={18} strokeWidth={2.2} /> : <UploadCloud size={18} strokeWidth={2.2} />}
            </span>
            <div>
              <small>Current resume</small>
              <h3>{resumeReady ? "Your resume is ready" : "Resume required"}</h3>
              <p>{resumeReady ? resumeName || "Resume saved" : "Upload a PDF, DOC, or DOCX file."}</p>
            </div>
          </div>
          <label className="ws-btn-primary ws-resume-upload-btn">
            {uploadLoading ? "Uploading resume…" : resumeReady ? "Upload or replace resume" : "Upload resume"}
            <input
              hidden
              type="file"
              accept=".pdf,.doc,.docx"
              disabled={uploadLoading}
              onChange={async (event) => {
                const input = event.currentTarget;
                const file = input.files?.[0];
                if (!file) return;
                try {
                  await onResumeUpload(file);
                } finally {
                  input.value = "";
                }
              }}
            />
          </label>
        </div>

        {resumeReady && (
          <div className="ws-resume-preview">
            <div className="ws-resume-preview-bar">
              <strong>Resume preview</strong>
              {previewUrl && <a href={previewUrl} target="_blank" rel="noreferrer">Open in new tab</a>}
            </div>

            {loadingPreview && <div className="ws-resume-preview-state" role="status" aria-live="polite">Loading secure preview…</div>}
            {previewError && <div className="ws-resume-preview-state is-error" role="alert">{previewError}</div>}
            {!loadingPreview && !previewError && previewUrl && isPdf && (
              <iframe src={previewUrl} title={`${resumeName || "Resume"} preview`} />
            )}
            {!loadingPreview && !previewError && previewUrl && !isPdf && (
              <div className="ws-resume-preview-state">
                <strong>Preview is available in a new tab.</strong>
                <span>Word documents are opened securely instead of embedded in the dashboard.</span>
                <a className="ws-btn-outline" href={previewUrl} target="_blank" rel="noreferrer">Open resume</a>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
