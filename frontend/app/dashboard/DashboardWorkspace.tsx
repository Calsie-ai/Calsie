"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "../providers/AuthProvider";
import { getSupabaseClient } from "../../lib/supabaseClient";
import { loginPathFor, safeInternalPath } from "../../lib/navigation";
import {
  claimPendingIntentForUser,
  consumePendingIntentAfterSuccess,
  discardPendingIntent,
  isWorkspaceTab,
  pendingIntentMatchesWorkflow,
  readPendingIntent,
  type PendingIntentV1,
} from "../../lib/pendingIntent";
import WorkspaceSidebar from "./WorkspaceSidebar";
import WorkspacePanelsLive, { mapTemplate } from "./WorkspacePanelsLive";
import { CAMPAIGN_PLAN, isCampaignRunning, type CampaignRecord, type CampaignTemplate, type WorkspaceTab } from "./workspace-data";

export default function DashboardWorkspace() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { session, signOut, status, user } = useAuth();
  const query = searchParams.toString();
  const returnPath = safeInternalPath(`${pathname}${query ? `?${query}` : ""}`);
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
  const [pendingIntent, setPendingIntent] = useState<PendingIntentV1 | null>(null);
  const [unclaimedIntent, setUnclaimedIntent] = useState<PendingIntentV1 | null>(null);
  const [restoredIntentId, setRestoredIntentId] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") router.replace(loginPathFor(returnPath));
  }, [returnPath, router, status]);

  useEffect(() => {
    const requestedPanel = searchParams.get("panel");
    if (isWorkspaceTab(requestedPanel)) setActive(requestedPanel);
  }, [searchParams]);

  useEffect(() => {
    if (status !== "authenticated" || !user) return;
    void load(user.id, user.email);
  }, [status, user?.email, user?.id]);

  useEffect(() => {
    if (status !== "authenticated" || !user) return;
    const intent = readPendingIntent();
    if (!intent || !pendingIntentMatchesWorkflow(intent, pathname)) return;
    if (intent.userHint && intent.userHint !== user.id) return;

    let activeEffect = true;
    const applyRestoration = () => {
      if (!activeEffect) return;
      setActive(intent.panel);
      setRestoredIntentId("");
      if (intent.userHint === user.id) {
        setPendingIntent(intent);
        setUnclaimedIntent(null);
      } else {
        setUnclaimedIntent(intent);
        setPendingIntent(null);
      }
    };

    if (
      searchParams.get("payment") === "success"
      && intent.type === "purchase_template"
      && session?.access_token
    ) {
      void fetch("/api/stripe/payment-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: session.access_token }),
      })
        .then((response) => response.json())
        .then((result) => {
          const paidTemplateId = result.subscription?.template_id;
          if (result.ok && result.paid && paidTemplateId === intent.templateId) {
            consumePendingIntentAfterSuccess(intent.id);
            if (!activeEffect) return;
            setPendingIntent(null);
            setUnclaimedIntent(null);
            setRestoredIntentId("");
            setMessage("Payment confirmed. Your saved checkout draft was completed.");
            return;
          }
          applyRestoration();
        })
        .catch(applyRestoration);
      return () => {
        activeEffect = false;
      };
    }

    applyRestoration();
    return () => {
      activeEffect = false;
    };
  }, [pathname, searchParams, session?.access_token, status, user?.id]);
  useEffect(() => {
    const receiveTrackerCounts = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === "applix-tracker-counts") setApprovedCount(Number(event.data.approvedCount || 0));
    };
    window.addEventListener("message", receiveTrackerCounts);
    return () => window.removeEventListener("message", receiveTrackerCounts);
  }, []);

  function requireUser() {
    if (user) return user;
    router.replace(loginPathFor(returnPath));
    throw new Error("Your session expired. Sign in to continue.");
  }

  function requireAccessToken() {
    if (session?.access_token) return session.access_token;
    router.replace(loginPathFor(returnPath));
    throw new Error("Your session expired. Sign in to continue.");
  }

  async function load(userId: string, email: string | undefined) {
    try {
      const supabase = getSupabaseClient();
      const [{ data: campaigns }, { data: resume }, { data: gmail }] = await Promise.all([
        supabase.from("campaigns").select("id,name,location,target_business_type,search,outreach,status,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(1),
        supabase.from("resume_profiles").select("id,resume_file_name").eq("profile_id", userId).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("user_email_authorizations").select("status").eq("user_identifier", email || userId).eq("provider", "google").maybeSingle(),
      ]);
      const latestCampaign = (((campaigns || [])[0] as CampaignRecord) || null);
      setCampaign(latestCampaign);
      setResumeReady(Boolean(resume?.id));
      setResumeName(resume?.resume_file_name || "");
      setGmailReady(gmail?.status === "connected");

      const templateId = latestCampaign?.search?.template_id;
      if (templateId) {
        const { data: template } = await supabase.from("campaign_templates").select("id,slug,title,campaign_name,image_url,role,location,description,category,query_terms,include_title_terms,exclude_title_terms,description_keywords,job_types,posted_within_days,price_amount,compare_at_price_amount,currency,price_label,pricing_features,payment_required").eq("id", templateId).maybeSingle();
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
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load your dashboard.");
    }
  }

  async function useTemplate(template: CampaignTemplate) {
    setBusy(true); setMessage("");
    try {
      const currentUser = requireUser();
      const supabase = getSupabaseClient();
      const { data: created, error } = await supabase.from("campaigns").insert({
        user_id: currentUser.id,
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
      const currentUser = requireUser();
      const supabase = getSupabaseClient();
      const ext = file.name.split(".").pop() || "pdf"; const path = `${currentUser.id}/master-source.${ext}`;
      const { error: storageError } = await supabase.storage.from("resumes").upload(path, file, { upsert: true, contentType: file.type || "application/octet-stream" });
      if (storageError) throw storageError;
      const { error } = await supabase.from("resume_profiles").upsert({ profile_id: currentUser.id, resume_file_path: path, resume_file_name: file.name, resume_file_type: file.type || ext }, { onConflict: "profile_id" });
      if (error) throw error; setResumeReady(true); setResumeName(file.name); setMessage("Resume updated.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not update resume."); }
    finally { setBusy(false); }
  }

  async function connectGmail() {
    setBusy(true); setMessage("");
    try {
      const token = requireAccessToken();
      const response = await fetch("/api/applix/connect-gmail", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ access_token: token, return_to: `${window.location.origin}${returnPath}` }) });
      const result = await response.json(); if (!response.ok || !result.authorization_url) throw new Error(result.error || "Could not connect Gmail.");
      window.location.assign(result.authorization_url);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not connect Gmail."); setBusy(false); }
  }

  async function revokeGmail() {
    const confirmed = window.confirm("Revoke the connected Gmail account? Calsie will no longer be able to send application emails until you connect again.");
    if (!confirmed) return;
    setBusy(true); setMessage("");
    try {
      const token = requireAccessToken();
      const response = await fetch("/api/applix/revoke-gmail", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ access_token: token }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || "Could not revoke Gmail connection.");
      setGmailReady(false);
      setMessage("Gmail connection revoked. Calsie can no longer send through this account.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not revoke Gmail connection."); }
    finally { setBusy(false); }
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
        const token = requireAccessToken();
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
      const token = requireAccessToken();
      const response = await fetch("/api/applix/run-campaign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ access_token: token, campaign_id: campaign.id }) });
      const result = await response.json().catch(() => ({})); if (!response.ok || !result.ok) throw new Error(result.error || "Could not find new jobs.");
      setMessage("Job search completed. Open the tracker to review AI-approved jobs. No email was sent.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not find new jobs."); }
    finally { setBusy(false); }
  }

  async function logout() {
    setBusy(true);
    try {
      await signOut();
      router.replace("/");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not sign out.");
    } finally {
      setBusy(false);
    }
  }

  function restoreUnclaimedDraft() {
    if (!unclaimedIntent || !user) return;
    const claimed = claimPendingIntentForUser(unclaimedIntent.id, user.id);
    if (!claimed) {
      setMessage("This draft was replaced in another tab and could not be restored.");
      setUnclaimedIntent(null);
      return;
    }
    setPendingIntent(claimed);
    setUnclaimedIntent(null);
    setActive(claimed.panel);
  }

  function discardDraft(intent: PendingIntentV1) {
    if (!discardPendingIntent(intent.id)) {
      setMessage("This draft was already replaced in another tab.");
      return;
    }
    setPendingIntent(null);
    setUnclaimedIntent(null);
    setRestoredIntentId("");
    setMessage("Campaign draft discarded.");
  }

  if (status !== "authenticated" || !user) {
    return <main className="applix-workspace" aria-live="polite" aria-busy="true"><p role="status" style={{ margin: "auto" }}>Restoring your secure session…</p></main>;
  }

  return (
    <main className="applix-workspace">
      <WorkspaceSidebar
        active={active}
        setActive={setActive}
        running={isCampaignRunning(campaign?.status)}
        approvedCount={approvedCount}
        onToggleCampaign={() => void toggleCampaign()}
        onLogout={() => void logout()}
      />
      <div className="workspace-main">
        {unclaimedIntent ? (
          <div className="workspace-message" role="status" aria-live="polite" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <span>A campaign draft is ready. Restore it to this account?</span>
            <span style={{ display: "flex", gap: 8 }}>
              <button type="button" className="workspace-primary" onClick={restoreUnclaimedDraft}>Restore draft</button>
              <button type="button" className="workspace-secondary" onClick={() => discardDraft(unclaimedIntent)}>Discard draft</button>
            </span>
          </div>
        ) : null}
        {pendingIntent && restoredIntentId === pendingIntent.id ? (
          <div className="workspace-message" role="status" aria-live="polite" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <span>Your campaign draft has been restored.</span>
            <button type="button" className="workspace-secondary" onClick={() => discardDraft(pendingIntent)}>Discard draft</button>
          </div>
        ) : null}
        <WorkspacePanelsLive
          active={active}
          campaign={campaign}
          purchasedTemplate={purchasedTemplate}
          resumeReady={resumeReady}
          resumeName={resumeName}
          gmailReady={gmailReady}
          busy={busy}
          message={message}
          approvedCount={approvedCount}
          passedCount={passedCount}
          pendingIntent={pendingIntent}
          userHint={user.id}
          onPendingIntentChange={setPendingIntent}
          onPendingIntentRestored={setRestoredIntentId}
          onOpenTracker={() => setActive("tracker")}
          onUseTemplate={(item) => void useTemplate(item)}
          onResumeUpload={(file) => void uploadResume(file)}
          onConnectGmail={() => void connectGmail()}
          onRevokeGmail={() => void revokeGmail()}
          onToggleCampaign={() => void toggleCampaign()}
          onFindJobsNow={() => void findJobsNow()}
        />
      </div>
    </main>
  );
}
