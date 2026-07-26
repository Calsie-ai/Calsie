"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "../../../lib/supabaseClient";

type TemplateForm = {
  campaignName: string;
  targetRole: string;
  relatedRoles: string;
  location: string;
  workType: string;
  postedWithin: string;
  industry: string;
  mustIncludeKeywords: string;
  avoidKeywords: string;
  targetCompanyType: string;
  tone: string;
  mainMessage: string;
  strengthsToMention: string;
  availability: string;
  specialNotes: string;
  dailyLimit: string;
  campaignSpan: string;
  followUpAllowed: string;
  onlyContactJobsWithEmail: string;
  requireUserApproval: string;
};

type CampaignTemplate = {
  id: string;
  title: string;
  description: string;
  accent: string;
  values: TemplateForm;
};

const safeDefaults = {
  postedWithin: "30 days",
  dailyLimit: "25",
  campaignSpan: "30",
  followUpAllowed: "No",
  onlyContactJobsWithEmail: "Yes",
  requireUserApproval: "Yes",
  tone: "Professional and friendly",
};

const emptyTemplate: TemplateForm = {
  campaignName: "",
  targetRole: "",
  relatedRoles: "",
  location: "",
  workType: "",
  postedWithin: safeDefaults.postedWithin,
  industry: "",
  mustIncludeKeywords: "",
  avoidKeywords: "",
  targetCompanyType: "",
  tone: safeDefaults.tone,
  mainMessage: "",
  strengthsToMention: "",
  availability: "",
  specialNotes: "",
  dailyLimit: safeDefaults.dailyLimit,
  campaignSpan: safeDefaults.campaignSpan,
  followUpAllowed: safeDefaults.followUpAllowed,
  onlyContactJobsWithEmail: safeDefaults.onlyContactJobsWithEmail,
  requireUserApproval: safeDefaults.requireUserApproval,
};

