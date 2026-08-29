"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { pdf } from "@react-pdf/renderer";
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Check,
  CheckCircle2,
  ChevronLeft,
  Clock,
  Download,
  FileEdit,
  FileText,
  Plus,
  ShieldCheck,
  Trash2,
  UploadCloud,
  User,
  X,
} from "lucide-react";
import { getSupabaseClient } from "../../lib/supabaseClient";
import { normaliseAppError, type ActionState } from "../../lib/actionState";
import { useActionStates } from "../../lib/useActionStates";
import {
  computeYearsOfExperience,
  composeSummary,
  createEntryId,
  formatDateRange,
  formatYearsOfExperience,
  industryContent,
  INDUSTRY_OPTIONS,
  MONTH_OPTIONS,
  EMPTY_WORK_RIGHTS,
  parseLegacyCertifications,
  parseLegacyEducation,
  parseLegacyLicences,
  parseLegacyReferences,
  parseLegacyWorkExperience,
  parseLegacyWorkRights,
  type CertificationEntry,
  type EducationEntry,
  type LicenceEntry,
  type ReferenceEntry,
  type WorkExperienceEntry,
  type WorkRights,
  type WorkRightsStatus,
} from "../../lib/resumeBuilderContent";
import ResumeDocument, {
  DEFAULT_RESUME_TEMPLATE,
  RESUME_TEMPLATES,
  resumeTemplateMeta,
  type ResumePdfData,
  type ResumeTemplateId,
} from "./resume-templates/ResumeDocument";

type Props = {
  uploadState: ActionState;
  onResumeUpload: (file: File) => Promise<void>;
};

type SectionKey = "personal" | "role" | "experience" | "education" | "certifications" | "skills" | "references" | "review";

const SECTIONS: Array<{ key: SectionKey; label: string }> = [
  { key: "personal", label: "Personal Details" },
  { key: "role", label: "Target Role" },
  { key: "experience", label: "Work Experience" },
  { key: "education", label: "Education" },
  { key: "certifications", label: "Certifications & Licences" },
  { key: "skills", label: "Skills" },
  { key: "references", label: "References" },
  { key: "review", label: "Review & Generate" },
];

const WORK_RIGHTS_OPTIONS: Array<{ value: WorkRightsStatus; label: string }> = [
  { value: "citizen", label: "Australian citizen" },
  { value: "permanent_resident", label: "Permanent resident" },
  { value: "visa_holder", label: "Visa holder" },
  { value: "other", label: "Other" },
];

function newWorkExperience(): WorkExperienceEntry {
  return { id: createEntryId(), jobTitle: "", employer: "", location: "", startMonth: "", startYear: "", endMonth: "", endYear: "", current: false, bullets: [""] };
}
function newEducation(): EducationEntry {
  return { id: createEntryId(), qualification: "", institution: "", location: "", completionYear: "", inProgress: false, grade: "" };
}
function newCertification(name = ""): CertificationEntry {
  return { id: createEntryId(), name, issuer: "", year: "" };
}
function newLicence(name = ""): LicenceEntry {
  return { id: createEntryId(), name, number: "", expiry: "" };
}
function newReference(): ReferenceEntry {
  return { id: createEntryId(), name: "", relationship: "", company: "", phone: "", email: "" };
}

function fileSafeName(name: string) {
  return (name.trim() || "Resume").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "Resume";
}

const ACTION_KEYS = ["loadDraft", "saveDraft"] as const;

