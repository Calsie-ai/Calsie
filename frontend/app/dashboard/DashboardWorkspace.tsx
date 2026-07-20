"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "../../lib/supabaseClient";
import WorkspaceSidebar from "./WorkspaceSidebar";
import WorkspacePanelsLive, { mapTemplate } from "./WorkspacePanelsLive";
import { CAMPAIGN_PLAN, isCampaignRunning, type CampaignRecord, type CampaignTemplate, type WorkspaceTab } from "./workspace-data";

export default function DashboardWorkspace() {
  const router = useRouter();
  const [active, setActive] = useState<WorkspaceTab>("overview");
  const [campaign, setCampaign] = useState<CampaignRecord | null>(null);
  const [purchasedTemplate, setPurchasedTemplate] = useState<CampaignTemplate | null>(null);
  const [approvedCount, setApprovedCount] = useState(0);
  const [passedCount, setPassedCount] = useState(0);
  const [resumeReady, setResumeReady] = useState(false);
  const [resumeName, setResumeName] = useState("");
  const [gmailReady, setGmailReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void load();
    const receiveTrackerCounts = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === "applix-tracker-counts") setApprovedCount(Number(event.data.approvedCount || 0));
    };
    window.addEventListener("message", receiveTrackerCounts);
    return () => window.removeEventListener("message", receiveTrackerCounts);
  }, []);

  async function load() {
    const supabase = getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) { router.replace("/"); return; }
    const [{ data: campaigns }, { data: resume }, { data: gmail }] = await Promise.all([
      supabase.from("campaigns").select("id,name,location,target_business_type,search,outreach,status,created_at").eq("user_id", userData.user.id).order("created_at", { ascending: false }).limit(1),
      supabase.from("resume_profiles").select("id,resume_file_name").eq("profile_id", userData.user.id).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("user_email_authorizations").select("status").eq("user_identifier", userData.user.email || userData.user.id).eq("provider", "google").maybeSingle(),
    ]);
    const latestCampaign = (((campaigns || [])[0] as CampaignRecord) || null);
    setCampaign(latestCampaign);
    setResumeReady(Boolean(resume?.id));
    setResumeName(resume?.resume_file_name || "");
    setGmailReady(gmail?.status === "connected");

    const templateId = latestCampaign?.search?.template_id;
    if (templateId) {
      const { data: template } = await supabase.from("campaign_templates").select("id,title,campaign_name,image_url,role,location,description,category,query_terms,include_title_terms,exclude_title_terms,description_keywords,job_types,posted_within_days,price_amount,compare_at_price_amount,currency,price_label,pricing_features,payment_required").eq("id", templateId).maybeSingle();
      setPurchasedTemplate(template ? mapTemplate(template) : null);
    } else {
      setPurchasedTemplate(null);
    }

    if (latestCampaign?.id) {
      const { data } = await supabase.rpc("get_campaign_tracker_counts", { p_campaign_id: latestCampaign.id });
      setApprovedCount(Number(data?.[0]?.approved_count || 0));
      setPassedCount(Number(data?.[0]?.passed_count || 0));
    } else {
      setApprovedCount(0);
      setPassedCount(0);
    }
  }

  async function useTemplate(template: CampaignTemplate) {
    setBusy(true); setMessage("");
    try {
      const supabase = getSupabaseClient();
      const { data } = await supabase.auth.getUser();
      if (!data.user) throw new Error("Please sign in again.");
      const { data: created, error } = await supabase.from("campaigns").insert({
        user_id: data.user.id,
        name: template.campaignName || `${template.title} Campaign`,
        location: template.location,
        target_business_type: template.role,
        search: { target_role: template.role, target_location: template.location, query_terms: template.queryTerms, include_title_terms: template.includeTitleTerms, exclude_title_terms: template.excludeTitleTerms, description_keywords: template.descriptionKeywords, job_types: template.jobTypes, posted_within_days: template.postedWithinDays, fetch_frequency: "daily", campaign_days: 30, daily_job_limit: 24, template_id: template.id },
        filters: { location: template.location, job_types: template.jobTypes, posted_within_days: template.postedWithinDays },
        outreach: CAMPAIGN_PLAN,
        status: "draft",
      }).select("id,name,location,target_business_type,search,outreach,status,created_at").single();
      if (error) throw error;
      setCampaign(created as CampaignRecord);
      setPurchasedTemplate(template);
      setApprovedCount(0);
      setPassedCount(0);
      setMessage(`${template.title} campaign added.`);
      setActive("overview");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not use template."); }
    finally { setBusy(false); }
  }

  async function uploadResume(file: File) {
    setBusy(true); setMessage("");
    try {
      const supabase = getSupabaseClient(); const { data } = await supabase.auth.getUser();
      if (!data.user) throw new Error("Please sign in again.");
      const ext = file.name.split(".").pop() || "pdf"; const path = `${data.user.id}/master-source.${ext}`;
      const { error: storageError } = await supabase.storage.from("resumes").upload(path, file, { upsert: true, contentType: file.type || "application/octet-stream" });
      if (storageError) throw storageError;
      const { error } = await supabase.from("resume_profiles").upsert({ profile_id: data.user.id, resume_file_path: path, resume_file_name: file.name, resume_file_type: file.type || ext }, { onConflict: "profile_id" });
      if (error) throw error; setResumeReady(true); setResumeName(file.name); setMessage("Resume updated.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not update resume."); }
    finally { setBusy(false); }
  }

  async function connectGmail() {
    setBusy(true); setMessage("");
    try {
      const supabase = getSupabaseClient(); const { data } = await supabase.auth.getSession(); const token = data.session?.access_token;
      if (!token) throw new Error("Please sign in again.");
      const response = await fetch("/api/applix/connect-gmail", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ access_token: token, return_to: `${window.location.origin}/dashboard` }) });
      const result = await response.json(); if (!response.ok || !result.authorization_url) throw new Error(result.error || "Could not connect Gmail.");
      window.location.href = result.authorization_url;
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not connect Gmail."); setBusy(false); }
  }

  async function toggleCampaign() {
    if (!campaign) { setActive("templates"); return; }
    setBusy(true); setMessage("");
    try {
      const supabase = getSupabaseClient();
      if (isCampaignRunning(campaign.status)) {
        const { data: updated, error } = await supabase.from("campaigns").update({ status: "paused", outreach: { ...(campaign.outreach || {}), active: false, paused_at: new Date().toISOString() } }).eq("id", campaign.id).select("id,name,location,target_business_type,search,outreach,status,created_at").single();
        if (error) throw error;
        setCampaign(updated as CampaignRecord);
        setMessage("Campaign paused.");
      } else {
        if (!resumeReady || !gmailReady) throw new Error("Upload your resume and connect Gmail first.");
        const { data } = await supabase.auth.getSession(); const token = data.session?.access_token;
        const response = await fetch("/api/applix/schedule-campaign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ access_token: token, campaign_id: campaign.id, enabled: true }) });
        const result = await response.json(); if (!response.ok || !result.ok) throw new Error(result.error || "Could not start campaign.");
        if (result.campaign) setCampaign(result.campaign as CampaignRecord);
        else setCampaign({ ...campaign, status: "active", outreach: { ...(campaign.outreach || {}), ...(result.outreach || {}), active: true, scheduled: true } });
        setMessage("Campaign started. AI matching is running; no email was sent.");
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Campaign action failed."); }
    finally { setBusy(false); }
  }

  async function findJobsNow() {
    if (!campaign || !isCampaignRunning(campaign.status)) { setMessage("Resume the campaign before finding new jobs."); return; }
    setBusy(true); setMessage("");
    try {
      const supabase = getSupabaseClient(); const { data } = await supabase.auth.getSession(); const token = data.session?.access_token;
      if (!token) throw new Error("Please sign in again.");
      const response = await fetch("/api/applix/run-campaign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ access_token: token, campaign_id: campaign.id }) });
      const result = await response.json().catch(() => ({})); if (!response.ok || !result.ok) throw new Error(result.error || "Could not find new jobs.");
      setMessage("Job search completed. Open the tracker to review AI-approved jobs. No email was sent.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not find new jobs."); }
    finally { setBusy(false); }
  }

  async function logout() { const supabase = getSupabaseClient(); await supabase.auth.signOut(); router.replace("/"); }

  return <main className="applix-workspace"><WorkspaceSidebar active={active} setActive={setActive} running={isCampaignRunning(campaign?.status)} approvedCount={approvedCount} onToggleCampaign={() => void toggleCampaign()} onLogout={() => void logout()} /><div className="workspace-main"><WorkspacePanelsLive active={active} campaign={campaign} purchasedTemplate={purchasedTemplate} resumeReady={resumeReady} resumeName={resumeName} gmailReady={gmailReady} busy={busy} message={message} approvedCount={approvedCount} passedCount={passedCount} onOpenTracker={() => setActive("tracker")} onUseTemplate={(item) => void useTemplate(item)} onResumeUpload={(file) => void uploadResume(file)} onConnectGmail={() => void connectGmail()} onToggleCampaign={() => void toggleCampaign()} onFindJobsNow={() => void findJobsNow()} /></div></main>;
}