const templates: CampaignTemplate[] = [
  {
    id: "support-worker-ndis",
    title: "Support Worker / NDIS",
    description: "Disability support outreach with strict fit filters.",
    accent: "01",
    values: {
      campaignName: "Support Worker Sydney Campaign",
      targetRole: "Support Worker",
      relatedRoles: "Disability Support Worker\nCommunity Support Worker\nAIN\nPersonal Care Assistant\nNDIS Support Worker",
      location: "Sydney NSW",
      workType: "Casual, Part-time, Full-time",
      postedWithin: "30 days",
      industry: "NDIS / Disability Support / Healthcare",
      mustIncludeKeywords: "NDIS\nDisability\nSupport Worker\nCommunity Access\nPersonal Care\nSupported Independent Living",
      avoidKeywords: "Registered Nurse\nManager\nTeam Leader\nVolunteer\nSenior",
      targetCompanyType: "NDIS providers\nDisability service providers\nCare agencies\nCommunity support providers",
      tone: "Professional and friendly",
      mainMessage: "I am interested in support worker opportunities and available to discuss suitable roles.",
      strengthsToMention: "Disability support\nCommunity participation\nPersonal care\nReliable communication\nFlexible availability",
      availability: "Flexible availability",
      specialNotes: "Please keep outreach professional, simple, and relevant to the role.",
      dailyLimit: "25",
      campaignSpan: "30",
      followUpAllowed: "No",
      onlyContactJobsWithEmail: "Yes",
      requireUserApproval: "Yes",
    },
  },
  {
    id: "social-work-mental-health",
    title: "Social Work / Mental Health",
    description: "Higher-paying social work, casework, NDIS, hospital, and mental health roles.",
    accent: "02",
    values: {
      campaignName: "Social Work Mental Health Campaign",
      targetRole: "Mental Health Clinician",
      relatedRoles: "Mental Health Social Worker\nHospital Social Worker\nSocial Worker Level 1/2\nCase Manager\nChild and Family Practitioner\nNDIS Support Coordinator\nSpecialist Support Coordinator\nPsychosocial Recovery Coach\nMental Health Case Manager\nAged Care Social Worker\nCare Coordinator\nCommunity Services Program Coordinator",
      location: "Sydney NSW, Melbourne VIC, Tasmania, Australia wide",
      workType: "Full-time, Part-time, Contract",
      postedWithin: "30 days",
      industry: "Social Work / Mental Health / Community Services / NDIS / Healthcare / Aged Care",
      mustIncludeKeywords: "Master of Social Work\nMental Health\nCasework\nCase Management\nPsychosocial\nRecovery\nNDIS\nSupport Coordination\nHospital Social Work\nCommunity Services\nFamily Support\nAged Care\nDischarge Planning\nNeeds Assessment\nSupport Plans",
      avoidKeywords: "Volunteer\nStudent Placement\nUnpaid\nHospitality\nFood Server\nHousekeeping\nCleaner\nRegistered Nurse\nSenior Manager\nDirector\nClinical Psychologist",
      targetCompanyType: "Hospitals and health districts\nCommunity mental health providers\nNDIS providers\nNon-profit community services\nFamily support services\nAged care providers\nGovernment child protection and community services\nPsychosocial recovery providers",
      tone: "Professional, warm, confident, and human-services focused",
      mainMessage: "I am a Master of Social Work graduate with mental health recovery, casework, aged care, and community services experience. I am interested in social work, mental health, NDIS coordination, hospital social work, and case management opportunities.",
      strengthsToMention: "Mental health recovery support\nCasework and needs assessment\nIndividual support planning\nCommunity linkage and referrals\nFamily and carer engagement\nClient documentation and reporting\nAged care and hospital-adjacent experience\nCulturally competent communication\nAdmin, rostering, and stakeholder coordination",
      availability: "Available to discuss suitable opportunities",
      specialNotes: "Prioritise higher-paying roles such as Mental Health Clinician, Hospital Social Worker, Specialist Support Coordinator, Psychosocial Recovery Coach, Case Manager, and Program Coordinator. Do not prioritise basic support worker roles unless they are strong stepping-stone roles.",
      dailyLimit: "25",
      campaignSpan: "30",
      followUpAllowed: "No",
      onlyContactJobsWithEmail: "Yes",
      requireUserApproval: "Yes",
    },
  },
  {
    id: "business-analyst",
    title: "Business Analyst",
    description: "Requirements, process, and stakeholder focused search.",
    accent: "03",
    values: {
      campaignName: "Business Analyst Sydney Campaign",
      targetRole: "Business Analyst",
      relatedRoles: "Junior Business Analyst\nProcess Analyst\nData Analyst\nSystems Analyst",
      location: "Sydney NSW",
      workType: "Full-time, Part-time, Internship",
      postedWithin: "30 days",
      industry: "Business / Technology / Operations",
      mustIncludeKeywords: "Business Analyst\nRequirements\nProcess\nStakeholder\nReporting\nDocumentation",
      avoidKeywords: "Senior\nManager\nLead\nDirector",
      targetCompanyType: "Technology companies\nConsulting firms\nOperations teams\nCorporate employers",
      tone: "Professional and direct",
      mainMessage: "I am interested in business analyst opportunities and available to discuss suitable roles.",
      strengthsToMention: "Requirements gathering\nDocumentation\nProcess improvement\nCommunication\nAnalysis",
      availability: "Available to discuss suitable opportunities",
      specialNotes: "Keep outreach short, professional, and focused on business analysis capability.",
      dailyLimit: "25",
      campaignSpan: "30",
      followUpAllowed: "No",
      onlyContactJobsWithEmail: "Yes",
      requireUserApproval: "Yes",
    },
  },
  {
    id: "it-support",
    title: "IT Support",
    description: "Service desk and technical support campaign setup.",
    accent: "04",
    values: {
      campaignName: "IT Support Sydney Campaign",
      targetRole: "IT Support",
      relatedRoles: "Help Desk Support\nTechnical Support\nService Desk Analyst\nJunior IT Support",
      location: "Sydney NSW",
      workType: "Full-time, Part-time, Internship",
      postedWithin: "30 days",
      industry: "Information Technology / Support",
      mustIncludeKeywords: "IT Support\nHelp Desk\nService Desk\nTechnical Support\nTroubleshooting\nCustomer Support",
      avoidKeywords: "Senior\nManager\nLead\nDirector",
      targetCompanyType: "IT service providers\nMSPs\nTechnology teams\nCorporate IT departments",
      tone: "Professional and friendly",
      mainMessage: "I am interested in IT support opportunities and available to discuss suitable roles.",
      strengthsToMention: "Troubleshooting\nCustomer support\nTechnical support\nCommunication\nProblem solving",
      availability: "Available to discuss suitable opportunities",
      specialNotes: "Keep outreach simple, polite, and focused on support skills.",
      dailyLimit: "25",
      campaignSpan: "30",
      followUpAllowed: "No",
      onlyContactJobsWithEmail: "Yes",
      requireUserApproval: "Yes",
    },
  },
  {
    id: "custom-template",
    title: "Custom Template",
    description: "Start clean with Applix guard rails already set.",
    accent: "05",
    values: emptyTemplate,
  },
];