export default function BuildResumePanel({ uploadState, onResumeUpload }: Props) {
  const { runAction, states } = useActionStates(ACTION_KEYS);
  const [loaded, setLoaded] = useState(false);
  const [started, setStarted] = useState(false);
  const [sectionIndex, setSectionIndex] = useState(0);
  // Not persisted to resume_profiles (no schema change for this) — a
  // session-level choice with a sensible default, re-pickable on the
  // intro screen and again on Review & Generate without touching any
  // answered data.
  const [templateId, setTemplateId] = useState<ResumeTemplateId>(DEFAULT_RESUME_TEMPLATE);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [websiteOrPortfolio, setWebsiteOrPortfolio] = useState("");

  const [targetRole, setTargetRole] = useState("");
  // Session-only, like templateId — not written to resume_profiles, so it
  // resets on reload rather than adding a new database column for one
  // optional line of text.
  const [headline, setHeadline] = useState("");
  const [industry, setIndustry] = useState("");
  const [industrySpecialisation, setIndustrySpecialisation] = useState("");
  const [workRights, setWorkRights] = useState<WorkRights>(EMPTY_WORK_RIGHTS);

  const [workExperience, setWorkExperience] = useState<WorkExperienceEntry[]>([]);
  const [education, setEducation] = useState<EducationEntry[]>([]);
  const [certifications, setCertifications] = useState<CertificationEntry[]>([]);
  const [licences, setLicences] = useState<LicenceEntry[]>([]);
  const [skills, setSkills] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState("");
  const [references, setReferences] = useState<ReferenceEntry[]>([]);

  // True per-section when the account already has real data in that
  // resume_profiles column, but in a shape this wizard doesn't recognise
  // (see parseLegacy* in lib/resumeBuilderContent.ts) — shown as a notice
  // so the user knows to re-enter it rather than assuming it's just empty.
  const [hasUnrecognisedLegacyData, setHasUnrecognisedLegacyData] = useState({
    experience: false, education: false, certifications: false, licences: false, references: false,
  });

  const [summaryOverride, setSummaryOverride] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState("");
  const [generating, setGenerating] = useState(false);
  const [usingAsActive, setUsingAsActive] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [activeResumeUpdated, setActiveResumeUpdated] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  // Tracks whether anything has changed since the last successful save, so
  // leaving the wizard (goBack from step 1) can offer to save first instead
  // of silently risking unsaved edits — cleared right after load completes
  // (so pre-filling from the saved draft doesn't itself count as "unsaved")
  // and again after every successful saveDraft().
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const skipNextDirtyCheck = useRef(true);

  const autoSummary = useMemo(() => composeSummary(industry, targetRole, workExperience, skills), [industry, targetRole, workExperience, skills]);
  const resolvedSummary = summaryOverride ?? autoSummary;
  const years = useMemo(() => formatYearsOfExperience(computeYearsOfExperience(workExperience)), [workExperience]);
  const content = industryContent(industry);

  useEffect(() => {
    let alive = true;
    void runAction("loadDraft", async () => {
      const supabase = getSupabaseClient();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Please sign in again.");
      const { data, error } = await supabase
        .from("resume_profiles")
        .select("full_name,email,phone,location,linkedin,website_or_portfolio,target_role,industry,industry_specialisation,work_rights_locked,work_experience,education_locked,certifications_locked,licences_locked,skills,references_locked,profile_summary")
        .eq("profile_id", userData.user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    }, { errorMessage: "Could not load your saved draft." }).then((outcome) => {
      if (!alive) return;
      if (outcome.outcome === "success" && outcome.value) {
        const d = outcome.value as Record<string, unknown>;
        if (typeof d.full_name === "string") setFullName(d.full_name);
        if (typeof d.email === "string") setEmail(d.email);
        if (typeof d.phone === "string") setPhone(d.phone);
        if (typeof d.location === "string") setLocation(d.location);
        if (typeof d.linkedin === "string") setLinkedin(d.linkedin);
        if (typeof d.website_or_portfolio === "string") setWebsiteOrPortfolio(d.website_or_portfolio);
        if (typeof d.target_role === "string") setTargetRole(d.target_role);
        if (typeof d.industry === "string") setIndustry(d.industry);
        if (typeof d.industry_specialisation === "string") setIndustrySpecialisation(d.industry_specialisation);
        if (d.work_rights_locked) setWorkRights(parseLegacyWorkRights(d.work_rights_locked));
        if (Array.isArray(d.skills) && d.skills.length) setSkills(d.skills as string[]);
        if (typeof d.profile_summary === "string" && d.profile_summary.trim()) setSummaryOverride(d.profile_summary);

        // These four columns already hold real data for many users, written
        // by a separate AI resume-parsing pipeline with no fixed schema —
        // only accept array items that match this wizard's own shape (see
        // parseLegacy* in lib/resumeBuilderContent.ts). Anything that
        // doesn't match is left for the user to re-enter, not guessed at,
        // and — critically — is never overwritten with an empty array by
        // saveDraft() below, so it isn't lost even if this section is
        // skipped in the wizard.
        const workExperienceParsed = parseLegacyWorkExperience(d.work_experience);
        const educationParsed = parseLegacyEducation(d.education_locked);
        const certificationsParsed = parseLegacyCertifications(d.certifications_locked);
        const licencesParsed = parseLegacyLicences(d.licences_locked);
        const referencesParsed = parseLegacyReferences(d.references_locked);
        setWorkExperience(workExperienceParsed);
        setEducation(educationParsed);
        setCertifications(certificationsParsed);
        setLicences(licencesParsed);
        setReferences(referencesParsed);
        setHasUnrecognisedLegacyData({
          experience: Array.isArray(d.work_experience) && d.work_experience.length > 0 && workExperienceParsed.length === 0,
          education: Array.isArray(d.education_locked) && d.education_locked.length > 0 && educationParsed.length === 0,
          certifications: Array.isArray(d.certifications_locked) && d.certifications_locked.length > 0 && certificationsParsed.length === 0,
          licences: Array.isArray(d.licences_locked) && d.licences_locked.length > 0 && licencesParsed.length === 0,
          references: Array.isArray(d.references_locked) && d.references_locked.length > 0 && referencesParsed.length === 0,
        });

      }
      setLoaded(true);
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Marks the draft dirty on any real edit. Skips the render(s) triggered by
  // the load effect pre-filling these same fields — otherwise a returning
  // user would be flagged "unsaved" the instant their own saved data loads.
  useEffect(() => {
    if (!loaded) return;
    if (skipNextDirtyCheck.current) { skipNextDirtyCheck.current = false; return; }
    setHasUnsavedChanges(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    loaded, fullName, email, phone, location, linkedin, websiteOrPortfolio,
    targetRole, industry, industrySpecialisation, workRights,
    workExperience, education, certifications, licences, skills, references, summaryOverride,
  ]);

  useEffect(() => {
    if (!downloaded) return;
    const timer = window.setTimeout(() => setDownloaded(false), 4500);
    return () => window.clearTimeout(timer);
  }, [downloaded]);

  useEffect(() => {
    if (!activeResumeUpdated) return;
    const timer = window.setTimeout(() => setActiveResumeUpdated(false), 4500);
    return () => window.clearTimeout(timer);
  }, [activeResumeUpdated]);

  async function saveDraft() {
    const outcome = await runAction("saveDraft", async () => {
      const supabase = getSupabaseClient();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Please sign in again.");

      // work_experience/education_locked/certifications_locked/
      // licences_locked/references_locked can already hold real data this
      // wizard didn't recognise on load (see hasUnrecognisedLegacyData /
      // parseLegacy* above). Whenever that's the case AND the user hasn't
      // actually added anything of their own here yet, the column is left
      // out of this upsert entirely — not sent as [] — so the existing
      // data in the database is left untouched instead of being wiped.
      const payload: Record<string, unknown> = {
        profile_id: userData.user.id,
        full_name: fullName || null,
        email: email || null,
        phone: phone || null,
        location: location || null,
        linkedin: linkedin || null,
        website_or_portfolio: websiteOrPortfolio || null,
        target_role: targetRole || null,
        industry: industry || null,
        industry_specialisation: industrySpecialisation || null,
        work_rights_locked: workRights,
        skills,
        target_keywords: skills,
        profile_summary: resolvedSummary,
      };
      if (workExperience.length > 0 || !hasUnrecognisedLegacyData.experience) payload.work_experience = workExperience;
      if (education.length > 0 || !hasUnrecognisedLegacyData.education) payload.education_locked = education;
      if (certifications.length > 0 || !hasUnrecognisedLegacyData.certifications) payload.certifications_locked = certifications;
      if (licences.length > 0 || !hasUnrecognisedLegacyData.licences) payload.licences_locked = licences;
      if (references.length > 0 || !hasUnrecognisedLegacyData.references) payload.references_locked = references;

      const { error } = await supabase.from("resume_profiles").upsert(payload, { onConflict: "profile_id" });
      if (error) throw error;
      return true;
    }, { errorMessage: "Could not save your progress. Your answers are still on this screen — try again." });
    if (outcome.outcome === "success") {
      setLastSavedAt(Date.now());
      setHasUnsavedChanges(false);
    }
    return outcome;
  }

  function goNext() {
    void saveDraft();
    setDownloaded(false);
    setSectionIndex((index) => Math.min(index + 1, SECTIONS.length - 1));
  }

  // Leaving the wizard back to the start screen is the one navigation that
  // can leave edits behind (unlike moving between sections, which keeps
  // everything in state either way) — so it's the one place that offers to
  // save first. Going back either way is guaranteed; the only question is
  // whether a draft gets saved before that happens.
  function exitToStart() {
    if (hasUnsavedChanges) {
      const shouldSave = window.confirm("You have unsaved changes. Save them as a draft before going back?");
      if (shouldSave) {
        void saveDraft().then(() => setStarted(false));
        return;
      }
    }
    setStarted(false);
  }

  function goBack() {
    if (sectionIndex === 0) {
      exitToStart();
      return;
    }
    setSectionIndex((index) => Math.max(index - 1, 0));
  }
  function jumpTo(index: number) {
    if (index > sectionIndex) return;
    setSectionIndex(index);
  }

  function addSkill(value: string) {
    const clean = value.trim();
    if (!clean) return;
    setSkills((list) => (list.includes(clean) ? list : [...list, clean]));
  }
  function removeSkill(value: string) {
    setSkills((list) => list.filter((skill) => skill !== value));
  }
  function addCertificationSuggestion(name: string) {
    if (certifications.some((entry) => entry.name === name)) return;
    setCertifications((list) => [...list, newCertification(name)]);
  }
  function addLicenceSuggestion(name: string) {
    if (licences.some((entry) => entry.name === name)) return;
    setLicences((list) => [...list, newLicence(name)]);
  }

  function buildPdfData(): ResumePdfData {
    return {
      fullName, email, phone, location, linkedin, websiteOrPortfolio,
      summary: resolvedSummary,
      headline: headline.trim(),
      skills,
      workExperience: workExperience.map((entry) => ({ ...entry, bullets: entry.bullets.map((b) => b.trim()).filter(Boolean) })),
      education,
      certifications: certifications.filter((entry) => entry.name.trim()),
      licences: licences.filter((entry) => entry.name.trim()),
      references: references.filter((entry) => entry.name.trim()),
    };
  }

  async function handleDownload() {
    setPdfError("");
    setGenerating(true);
    try {
      await saveDraft();
      const blob = await pdf(<ResumeDocument templateId={templateId} data={buildPdfData()} />).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${fileSafeName(fullName)}-Resume.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setDownloaded(true);
    } catch (error) {
      setPdfError(normaliseAppError(error, "Could not generate your resume PDF.") || "");
    } finally {
      setGenerating(false);
    }
  }

  async function handleUseAsActiveResume() {
    setPdfError("");
    setUsingAsActive(true);
    try {
      const blob = await pdf(<ResumeDocument templateId={templateId} data={buildPdfData()} />).toBlob();
      const file = new File([blob], `${fileSafeName(fullName)}-Resume.pdf`, { type: "application/pdf" });
      await onResumeUpload(file);
      setActiveResumeUpdated(true);
    } catch (error) {
      setPdfError(normaliseAppError(error, "Could not set this as your active resume.") || "");
    } finally {
      setUsingAsActive(false);
    }
  }

  const section = SECTIONS[sectionIndex].key;
  const canAdvance = section === "personal"
    ? Boolean(fullName.trim() && email.trim() && phone.trim())
    : section === "role"
      ? Boolean(targetRole.trim() && industry.trim())
      : true;
  const isReview = section === "review";
  const saving = states.saveDraft.status === "loading";

  const legacyNotice = (flag: boolean, itemLabel: string) => flag ? (
    <div className="ws-panel-message ws-panel-message-alert" role="status">
      We found {itemLabel} on your account from an earlier import that we couldn't automatically bring into this format. Please re-add it below — your original data is safe and untouched until you do.
    </div>
  ) : null;

  // Reused on the intro screen and again on Review & Generate — switching
  // here never touches any answered data, only which template renders the
  // same buildPdfData() output on the next download/regenerate.
  const templatePicker = (
    <div className="ws-template-picker-grid" role="radiogroup" aria-label="Resume format">
      {RESUME_TEMPLATES.map((template) => (
        <button
          type="button"
          key={template.id}
          className={`ws-template-picker-card${templateId === template.id ? " is-selected" : ""}`}
          role="radio"
          aria-checked={templateId === template.id}
          onClick={() => setTemplateId(template.id)}
        >
          <span
            className={`ws-template-picker-sketch${template.headerAlign === "center" ? " is-centered" : ""}`}
            style={{ "--picker-accent": template.accentColor } as CSSProperties}
            aria-hidden="true"
          >
            <span className="ws-template-picker-sketch-name" />
            {template.sections.map((label) => (
              <span key={label} className="ws-template-picker-sketch-bar" />
            ))}
          </span>
          <span className="ws-template-picker-name">{template.name}</span>
          <span className="ws-template-picker-desc">{template.description}</span>
          <span className="ws-template-picker-bestfor">{template.bestFor}</span>
        </button>
      ))}
    </div>
  );

  if (!loaded) {
    return (
      <div className="ws-panel">
        <header className="ws-panel-head ws-templates-hero">
          <h1 className="ws-panel-title">Build Resume</h1>
        </header>
        <div className="ws-panel-message" role="status">Loading your resume builder…</div>
      </div>
    );
  }

  if (!started) {
    return (
      <div className="ws-panel">
        <div className="ws-builder-hero">
          <div className="ws-builder-hero-main">
            <header className="ws-panel-head ws-templates-hero">
              <p className="ws-panel-eyebrow ws-panel-eyebrow-icon"><FileEdit size={13} strokeWidth={2.4} /> Build Resume</p>
              <h1 className="ws-panel-title">Let&rsquo;s build your <span className="ws-builder-hero-accent">resume</span></h1>
              <p className="ws-panel-sub">Answer a few quick questions about your background and we&rsquo;ll put together a clean, ATS-friendly resume you can download and start using right away.</p>
            </header>
            <div className="ws-builder-hero-cta">
              <button type="button" className="ws-btn-primary ws-builder-start-btn" onClick={() => setStarted(true)}>
                Get started<ArrowRight size={15} strokeWidth={2.4} />
              </button>
              <div className="ws-builder-hero-note">
                <Clock size={17} strokeWidth={2.2} />
                <span><strong>Takes 5–10 minutes.</strong> Answers save automatically.</span>
              </div>
            </div>
          </div>
          <div className="ws-builder-hero-art" aria-hidden="true">
            <span className="ws-builder-hero-blob" />
            <span className="ws-builder-hero-doc ws-builder-hero-doc-back" />
            <span className="ws-builder-hero-doc ws-builder-hero-doc-front">
              <span className="ws-builder-hero-doc-avatar"><User size={15} strokeWidth={2.2} /></span>
              <span className="ws-builder-hero-doc-line ws-builder-hero-doc-line-name" />
              <span className="ws-builder-hero-doc-line" />
              <span className="ws-builder-hero-doc-line" />
              <span className="ws-builder-hero-doc-line ws-builder-hero-doc-line-short" />
            </span>
            <span className="ws-builder-hero-badge"><Check size={15} strokeWidth={3} /></span>
            <span className="ws-builder-hero-chip ws-builder-hero-chip-person"><User size={16} strokeWidth={2.2} /></span>
            <span className="ws-builder-hero-chip ws-builder-hero-chip-briefcase"><Briefcase size={16} strokeWidth={2.2} /></span>
          </div>
        </div>

        <div className="ws-builder-intro">
          <ul className="ws-builder-feature-row">
            <li>
              <span className="ws-builder-feature-icon"><User size={18} strokeWidth={2.1} /></span>
              <span>Personal details and the role you&rsquo;re targeting</span>
            </li>
            <li>
              <span className="ws-builder-feature-icon"><Briefcase size={18} strokeWidth={2.1} /></span>
              <span>Work experience and education — add as many as you need</span>
            </li>
            <li>
              <span className="ws-builder-feature-icon"><ShieldCheck size={18} strokeWidth={2.1} /></span>
              <span>Certifications, licences, and skills relevant to your industry</span>
            </li>
            <li>
              <span className="ws-builder-feature-icon"><FileText size={18} strokeWidth={2.1} /></span>
              <span>A ready-to-download PDF, written in a clean ATS-safe format</span>
            </li>
          </ul>

          <div className="ws-builder-format-head">
            <span className="ws-builder-block-label">Choose a resume format</span>
            <p className="ws-builder-format-sub">You can change this anytime, even after generating</p>
          </div>
          {templatePicker}
        </div>
      </div>
    );
  }

  return (
    <div className="ws-panel">
      <button type="button" className="ws-review-back" onClick={exitToStart}>
        <ChevronLeft size={17} strokeWidth={2.4} /> Back to start
      </button>

      <header className="ws-panel-head ws-templates-hero">
        <p className="ws-panel-eyebrow ws-panel-eyebrow-icon"><FileEdit size={13} strokeWidth={2.4} /> Build Resume</p>
        <h1 className="ws-panel-title">{SECTIONS[sectionIndex].label}</h1>
        <p className="ws-panel-sub">Step {sectionIndex + 1} of {SECTIONS.length}</p>
      </header>

      <ol className="ws-builder-stepper" aria-label="Resume builder progress">
        {SECTIONS.map((item, index) => {
          const state = index < sectionIndex ? "complete" : index === sectionIndex ? "current" : "upcoming";
          return (
            <li key={item.key} className={`ws-builder-step is-${state}`}>
              <button type="button" className="ws-builder-step-dot" onClick={() => jumpTo(index)} disabled={index > sectionIndex} aria-current={state === "current" ? "step" : undefined}>
                {state === "complete" ? <Check size={13} strokeWidth={3} /> : index + 1}
              </button>
              <span className="ws-builder-step-label">{item.label}</span>
              {index < SECTIONS.length - 1 ? <span className="ws-builder-step-line" /> : null}
            </li>
          );
        })}
      </ol>
      <p className="ws-builder-step-mobile">Step {sectionIndex + 1} of {SECTIONS.length} · {SECTIONS[sectionIndex].label}</p>

      <div className="ws-review-card">
        {section === "personal" ? (
          <div className="ws-builder-grid">
            <label className="ws-field">Full name<input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jordan Smith" /></label>
            <label className="ws-field">Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jordan@email.com" /></label>
            <label className="ws-field">Phone<input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="04XX XXX XXX" /></label>
            <label className="ws-field">Location<input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Parramatta, NSW" /></label>
            <label className="ws-field">LinkedIn (optional)<input value={linkedin} onChange={(e) => setLinkedin(e.target.value)} placeholder="linkedin.com/in/jordan" /></label>
            <label className="ws-field">Portfolio / website (optional)<input value={websiteOrPortfolio} onChange={(e) => setWebsiteOrPortfolio(e.target.value)} placeholder="" /></label>
          </div>
        ) : null}

        {section === "role" ? (
          <div className="ws-builder-stack">
            <div className="ws-builder-grid">
              <label className="ws-field">Target role<input value={targetRole} onChange={(e) => setTargetRole(e.target.value)} placeholder="Aged Care Worker" /></label>
              <label className="ws-field">Specialisation (optional)<input value={industrySpecialisation} onChange={(e) => setIndustrySpecialisation(e.target.value)} placeholder="Dementia care" /></label>
            </div>
            <label className="ws-field">
              Resume headline (optional)
              <input value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="Compassionate Aged Care Worker | Cert III in Individual Support" />
            </label>
            <p className="ws-field-hint">A one-line title under your name that recruiters and ATS scans see first — worth matching it to the job you're applying for.</p>
            <div className="ws-builder-block">
              <span className="ws-builder-block-label">Industry</span>
              <div className="ws-filter-row">
                {INDUSTRY_OPTIONS.map((option) => (
                  <button type="button" key={option} className={`ws-filter-chip${industry === option ? " is-active" : ""}`} onClick={() => setIndustry(option)}>{option}</button>
                ))}
              </div>
            </div>
            <div className="ws-builder-block">
              <span className="ws-builder-block-label">Right to work in Australia</span>
              <div className="ws-filter-row">
                {WORK_RIGHTS_OPTIONS.map((option) => (
                  <button type="button" key={option.value} className={`ws-filter-chip${workRights.status === option.value ? " is-active" : ""}`} onClick={() => setWorkRights((value) => ({ ...value, status: option.value }))}>{option.label}</button>
                ))}
              </div>
              {workRights.status === "visa_holder" ? (
                <div className="ws-builder-grid" style={{ marginTop: 12 }}>
                  <label className="ws-field">Visa type<input value={workRights.visaType} onChange={(e) => setWorkRights((value) => ({ ...value, visaType: e.target.value }))} placeholder="Subclass 482" /></label>
                  <label className="ws-field">Visa expiry (optional)<input value={workRights.visaExpiry} onChange={(e) => setWorkRights((value) => ({ ...value, visaExpiry: e.target.value }))} placeholder="MM/YYYY" /></label>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {section === "experience" ? (
          <div className="ws-builder-stack">
            {legacyNotice(hasUnrecognisedLegacyData.experience, "work experience")}
            {workExperience.length === 0 ? <p className="ws-review-hint">No roles added yet — add your most recent position first. If this is your first job, you can skip this section.</p> : null}
            {workExperience.map((entry, index) => (
              <div className="ws-builder-entry-card" key={entry.id}>
                <div className="ws-builder-entry-head">
                  <span className="ws-builder-entry-index">Role {index + 1}</span>
                  <button type="button" className="ws-builder-entry-remove" onClick={() => setWorkExperience((list) => list.filter((e) => e.id !== entry.id))} aria-label="Remove this role"><Trash2 size={14} strokeWidth={2} /></button>
                </div>
                <div className="ws-builder-grid">
                  <label className="ws-field">Job title<input value={entry.jobTitle} onChange={(e) => setWorkExperience((list) => list.map((row) => row.id === entry.id ? { ...row, jobTitle: e.target.value } : row))} placeholder="Support Worker" /></label>
                  <label className="ws-field">Employer<input value={entry.employer} onChange={(e) => setWorkExperience((list) => list.map((row) => row.id === entry.id ? { ...row, employer: e.target.value } : row))} placeholder="Company name" /></label>
                  <label className="ws-field">Location<input value={entry.location} onChange={(e) => setWorkExperience((list) => list.map((row) => row.id === entry.id ? { ...row, location: e.target.value } : row))} placeholder="Sydney, NSW" /></label>
                </div>
                <div className="ws-builder-date-row">
                  <label className="ws-field ws-field-narrow">Start month<select value={entry.startMonth} onChange={(e) => setWorkExperience((list) => list.map((row) => row.id === entry.id ? { ...row, startMonth: e.target.value } : row))}><option value="">—</option>{MONTH_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}</select></label>
                  <label className="ws-field ws-field-narrow">Start year<input value={entry.startYear} onChange={(e) => setWorkExperience((list) => list.map((row) => row.id === entry.id ? { ...row, startYear: e.target.value.replace(/\D/g, "").slice(0, 4) } : row))} placeholder="2021" inputMode="numeric" /></label>
                  {!entry.current ? (
                    <>
                      <label className="ws-field ws-field-narrow">End month<select value={entry.endMonth} onChange={(e) => setWorkExperience((list) => list.map((row) => row.id === entry.id ? { ...row, endMonth: e.target.value } : row))}><option value="">—</option>{MONTH_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}</select></label>
                      <label className="ws-field ws-field-narrow">End year<input value={entry.endYear} onChange={(e) => setWorkExperience((list) => list.map((row) => row.id === entry.id ? { ...row, endYear: e.target.value.replace(/\D/g, "").slice(0, 4) } : row))} placeholder="2023" inputMode="numeric" /></label>
                    </>
                  ) : null}
                  <label className="ws-builder-checkbox">
                    <input type="checkbox" checked={entry.current} onChange={(e) => setWorkExperience((list) => list.map((row) => row.id === entry.id ? { ...row, current: e.target.checked } : row))} />
                    I currently work here
                  </label>
                </div>
                <label className="ws-field">Key responsibilities / achievements (one per line)
                  <textarea rows={3} value={entry.bullets.join("\n")} onChange={(e) => setWorkExperience((list) => list.map((row) => row.id === entry.id ? { ...row, bullets: e.target.value.split("\n") } : row))} placeholder={"Assisted 6-8 clients daily with personal care and mobility\nMaintained accurate case notes each shift"} />
                </label>
                <p className="ws-field-hint">Tip: numbers make an impact stand out — e.g. &ldquo;Supported 6–8 clients daily&rdquo; or &ldquo;Reduced missed appointments by 15%&rdquo;.</p>
              </div>
            ))}
            <button type="button" className="ws-builder-add-btn" onClick={() => setWorkExperience((list) => [...list, newWorkExperience()])}><Plus size={15} strokeWidth={2.4} /> Add another role</button>
          </div>
        ) : null}

        {section === "education" ? (
          <div className="ws-builder-stack">
            {legacyNotice(hasUnrecognisedLegacyData.education, "education history")}
            {education.length === 0 ? <p className="ws-review-hint">No qualifications added yet.</p> : null}
            {education.map((entry, index) => (
              <div className="ws-builder-entry-card" key={entry.id}>
                <div className="ws-builder-entry-head">
                  <span className="ws-builder-entry-index">Qualification {index + 1}</span>
                  <button type="button" className="ws-builder-entry-remove" onClick={() => setEducation((list) => list.filter((e) => e.id !== entry.id))} aria-label="Remove this qualification"><Trash2 size={14} strokeWidth={2} /></button>
                </div>
                <div className="ws-builder-grid">
                  <label className="ws-field">Qualification<input value={entry.qualification} onChange={(e) => setEducation((list) => list.map((row) => row.id === entry.id ? { ...row, qualification: e.target.value } : row))} placeholder="Certificate III in Individual Support" /></label>
                  <label className="ws-field">Institution<input value={entry.institution} onChange={(e) => setEducation((list) => list.map((row) => row.id === entry.id ? { ...row, institution: e.target.value } : row))} placeholder="TAFE NSW" /></label>
                  <label className="ws-field">Location<input value={entry.location} onChange={(e) => setEducation((list) => list.map((row) => row.id === entry.id ? { ...row, location: e.target.value } : row))} placeholder="Sydney, NSW" /></label>
                  <label className="ws-field ws-field-narrow">Completion year<input value={entry.completionYear} onChange={(e) => setEducation((list) => list.map((row) => row.id === entry.id ? { ...row, completionYear: e.target.value.replace(/\D/g, "").slice(0, 4) } : row))} placeholder="2022" inputMode="numeric" disabled={entry.inProgress} /></label>
                  <label className="ws-field">Grade (optional)<input value={entry.grade} onChange={(e) => setEducation((list) => list.map((row) => row.id === entry.id ? { ...row, grade: e.target.value } : row))} placeholder="Distinction" /></label>
                  <label className="ws-builder-checkbox">
                    <input type="checkbox" checked={entry.inProgress} onChange={(e) => setEducation((list) => list.map((row) => row.id === entry.id ? { ...row, inProgress: e.target.checked } : row))} />
                    Still in progress
                  </label>
                </div>
              </div>
            ))}
            <button type="button" className="ws-builder-add-btn" onClick={() => setEducation((list) => [...list, newEducation()])}><Plus size={15} strokeWidth={2.4} /> Add another qualification</button>
          </div>
        ) : null}

        {section === "certifications" ? (
          <div className="ws-builder-stack">
            {legacyNotice(hasUnrecognisedLegacyData.certifications, "certifications")}
            {legacyNotice(hasUnrecognisedLegacyData.licences, "licences")}
            {(content.suggestedCertifications.length > 0 || content.suggestedLicences.length > 0) ? (
              <div className="ws-builder-block">
                <span className="ws-builder-block-label">Common for {industry || "your industry"} — tap to add</span>
                <div className="ws-filter-row">
                  {content.suggestedCertifications.map((name) => (
                    <button type="button" key={name} className="ws-suggest-chip" onClick={() => addCertificationSuggestion(name)} disabled={certifications.some((c) => c.name === name)}>
                      <Plus size={13} strokeWidth={2.4} /> {name}
                    </button>
                  ))}
                  {content.suggestedLicences.map((name) => (
                    <button type="button" key={name} className="ws-suggest-chip" onClick={() => addLicenceSuggestion(name)} disabled={licences.some((l) => l.name === name)}>
                      <Plus size={13} strokeWidth={2.4} /> {name}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="ws-builder-block">
              <span className="ws-builder-block-label">Certifications</span>
              {certifications.map((entry) => (
                <div className="ws-builder-entry-row" key={entry.id}>
                  <input className="ws-builder-inline-input" value={entry.name} onChange={(e) => setCertifications((list) => list.map((row) => row.id === entry.id ? { ...row, name: e.target.value } : row))} placeholder="Certificate name" />
                  <input className="ws-builder-inline-input" value={entry.issuer} onChange={(e) => setCertifications((list) => list.map((row) => row.id === entry.id ? { ...row, issuer: e.target.value } : row))} placeholder="Issuer (optional)" />
                  <input className="ws-builder-inline-input ws-builder-inline-input-narrow" value={entry.year} onChange={(e) => setCertifications((list) => list.map((row) => row.id === entry.id ? { ...row, year: e.target.value } : row))} placeholder="Year" />
                  <button type="button" className="ws-builder-entry-remove" onClick={() => setCertifications((list) => list.filter((e) => e.id !== entry.id))} aria-label="Remove"><Trash2 size={14} strokeWidth={2} /></button>
                </div>
              ))}
              <button type="button" className="ws-builder-add-btn" onClick={() => setCertifications((list) => [...list, newCertification()])}><Plus size={15} strokeWidth={2.4} /> Add a certification</button>
            </div>

            <div className="ws-builder-block">
              <span className="ws-builder-block-label">Licences & checks</span>
              {licences.map((entry) => (
                <div className="ws-builder-entry-row" key={entry.id}>
                  <input className="ws-builder-inline-input" value={entry.name} onChange={(e) => setLicences((list) => list.map((row) => row.id === entry.id ? { ...row, name: e.target.value } : row))} placeholder="Licence or check name" />
                  <input className="ws-builder-inline-input" value={entry.number} onChange={(e) => setLicences((list) => list.map((row) => row.id === entry.id ? { ...row, number: e.target.value } : row))} placeholder="Number (optional)" />
                  <input className="ws-builder-inline-input ws-builder-inline-input-narrow" value={entry.expiry} onChange={(e) => setLicences((list) => list.map((row) => row.id === entry.id ? { ...row, expiry: e.target.value } : row))} placeholder="Expiry" />
                  <button type="button" className="ws-builder-entry-remove" onClick={() => setLicences((list) => list.filter((e) => e.id !== entry.id))} aria-label="Remove"><Trash2 size={14} strokeWidth={2} /></button>
                </div>
              ))}
              <button type="button" className="ws-builder-add-btn" onClick={() => setLicences((list) => [...list, newLicence()])}><Plus size={15} strokeWidth={2.4} /> Add a licence or check</button>
            </div>
          </div>
        ) : null}

        {section === "skills" ? (
          <div className="ws-builder-stack">
            <label className="ws-field">Add a skill
              <input
                value={skillInput}
                onChange={(e) => setSkillInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addSkill(skillInput);
                    setSkillInput("");
                  }
                }}
                placeholder="Type a skill and press Enter"
              />
            </label>
            {skills.length > 0 ? (
              <div className="ws-builder-tag-row">
                {skills.map((skill) => (
                  <span className="ws-skill-tag" key={skill}>
                    {skill}
                    <button type="button" onClick={() => removeSkill(skill)} aria-label={`Remove ${skill}`}><X size={12} strokeWidth={2.6} /></button>
                  </span>
                ))}
              </div>
            ) : null}
            {content.suggestedSkills.length > 0 ? (
              <div className="ws-builder-block">
                <span className="ws-builder-block-label">Common for {industry || "your industry"} — tap to add</span>
                <div className="ws-filter-row">
                  {content.suggestedSkills.filter((skill) => !skills.includes(skill)).map((skill) => (
                    <button type="button" key={skill} className="ws-suggest-chip" onClick={() => addSkill(skill)}><Plus size={13} strokeWidth={2.4} /> {skill}</button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {section === "references" ? (
          <div className="ws-builder-stack">
            {legacyNotice(hasUnrecognisedLegacyData.references, "references")}
            {references.length === 0 ? <p className="ws-review-hint">Optional — you can add references now or leave this blank.</p> : null}
            {references.map((entry, index) => (
              <div className="ws-builder-entry-card" key={entry.id}>
                <div className="ws-builder-entry-head">
                  <span className="ws-builder-entry-index">Reference {index + 1}</span>
                  <button type="button" className="ws-builder-entry-remove" onClick={() => setReferences((list) => list.filter((e) => e.id !== entry.id))} aria-label="Remove this reference"><Trash2 size={14} strokeWidth={2} /></button>
                </div>
                <div className="ws-builder-grid">
                  <label className="ws-field">Name<input value={entry.name} onChange={(e) => setReferences((list) => list.map((row) => row.id === entry.id ? { ...row, name: e.target.value } : row))} placeholder="Alex Nguyen" /></label>
                  <label className="ws-field">Relationship<input value={entry.relationship} onChange={(e) => setReferences((list) => list.map((row) => row.id === entry.id ? { ...row, relationship: e.target.value } : row))} placeholder="Team Leader" /></label>
                  <label className="ws-field">Company<input value={entry.company} onChange={(e) => setReferences((list) => list.map((row) => row.id === entry.id ? { ...row, company: e.target.value } : row))} placeholder="Company name" /></label>
                  <label className="ws-field">Phone<input value={entry.phone} onChange={(e) => setReferences((list) => list.map((row) => row.id === entry.id ? { ...row, phone: e.target.value } : row))} placeholder="04XX XXX XXX" /></label>
                  <label className="ws-field">Email<input value={entry.email} onChange={(e) => setReferences((list) => list.map((row) => row.id === entry.id ? { ...row, email: e.target.value } : row))} placeholder="alex@email.com" /></label>
                </div>
              </div>
            ))}
            <button type="button" className="ws-builder-add-btn" onClick={() => setReferences((list) => [...list, newReference()])}><Plus size={15} strokeWidth={2.4} /> Add a reference</button>
          </div>
        ) : null}

        {isReview ? (
          <div className="ws-builder-stack">
            <label className="ws-field">Professional summary
              <textarea rows={4} value={resolvedSummary} onChange={(e) => setSummaryOverride(e.target.value)} />
            </label>
            {years ? <p className="ws-review-hint">Estimated from your work history: {years} of relevant experience.</p> : null}

            <div className="ws-builder-block">
              <span className="ws-builder-block-label">Resume format — {resumeTemplateMeta(templateId).name}. Change it below and regenerate anytime.</span>
              {templatePicker}
            </div>

            <div className="ws-review-spec">
              <h3>What's in this resume</h3>
              <div className="ws-recipe-grid">
                <div className="ws-recipe-item"><span><span>Work experience</span><strong>{workExperience.length} role{workExperience.length === 1 ? "" : "s"}</strong></span></div>
                <div className="ws-recipe-item"><span><span>Education</span><strong>{education.length} qualification{education.length === 1 ? "" : "s"}</strong></span></div>
                <div className="ws-recipe-item"><span><span>Certifications & licences</span><strong>{certifications.length + licences.length} item{certifications.length + licences.length === 1 ? "" : "s"}</strong></span></div>
                <div className="ws-recipe-item"><span><span>Skills</span><strong>{skills.length} listed</strong></span></div>
                <div className="ws-recipe-item"><span><span>References</span><strong>{references.length || "None added"}</strong></span></div>
              </div>
            </div>

            {pdfError ? <div className="ws-panel-message ws-panel-message-alert" role="alert">{pdfError}</div> : null}
            {downloaded ? (
              <div className="ws-panel-message ws-panel-message-dismissible" role="status">
                <span><CheckCircle2 size={15} strokeWidth={2.2} style={{ marginRight: 8, verticalAlign: "-2px" }} />Your resume PDF has downloaded.</span>
                <button type="button" className="ws-notice-close" aria-label="Dismiss this message" onClick={() => setDownloaded(false)}><X size={14} strokeWidth={2.4} /></button>
              </div>
            ) : null}
            {activeResumeUpdated ? (
              <div className="ws-panel-message ws-panel-message-dismissible" role="status">
                <span><CheckCircle2 size={15} strokeWidth={2.2} style={{ marginRight: 8, verticalAlign: "-2px" }} />Your active resume has been updated.</span>
                <button type="button" className="ws-notice-close" aria-label="Dismiss this message" onClick={() => setActiveResumeUpdated(false)}><X size={14} strokeWidth={2.4} /></button>
              </div>
            ) : null}

            <div className="ws-builder-generate-row">
              <button type="button" className="ws-btn-primary" onClick={() => void handleDownload()} disabled={generating}>
                {generating ? "Generating…" : "Download PDF"}<Download size={15} strokeWidth={2.4} />
              </button>
              <button type="button" className="ws-btn-outline" onClick={() => void handleUseAsActiveResume()} disabled={usingAsActive || uploadState.status === "loading"}>
                {usingAsActive || uploadState.status === "loading" ? "Setting as active…" : "Use as my active resume"}<UploadCloud size={15} strokeWidth={2.2} />
              </button>
            </div>
          </div>
        ) : null}

        <div className="ws-builder-nav">
          <button type="button" className="ws-btn-outline" onClick={goBack}>
            <ArrowLeft size={15} strokeWidth={2.2} /> Back
          </button>
          <span className="ws-builder-save-indicator">
            {saving ? "Saving…" : lastSavedAt ? "Saved" : ""}
          </span>
          {!isReview ? (
            <button type="button" className="ws-btn-primary" onClick={goNext} disabled={!canAdvance}>
              Next<ArrowRight size={15} strokeWidth={2.4} />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