function splitList(value: string) {
  return value.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean);
}

function postedWithinDays(value: string) {
  const match = value.match(/\d+/);
  return match ? Number(match[0]) : 30;
}

function yesNo(value: string) {
  return value === "Yes";
}

export default function CampaignTemplatesPage() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [form, setForm] = useState<TemplateForm>(emptyTemplate);
  const [checkingUser, setCheckingUser] = useState(true);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const selectedTemplate = useMemo(() => templates.find((template) => template.id === selectedTemplateId) || null, [selectedTemplateId]);

  useEffect(() => {
    async function checkUser() {
      try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase.auth.getUser();
        if (error || !data.user) {
          router.replace("/");
          return;
        }
        setUserId(data.user.id);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Could not check login.");
      } finally {
        setCheckingUser(false);
      }
    }

    checkUser();
  }, [router]);

  function selectTemplate(template: CampaignTemplate) {
    setSelectedTemplateId(template.id);
    setForm({ ...template.values });
    setCreated(false);
    setMessage("");
    setErrorMessage("");
  }

  function updateField(field: keyof TemplateForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function saveTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setMessage("");
    setCreated(false);
    setSaving(true);

    try {
      if (!userId) throw new Error("Please sign in again before creating a campaign.");

      const campaignName = form.campaignName.trim();
      const targetRole = form.targetRole.trim();
      const location = form.location.trim();
      const dailyCap = Number(form.dailyLimit);
      const campaignDays = Number(form.campaignSpan);

      if (!campaignName) throw new Error("Campaign name is required.");
      if (!targetRole) throw new Error("Target role is required.");
      if (!location) throw new Error("Location is required.");
      if (!Number.isFinite(dailyCap) || dailyCap <= 0) throw new Error("Daily limit must be a number.");
      if (!Number.isFinite(campaignDays) || campaignDays <= 0) throw new Error("Campaign span must be a number.");

      const relatedRoles = splitList(form.relatedRoles);
      const workTypes = splitList(form.workType);
      const mustIncludeKeywords = splitList(form.mustIncludeKeywords);
      const avoidKeywords = splitList(form.avoidKeywords);
      const targetCompanyType = splitList(form.targetCompanyType);
      const strengths = splitList(form.strengthsToMention);
      const postedDays = postedWithinDays(form.postedWithin);
      const requireEmail = yesNo(form.onlyContactJobsWithEmail);
      const requireApproval = yesNo(form.requireUserApproval);

      const search = {
        target_role: targetRole,
        related_roles: relatedRoles,
        target_location: location,
        work_types: workTypes,
        posted_within_days: postedDays,
        industry: form.industry.trim() || null,
        must_include_keywords: mustIncludeKeywords,
        avoid_keywords: avoidKeywords,
        target_company_type: targetCompanyType,
        fetch_frequency: "daily",
        template_id: selectedTemplateId,
        template_name: selectedTemplate?.title || "Custom Template",
      };

      const outreach = {
        tone: form.tone.trim() || safeDefaults.tone,
        main_message: form.mainMessage.trim() || null,
        strengths,
        availability: form.availability.trim() || null,
        special_notes: form.specialNotes.trim() || null,
        daily_cap: dailyCap,
        campaign_days: campaignDays,
        total_cap: dailyCap * campaignDays,
        follow_up_allowed: yesNo(form.followUpAllowed),
        require_email: requireEmail,
        require_user_approval: requireApproval,
        source: "Indeed",
        provider: "Outscraper",
        host: "Gmail",
        gmail_consent_required: true,
        approval_mode: requireApproval ? "Ask me before applying" : "Auto-apply to strong matches",
        tailoring_mode: "Tailor message only",
      };

      const supabase = getSupabaseClient();
      const { error } = await supabase.from("campaigns").insert({
        user_id: userId,
        name: campaignName,
        location,
        target_business_type: targetRole,
        search,
        filters: { ...search, require_email: requireEmail, require_user_approval: requireApproval },
        outreach,
        status: "draft",
      });

      if (error) throw error;

      setCreated(true);
      setMessage("Template saved. Campaign created.");
      window.setTimeout(() => router.push("/dashboard?panel=overview"), 1200);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not save template.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="templates-shell">
      <nav className="templates-nav" aria-label="Template navigation">
        <button className="templates-round" type="button" onClick={() => router.back()}>Back</button>
        <Link className="templates-dashboard-link" href="/dashboard?panel=templates">Dashboard</Link>
      </nav>

      <section className="templates-hero">
        <img src="/applix-logo.svg" alt="Applix logo" />
        <p className="templates-brand">APPLIX</p>
        <p className="templates-kicker">Campaign Setup</p>
        <h1>Browse Template</h1>
        <p className="templates-copy">Choose or create a campaign template.</p>
      </section>

      <section className="templates-stack">
        {checkingUser && <p className="templates-status success">Checking your Applix workspace...</p>}
        {message && <p className="templates-status success">{message}</p>}
        {errorMessage && <p className="templates-status error">{errorMessage}</p>}

        <div className="templates-carousel-wrap">
          <p className="templates-carousel-hint">Swipe template</p>
          <div className="templates-gallery" aria-label="Campaign templates">
            {templates.map((template) => (
              <button className={`template-card ${selectedTemplateId === template.id ? "selected" : ""}`} type="button" key={template.id} onClick={() => selectTemplate(template)}>
                <span>{template.accent}</span>
                <strong>{template.title}</strong>
                <p>{template.description}</p>
              </button>
            ))}
          </div>
        </div>

        {!selectedTemplate ? (
          <div className="template-empty-card">
            <strong>Pick a template</strong>
            <p>The guided fields will open below the carousel.</p>
          </div>
        ) : (
          <form className="template-form-card" onSubmit={saveTemplate}>
            <div className="form-heading">
              <p>{selectedTemplate.title}</p>
              <h2>Fill the campaign fields</h2>
            </div>

            <fieldset>
              <legend>Campaign basics</legend>
              <label>Campaign name<input value={form.campaignName} onChange={(event) => updateField("campaignName", event.target.value)} required /></label>
              <label>Target role<input value={form.targetRole} onChange={(event) => updateField("targetRole", event.target.value)} required /></label>
              <label>Related roles<textarea value={form.relatedRoles} onChange={(event) => updateField("relatedRoles", event.target.value)} rows={5} /></label>
              <label>Location<input value={form.location} onChange={(event) => updateField("location", event.target.value)} required /></label>
              <label>Work type<input value={form.workType} onChange={(event) => updateField("workType", event.target.value)} /></label>
              <label>Posted within<input value={form.postedWithin} onChange={(event) => updateField("postedWithin", event.target.value)} /></label>
            </fieldset>

            <fieldset>
              <legend>Job/company filter</legend>
              <label>Industry<input value={form.industry} onChange={(event) => updateField("industry", event.target.value)} /></label>
              <label>Must include keywords<textarea value={form.mustIncludeKeywords} onChange={(event) => updateField("mustIncludeKeywords", event.target.value)} rows={5} /></label>
              <label>Avoid keywords<textarea value={form.avoidKeywords} onChange={(event) => updateField("avoidKeywords", event.target.value)} rows={5} /></label>
              <label>Target company type<textarea value={form.targetCompanyType} onChange={(event) => updateField("targetCompanyType", event.target.value)} rows={4} /></label>
            </fieldset>

            <fieldset>
              <legend>Outreach instruction</legend>
              <label>Tone<input value={form.tone} onChange={(event) => updateField("tone", event.target.value)} /></label>
              <label>Main message<textarea value={form.mainMessage} onChange={(event) => updateField("mainMessage", event.target.value)} rows={4} /></label>
              <label>Strengths to mention<textarea value={form.strengthsToMention} onChange={(event) => updateField("strengthsToMention", event.target.value)} rows={5} /></label>
              <label>Availability<input value={form.availability} onChange={(event) => updateField("availability", event.target.value)} /></label>
              <label>Special notes<textarea value={form.specialNotes} onChange={(event) => updateField("specialNotes", event.target.value)} rows={4} /></label>
            </fieldset>

            <fieldset>
              <legend>Guard rails</legend>
              <label>Daily limit<input type="number" min="1" value={form.dailyLimit} onChange={(event) => updateField("dailyLimit", event.target.value)} required /></label>
              <label>Campaign span<input type="number" min="1" value={form.campaignSpan} onChange={(event) => updateField("campaignSpan", event.target.value)} required /></label>
              <label>Follow-up allowed<select value={form.followUpAllowed} onChange={(event) => updateField("followUpAllowed", event.target.value)}><option>No</option><option>Yes</option></select></label>
              <label>Only contact jobs with email<select value={form.onlyContactJobsWithEmail} onChange={(event) => updateField("onlyContactJobsWithEmail", event.target.value)}><option>Yes</option><option>No</option></select></label>
              <label>Require user approval before sending<select value={form.requireUserApproval} onChange={(event) => updateField("requireUserApproval", event.target.value)}><option>Yes</option><option>No</option></select></label>
            </fieldset>

            <div className="template-form-actions">
              <Link className="template-secondary" href="/dashboard?panel=templates">Back to dashboard</Link>
              <button className="template-primary" type="submit" disabled={checkingUser || saving || created}>{saving ? "Saving..." : created ? "Campaign created" : "Save Template / Create Campaign"}</button>
            </div>
          </form>
        )}
      </section>

      <style>{`
        .templates-shell { position: relative; min-height: 100vh; overflow-x: hidden; overflow-y: auto; padding: clamp(76px, 13vh, 108px) 14px 46px; background: transparent; color: #f8eaff; }
        .templates-shell > * { position: relative; z-index: 1; }
        .templates-nav { position: fixed; top: max(14px, env(safe-area-inset-top)); left: 14px; right: 14px; z-index: 20; display: flex; align-items: center; justify-content: space-between; gap: 12px; pointer-events: none; }
        .templates-round, .templates-dashboard-link { pointer-events: auto; min-height: 44px; border-radius: 999px; border: 1px solid rgba(255, 92, 168, .34); background: rgba(16, 7, 32, .68); color: #ffe7fb; box-shadow: 0 10px 26px rgba(0,0,0,.24); backdrop-filter: blur(12px); display: inline-flex; align-items: center; justify-content: center; padding: 0 18px; font-size: 13px; font-weight: 950; text-transform: uppercase; letter-spacing: .08em; }
        .templates-round { width: 68px; }
        .templates-hero { width: min(760px, 92vw); margin: 0 auto clamp(18px, 4vw, 32px); display: grid; justify-items: center; text-align: center; }
        .templates-hero img { width: clamp(82px, 22vw, 124px); height: auto; display: block; object-fit: contain; filter: drop-shadow(0 18px 25px rgba(0,0,0,.16)); }
        .templates-brand { margin: 8px 0 6px; color: #ff5ca8; font-size: clamp(38px, 12vw, 68px); font-weight: 950; letter-spacing: .18em; }
        .templates-kicker { margin: 0 0 14px; color: #ffe7fb; font-size: 13px; font-weight: 950; letter-spacing: .18em; text-transform: uppercase; }
        .templates-hero h1 { margin: 0; color: #ff4f9d; font-size: clamp(40px, 11vw, 78px); line-height: 1; font-weight: 950; text-transform: uppercase; letter-spacing: .04em; text-shadow: 0 16px 42px rgba(255, 92, 168, .22); }
        .templates-copy { max-width: 420px; margin: 14px auto 0; color: rgba(255, 231, 251, .82); font-size: clamp(15px, 3.7vw, 20px); line-height: 1.42; font-weight: 800; }
        .templates-stack { width: min(980px, 100%); margin: 0 auto; display: grid; justify-items: center; gap: clamp(16px, 3.5vw, 26px); }
        .templates-status, .template-empty-card, .template-form-card, .template-card { background: rgba(18, 7, 35, .72); border: 1px solid rgba(255, 92, 168, .32); box-shadow: inset 0 1px 0 rgba(255,255,255,.08), 0 18px 44px rgba(255, 92, 168, .08), 0 14px 34px rgba(0,0,0,.32); backdrop-filter: blur(16px) saturate(1.08); color: #ffe7fb; }
        .templates-status { width: min(100%, 420px); margin: 0; padding: 13px 16px; border-radius: 18px; text-align: center; font-weight: 900; }
        .templates-status.success { color: #86efac; border-color: rgba(16,185,129,.28); }
        .templates-status.error { color: #fecaca; border-color: rgba(248,113,113,.42); }
        .templates-carousel-wrap { width: 100%; display: grid; gap: 10px; }
        .templates-carousel-hint { margin: 0; color: #ff4f9d; font-size: 12px; font-weight: 950; letter-spacing: .16em; text-transform: uppercase; text-align: center; }
        .templates-gallery { width: 100%; display: flex; gap: 14px; overflow-x: auto; overflow-y: hidden; scroll-snap-type: x mandatory; scroll-padding: max(14px, calc((100vw - min(360px, calc(100vw - 42px))) / 2)); padding: 2px max(14px, calc((100vw - min(360px, calc(100vw - 42px))) / 2)) 18px; -webkit-overflow-scrolling: touch; scrollbar-width: thin; }
        .template-card { flex: 0 0 min(360px, calc(100vw - 42px)); width: min(360px, calc(100vw - 42px)); min-height: 224px; display: grid; justify-items: start; align-content: space-between; gap: 12px; padding: clamp(22px, 5vw, 30px); border-radius: 24px; text-align: left; scroll-snap-align: center; scroll-snap-stop: always; }
        .template-card.selected { border-color: rgba(255, 92, 168, .92); box-shadow: inset 0 1px 0 rgba(255,255,255,.1), 0 0 0 2px rgba(255, 92, 168, .2), 0 20px 48px rgba(255, 92, 168, .18); }
        .template-card span { display: inline-grid; place-items: center; width: 42px; height: 42px; border-radius: 999px; background: #ff5ca8; color: #16131a; font-weight: 950; }
        .template-card strong { color: #ff7abd; font-size: clamp(26px, 7vw, 42px); line-height: 1.04; font-weight: 950; text-transform: uppercase; letter-spacing: .04em; }
        .template-card p, .template-empty-card p { margin: 0; color: rgba(255, 231, 251, .76); font-size: 15px; line-height: 1.4; font-weight: 800; }
        .template-empty-card { width: min(100%, 420px); display: grid; justify-items: center; gap: 10px; padding: 24px; border-radius: 24px; text-align: center; }
        .template-empty-card strong { color: #ffe7fb; font-size: 24px; font-weight: 950; text-transform: uppercase; }
        .template-form-card { width: min(100%, 420px); display: grid; gap: 18px; padding: clamp(18px, 5vw, 26px); border-radius: 26px; }
        .form-heading { display: grid; gap: 6px; text-align: center; }
        .form-heading p { margin: 0; color: #ff7abd; font-size: 12px; font-weight: 950; letter-spacing: .1em; text-transform: uppercase; }
        .form-heading h2 { margin: 0; color: #ffe7fb; font-size: clamp(24px, 7vw, 34px); line-height: 1.05; font-weight: 950; text-transform: uppercase; }
        .template-form-card fieldset { min-width: 0; margin: 0; padding: 18px; border: 1px solid rgba(255, 92, 168, .26); border-radius: 22px; display: grid; gap: 13px; background: rgba(255,255,255,.04); }
        .template-form-card legend { padding: 0 8px; color: #ff7abd; font-size: 13px; font-weight: 950; letter-spacing: .1em; text-transform: uppercase; }
        .template-form-card label { min-width: 0; display: grid; gap: 7px; color: #ffe7fb; font-size: 13px; font-weight: 950; letter-spacing: .04em; text-transform: uppercase; }
        .template-form-card input, .template-form-card textarea, .template-form-card select { width: 100%; min-width: 0; border: 1px solid rgba(255, 92, 168, .28); border-radius: 16px; background: rgba(255,255,255,.9); color: #16131a; outline: none; padding: 13px 14px; font-size: 15px; line-height: 1.35; font-weight: 800; letter-spacing: 0; text-transform: none; }
        .template-form-card textarea { resize: vertical; }
        .template-form-card input:focus, .template-form-card textarea:focus, .template-form-card select:focus { border-color: rgba(255, 92, 168, .92); box-shadow: 0 0 0 4px rgba(255, 92, 168, .18); }
        .template-form-actions { display: grid; gap: 12px; }
        .template-primary, .template-secondary { width: 100%; min-height: 58px; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; padding: 14px 18px; text-align: center; font-size: clamp(16px, 4.4vw, 20px); font-weight: 950; letter-spacing: .02em; border: 1px solid rgba(255, 231, 251, .4); box-shadow: 0 12px 28px rgba(0,0,0,.18); }
        .template-primary { background: #ff5ca8; border-color: #ff5ca8; color: #16131a; }
        .template-secondary { background: rgba(255,255,255,.08); color: #ffe7fb; }
        .template-primary:disabled { background: rgba(255,255,255,.2); border-color: transparent; color: rgba(255,255,255,.76); }
        @media (max-width: 640px) { .templates-shell { padding-top: 72px; } .templates-stack { width: 100%; } .template-card { min-height: 214px; border-radius: 22px; } .template-form-card, .template-empty-card { border-radius: 22px; } }
      `}</style>
    </main>
  );
}
