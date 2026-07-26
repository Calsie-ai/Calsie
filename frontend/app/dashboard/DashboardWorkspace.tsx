"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "../providers/AuthProvider";
import { getSupabaseClient } from "../../lib/supabaseClient";
import {
  DASHBOARD_ONE_TIME_PARAMS,
  canonicalDashboardPanelPath,
  dashboardPanelPath,
  dashboardPathAfterProcessing,
  isDashboardPanel,
  parseDashboardPanel,
} from "../../lib/dashboardNavigation";
import { loginPathFor, safeInternalPath } from "../../lib/navigation";
import {
  ACTION_TIMEOUTS,
  DASHBOARD_ACTION_KEYS,
  isActionLoading,
  isSessionExpiryError,
  normaliseAppError,
  readJsonResponse,
  type AppNotice,
  type DashboardActionKey,
} from "../../lib/actionState";
import { useActionStates } from "../../lib/useActionStates";
import {
  claimPendingIntentForUser,
  consumePendingIntentAfterSuccess,
  discardPendingIntent,
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
  const active = parseDashboardPanel(searchParams.get("panel"));
  const [campaign, setCampaign] = useState<CampaignRecord | null>(null);
  const [purchasedTemplate, setPurchasedTemplate] = useState<CampaignTemplate | null>(null);
  const [approvedCount, setApprovedCount] = useState(0);
  const [passedCount, setPassedCount] = useState(0);
  const [resumeReady, setResumeReady] = useState(false);
  const [resumeName, setResumeName] = useState("");
  const [gmailReady, setGmailReady] = useState(false);
  const [notice, setNotice] = useState<AppNotice | null>(null);
  const [selectedTemplateActionId, setSelectedTemplateActionId] = useState("");
  const [pendingIntent, setPendingIntent] = useState<PendingIntentV1 | null>(null);
  const [unclaimedIntent, setUnclaimedIntent] = useState<PendingIntentV1 | null>(null);
  const [restoredIntentId, setRestoredIntentId] = useState("");
  const [paymentRetryNonce, setPaymentRetryNonce] = useState(0);
  const paymentCheckRef = useRef("");
  const { abortAction, runAction, states: actionStates } = useActionStates(DASHBOARD_ACTION_KEYS);

  const reportError = useCallback((actionKey: DashboardActionKey, error: unknown, fallback: string) => {
    if (isSessionExpiryError(error)) router.replace(loginPathFor(returnPath));
    const message = normaliseAppError(error, fallback);
    if (message) setNotice({ type: "error", message, actionKey });
  }, [returnPath, router]);

  const reportSuccess = useCallback((actionKey: DashboardActionKey, message: string) => {
    setNotice({ type: "success", message, actionKey });
  }, []);

  const navigateToPanel = useCallback((panel: WorkspaceTab) => {
    router.push(dashboardPanelPath(panel, new URLSearchParams(query)));
  }, [query, router]);

  useEffect(() => {
    if (status === "unauthenticated") router.replace(loginPathFor(returnPath));
  }, [returnPath, router, status]);

  useEffect(() => {
    if (status !== "authenticated" || !user) return;
    void load(user.id, user.email);
    return () => abortAction("loadDashboard");
  }, [status, user?.email, user?.id]);

  useEffect(() => {
    if (status !== "authenticated" || !user) return;
    const currentParams = new URLSearchParams(query);
    const requestedPanel = currentParams.get("panel");
    const intent = readPendingIntent();
    const eligibleIntent = Boolean(
      intent
      && pendingIntentMatchesWorkflow(intent, pathname)
      && (!intent.userHint || intent.userHint === user.id),
    );
    const shouldRestoreIntent = Boolean(
      eligibleIntent
      && intent
      && (
        currentParams.get("restoreIntent") === "1"
        || currentParams.get("payment") === "success"
        || requestedPanel === intent.panel
      ),
    );

    if (shouldRestoreIntent && intent && requestedPanel !== intent.panel) {
      router.replace(dashboardPanelPath(intent.panel, currentParams));
      return;
    }

    const canonicalPath = canonicalDashboardPanelPath(currentParams);
    if (canonicalPath) {
      router.replace(canonicalPath);
      return;
    }

    if (!shouldRestoreIntent || !intent || !isDashboardPanel(requestedPanel)) return;

    let activeEffect = true;
    const applyRestoration = () => {
      if (!activeEffect) return;
      if (intent.userHint === user.id) {
        setPendingIntent(intent);
        setUnclaimedIntent(null);
      } else {
        setUnclaimedIntent(intent);
        setPendingIntent(null);
      }
    };

    if (
      currentParams.get("payment") === "success"
      && intent.type === "purchase_template"
      && session?.access_token
    ) {
      const paymentCheckKey = `${intent.id}:${currentParams.get("session_id") || "no-session"}`;
      if (paymentCheckRef.current === paymentCheckKey) {
        applyRestoration();
        return;
      }
      paymentCheckRef.current = paymentCheckKey;
      setNotice({ type: "info", message: "Verifying your payment…", actionKey: "verifyPayment" });
      void runAction(
        "verifyPayment",
        async ({ signal }) => {
          const response = await fetch("/api/stripe/payment-status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ access_token: session.access_token }),
            signal,
          });
          return readJsonResponse<{ ok?: boolean; paid?: boolean; subscription?: { template_id?: string } }>(
            response,
            "Could not verify payment.",
          );
        },
        { timeoutMs: ACTION_TIMEOUTS.payment, errorMessage: "Could not verify payment." },
      ).then((outcome) => {
        if (!activeEffect) return;
        if (outcome.outcome === "success") {
          const result = outcome.value;
          const paidTemplateId = result.subscription?.template_id;
          if (result.ok && result.paid && paidTemplateId === intent.templateId) {
            consumePendingIntentAfterSuccess(intent.id);
            setPendingIntent(null);
            setUnclaimedIntent(null);
            setRestoredIntentId("");
            reportSuccess("verifyPayment", "Payment confirmed. Your saved checkout draft was completed.");
            const completedPath = dashboardPathAfterProcessing(
              intent.panel,
              currentParams,
              true,
              DASHBOARD_ONE_TIME_PARAMS,
            );
            if (completedPath) router.replace(completedPath);
            return;
          }
          applyRestoration();
          setNotice({ type: "warning", message: "Payment is not confirmed yet. Your campaign draft has been kept.", actionKey: "verifyPayment" });
          return;
        }
        if (outcome.outcome === "error") {
          paymentCheckRef.current = "";
          applyRestoration();
          reportError("verifyPayment", outcome.error, "Could not verify payment. Your draft is safe; retry when ready.");
        }
      });
      return () => {
        activeEffect = false;
        abortAction("verifyPayment");
      };
    }

    applyRestoration();
    return () => {
      activeEffect = false;
    };
  }, [pathname, paymentRetryNonce, query, router, session?.access_token, status, user?.id]);
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
    setNotice(null);
    const outcome = await runAction("loadDashboard", async ({ signal }) => {
      const supabase = getSupabaseClient();
      const [campaignResult, resumeResult, gmailResult] = await Promise.all([
        supabase.from("campaigns").select("id,name,location,target_business_type,search,outreach,status,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).abortSignal(signal),
        supabase.from("resume_profiles").select("id,resume_file_path,resume_file_name").eq("profile_id", userId).order("updated_at", { ascending: false }).limit(1).abortSignal(signal).maybeSingle(),
        supabase.from("user_email_authorizations").select("status").eq("user_identifier", email || userId).eq("provider", "google").abortSignal(signal).maybeSingle(),
      ]);
      if (campaignResult.error) throw campaignResult.error;
      if (resumeResult.error) throw resumeResult.error;
      if (gmailResult.error) throw gmailResult.error;
      const latestCampaign = (((campaignResult.data || [])[0] as CampaignRecord) || null);

      const templateId = latestCampaign?.search?.template_id;
      let purchased: CampaignTemplate | null = null;
      if (templateId) {
        const { data: template, error } = await supabase.from("campaign_templates").select("id,slug,title,campaign_name,image_url,role,location,description,category,query_terms,include_title_terms,exclude_title_terms,description_keywords,job_types,posted_within_days,price_amount,compare_at_price_amount,currency,price_label,pricing_features,payment_required").eq("id", templateId).abortSignal(signal).maybeSingle();
        if (error) throw error;
        purchased = template ? mapTemplate(template) : null;
      }

      let nextApprovedCount = 0;
      let nextPassedCount = 0;
      if (latestCampaign?.id) {
        const { data, error } = await supabase.rpc("get_campaign_tracker_counts", { p_campaign_id: latestCampaign.id }).abortSignal(signal);
        if (error) throw error;
        nextApprovedCount = Number(data?.[0]?.approved_count || 0);
        nextPassedCount = Number(data?.[0]?.passed_count || 0);
      }

      return {
        campaign: latestCampaign,
        gmailReady: gmailResult.data?.status === "connected",
        purchased,
        resumeName: resumeResult.data?.resume_file_name || "",
        resumeReady: Boolean(resumeResult.data?.id),
        approvedCount: nextApprovedCount,
        passedCount: nextPassedCount,
      };
    }, { replace: true, errorMessage: "Could not load your dashboard." });

    if (outcome.outcome === "success") {
      setCampaign(outcome.value.campaign);
      setResumeReady(outcome.value.resumeReady);
      setResumeName(outcome.value.resumeName);
      setGmailReady(outcome.value.gmailReady);
      setPurchasedTemplate(outcome.value.purchased);
      setApprovedCount(outcome.value.approvedCount);
      setPassedCount(outcome.value.passedCount);
    } else if (outcome.outcome === "error") {
      reportError("loadDashboard", outcome.error, "Could not load your dashboard.");
    }
  }

  async function useTemplate(template: CampaignTemplate) {
    setNotice(null);
    setSelectedTemplateActionId(template.id);
    const outcome = await runAction("useTemplate", async ({ signal }) => {
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
      }).select("id,name,location,target_business_type,search,outreach,status,created_at").abortSignal(signal).single();
      if (error) throw error;
      return created as CampaignRecord;
    }, { errorMessage: "Could not use this template." });
    setSelectedTemplateActionId("");

    if (outcome.outcome === "success") {
      setCampaign(outcome.value);
      setPurchasedTemplate(template);
      setApprovedCount(0);
      setPassedCount(0);
      if (pendingIntent?.templateId === template.id) {
        consumePendingIntentAfterSuccess(pendingIntent.id);
        setPendingIntent(null);
      }
      reportSuccess("useTemplate", `${template.title} campaign added.`);
      navigateToPanel("overview");
    } else if (outcome.outcome === "error") {
      reportError("useTemplate", outcome.error, "Could not use this template. Your draft was kept.");
    }
  }

  async function uploadResume(file: File) {
    setNotice(null);
    const extension = file?.name.split(".").pop()?.toLowerCase() || "";
    const allowedExtensions = new Set(["pdf", "doc", "docx"]);
    const allowedMimeTypes = new Set([
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "",
    ]);
    if (!file || !allowedExtensions.has(extension) || !allowedMimeTypes.has(file.type)) {
      setNotice({ type: "error", message: "Choose a PDF, DOC, or DOCX resume.", actionKey: "uploadResume" });
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      setNotice({ type: "error", message: "The resume must be 6 MB or smaller.", actionKey: "uploadResume" });
      return;
    }

    const outcome = await runAction("uploadResume", async ({ requestId }) => {
      const currentUser = requireUser();
      const supabase = getSupabaseClient();
      const path = `${currentUser.id}/master-source-${requestId}.${extension}`;
      const { error: storageError } = await supabase.storage.from("resumes").upload(path, file, {
        upsert: false,
        contentType: file.type || "application/octet-stream",
      });
      if (storageError) throw storageError;
      const { error } = await supabase.from("resume_profiles").upsert({
        profile_id: currentUser.id,
        resume_file_path: path,
        resume_file_name: file.name,
        resume_file_type: file.type || extension,
      }, { onConflict: "profile_id" });
      if (error) throw error;
      return { name: file.name };
    }, { timeoutMs: ACTION_TIMEOUTS.upload, errorMessage: "Could not update your resume." });

    if (outcome.outcome === "success") {
      setResumeReady(true);
      setResumeName(outcome.value.name);
      reportSuccess("uploadResume", "Resume updated.");
    } else if (outcome.outcome === "error") {
      reportError("uploadResume", outcome.error, "Could not update your resume. Your previous resume is still selected.");
    }
  }

  async function connectGmail() {
    setNotice(null);
    const outcome = await runAction("connectGmail", async ({ signal }) => {
      const token = requireAccessToken();
      const gmailReturnPath = dashboardPanelPath("gmail", new URLSearchParams(query));
      const response = await fetch("/api/applix/connect-gmail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: token, return_to: `${window.location.origin}${gmailReturnPath}` }),
        signal,
      });
      const result = await readJsonResponse<{ ok?: boolean; authorization_url?: string }>(response, "Could not connect Gmail.");
      if (!result.authorization_url) throw new Error("Gmail authorization URL missing");
      return result.authorization_url;
    }, { timeoutMs: ACTION_TIMEOUTS.gmail, errorMessage: "Could not connect Gmail." });

    if (outcome.outcome === "success") {
      window.location.assign(outcome.value);
    } else if (outcome.outcome === "error") {
      reportError("connectGmail", outcome.error, "Could not connect Gmail.");
    }
  }

  async function revokeGmail() {
    const confirmed = window.confirm("Revoke the connected Gmail account? Calsie will no longer be able to send application emails until you connect again.");
    if (!confirmed) return;
    setNotice(null);
    const outcome = await runAction("revokeGmail", async ({ signal }) => {
      const token = requireAccessToken();
      const response = await fetch("/api/applix/revoke-gmail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: token }),
        signal,
      });
      const result = await readJsonResponse<{ ok?: boolean }>(response, "Could not revoke Gmail connection.");
      if (!result.ok) throw new Error("Gmail revoke failed");
      return true;
    }, { timeoutMs: ACTION_TIMEOUTS.gmail, errorMessage: "Could not revoke Gmail connection." });

    if (outcome.outcome === "success") {
      setGmailReady(false);
      reportSuccess("revokeGmail", "Gmail connection revoked. Calsie can no longer send through this account.");
    } else if (outcome.outcome === "error") {
      reportError("revokeGmail", outcome.error, "Could not revoke Gmail. Your existing connection was left unchanged.");
    }
  }

  async function toggleCampaign() {
    if (!campaign) { navigateToPanel("templates"); return; }
    const actionKey: DashboardActionKey = isCampaignRunning(campaign.status) ? "pauseCampaign" : "startCampaign";
    setNotice(null);
    const campaignBeforeAction = campaign;
    const outcome = await runAction(actionKey, async ({ signal }) => {
      const supabase = getSupabaseClient();
      if (actionKey === "pauseCampaign") {
        const { data: updated, error } = await supabase.from("campaigns").update({
          status: "paused",
          outreach: { ...(campaignBeforeAction.outreach || {}), active: false, paused_at: new Date().toISOString() },
        }).eq("id", campaignBeforeAction.id).select("id,name,location,target_business_type,search,outreach,status,created_at").abortSignal(signal).single();
        if (error) throw error;
        return updated as CampaignRecord;
      }
      if (!resumeReady || !gmailReady) throw new Error("Campaign prerequisites missing");
      const token = requireAccessToken();
      const response = await fetch("/api/applix/schedule-campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: token, campaign_id: campaignBeforeAction.id, enabled: true }),
        signal,
      });
      const result = await readJsonResponse<{ ok?: boolean; campaign?: CampaignRecord; outreach?: CampaignRecord["outreach"] }>(response, "Could not start campaign.");
      if (!result.ok) throw new Error("Campaign start failed");
      return result.campaign || {
        ...campaignBeforeAction,
        status: "active",
        outreach: { ...(campaignBeforeAction.outreach || {}), ...(result.outreach || {}), active: true, scheduled: true },
      };
    }, { errorMessage: actionKey === "pauseCampaign" ? "Could not pause campaign." : "Could not start campaign." });

    if (outcome.outcome === "success") {
      setCampaign(outcome.value);
      reportSuccess(actionKey, actionKey === "pauseCampaign" ? "Campaign paused." : "Campaign started. AI matching is running; no email was sent.");
    } else if (outcome.outcome === "error") {
      const fallback = actionKey === "pauseCampaign"
        ? "Could not pause campaign. Its previous state was kept."
        : !resumeReady || !gmailReady
          ? "Upload your resume and connect Gmail before starting the campaign."
          : "Could not start campaign. Its previous state was kept.";
      reportError(actionKey, outcome.error, fallback);
    }
  }

  async function findJobsNow() {
    if (!campaign || !isCampaignRunning(campaign.status)) {
      setNotice({ type: "warning", message: "Resume the campaign before finding new jobs.", actionKey: "findJobs" });
      return;
    }
    setNotice(null);
    const campaignId = campaign.id;
    const outcome = await runAction("findJobs", async ({ signal }) => {
      const token = requireAccessToken();
      const response = await fetch("/api/applix/run-campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: token, campaign_id: campaignId }),
        signal,
      });
      const result = await readJsonResponse<{ ok?: boolean }>(response, "Could not find new jobs.");
      if (!result.ok) throw new Error("Job search failed");
      return true;
    }, { timeoutMs: ACTION_TIMEOUTS.campaignSearch, errorMessage: "Could not find new jobs." });

    if (outcome.outcome === "success") {
      reportSuccess("findJobs", "Job search completed. Open the tracker to review AI-approved jobs. No email was sent.");
    } else if (outcome.outcome === "error") {
      reportError("findJobs", outcome.error, "Could not find new jobs. Your campaign state was kept.");
    }
  }

  async function logout() {
    setNotice(null);
    const outcome = await runAction("logout", async () => {
      await signOut();
      return true;
    }, { errorMessage: "Could not sign out." });
    if (outcome.outcome === "success") {
      router.replace("/");
      router.refresh();
    } else if (outcome.outcome === "error") {
      reportError("logout", outcome.error, "Could not sign out.");
    }
  }

  async function restoreUnclaimedDraft() {
    if (!unclaimedIntent || !user) return;
    const intentId = unclaimedIntent.id;
    const userId = user.id;
    const outcome = await runAction("restoreIntent", async () => claimPendingIntentForUser(intentId, userId), {
      errorMessage: "Could not restore this draft.",
    });
    if (outcome.outcome !== "success") return;
    const claimed = outcome.value;
    if (!claimed) {
      setNotice({ type: "warning", message: "This draft was replaced in another tab and could not be restored.", actionKey: "restoreIntent" });
      setUnclaimedIntent(null);
      return;
    }
    setPendingIntent(claimed);
    setUnclaimedIntent(null);
    reportSuccess("restoreIntent", "Campaign draft restored.");
    navigateToPanel(claimed.panel);
  }

  async function discardDraft(intent: PendingIntentV1) {
    const outcome = await runAction("discardIntent", async () => discardPendingIntent(intent.id), {
      errorMessage: "Could not discard this draft.",
    });
    if (outcome.outcome !== "success") return;
    if (!outcome.value) {
      setNotice({ type: "warning", message: "This draft was already replaced in another tab.", actionKey: "discardIntent" });
      return;
    }
    setPendingIntent(null);
    setUnclaimedIntent(null);
    setRestoredIntentId("");
    reportSuccess("discardIntent", "Campaign draft discarded.");
    const completedPath = dashboardPathAfterProcessing(
      active,
      new URLSearchParams(query),
      true,
      DASHBOARD_ONE_TIME_PARAMS,
    );
    if (completedPath) router.replace(completedPath);
  }

  const handlePendingIntentRestored = useCallback((intentId: string) => {
    setRestoredIntentId(intentId);
    const currentParams = new URLSearchParams(query);
    if (currentParams.get("restoreIntent") !== "1") return;
    const completedPath = dashboardPathAfterProcessing(
      parseDashboardPanel(currentParams.get("panel")),
      currentParams,
      true,
      ["restoreIntent"],
    );
    if (completedPath) router.replace(completedPath);
  }, [query, router]);

  if (status !== "authenticated" || !user) {
    return <main className="applix-workspace" aria-live="polite" aria-busy="true"><p role="status" style={{ margin: "auto" }}>Restoring your secure session…</p></main>;
  }

  const campaignActionKey: DashboardActionKey = isCampaignRunning(campaign?.status) ? "pauseCampaign" : "startCampaign";
  const campaignActionLoading = isActionLoading(actionStates, campaignActionKey);
  const campaignActionBlocked = (
    isActionLoading(actionStates, "startCampaign")
    || isActionLoading(actionStates, "pauseCampaign")
  );

  return (
    <main className="applix-workspace">
      <WorkspaceSidebar
        active={active}
        onNavigate={navigateToPanel}
        running={isCampaignRunning(campaign?.status)}
        approvedCount={approvedCount}
        actionLoading={campaignActionLoading}
        actionDisabled={!campaign || campaignActionBlocked || (!isCampaignRunning(campaign.status) && (!resumeReady || !gmailReady))}
        onToggleCampaign={() => void toggleCampaign()}
        logoutLoading={isActionLoading(actionStates, "logout")}
        onLogout={() => void logout()}
      />
      <div className="workspace-main">
        {notice ? (
          <div
            className="workspace-message"
            role={notice.type === "error" ? "alert" : "status"}
            aria-live={notice.type === "error" ? "assertive" : "polite"}
          >
            {notice.message}
            {notice.actionKey === "verifyPayment" && notice.type === "error" ? (
              <button
                type="button"
                className="workspace-secondary"
                disabled={isActionLoading(actionStates, "verifyPayment")}
                onClick={() => {
                  paymentCheckRef.current = "";
                  setPaymentRetryNonce((value) => value + 1);
                }}
              >
                Retry verification
              </button>
            ) : null}
          </div>
        ) : null}
        {unclaimedIntent ? (
          <div className="workspace-message" role="status" aria-live="polite" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <span>A campaign draft is ready. Restore it to this account?</span>
            <span style={{ display: "flex", gap: 8 }}>
              <button type="button" className="workspace-primary" disabled={isActionLoading(actionStates, "restoreIntent")} onClick={() => void restoreUnclaimedDraft()}>
                {isActionLoading(actionStates, "restoreIntent") ? "Restoring…" : "Restore draft"}
              </button>
              <button type="button" className="workspace-secondary" disabled={isActionLoading(actionStates, "discardIntent")} onClick={() => void discardDraft(unclaimedIntent)}>
                {isActionLoading(actionStates, "discardIntent") ? "Discarding…" : "Discard draft"}
              </button>
            </span>
          </div>
        ) : null}
        {pendingIntent && restoredIntentId === pendingIntent.id ? (
          <div className="workspace-message" role="status" aria-live="polite" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <span>Your campaign draft has been restored.</span>
            <button type="button" className="workspace-secondary" disabled={isActionLoading(actionStates, "discardIntent")} onClick={() => void discardDraft(pendingIntent)}>
              {isActionLoading(actionStates, "discardIntent") ? "Discarding…" : "Discard draft"}
            </button>
          </div>
        ) : null}
        <WorkspacePanelsLive
          active={active}
          campaign={campaign}
          purchasedTemplate={purchasedTemplate}
          resumeReady={resumeReady}
          resumeName={resumeName}
          gmailReady={gmailReady}
          actionStates={actionStates}
          selectedTemplateActionId={selectedTemplateActionId}
          approvedCount={approvedCount}
          passedCount={passedCount}
          pendingIntent={pendingIntent}
          userHint={user.id}
          onPendingIntentChange={setPendingIntent}
          onPendingIntentRestored={handlePendingIntentRestored}
          onOpenTracker={() => navigateToPanel("tracker")}
          onUseTemplate={(item) => void useTemplate(item)}
          onResumeUpload={uploadResume}
          onConnectGmail={() => void connectGmail()}
          onRevokeGmail={() => void revokeGmail()}
          onToggleCampaign={() => void toggleCampaign()}
          onFindJobsNow={() => void findJobsNow()}
        />
      </div>
    </main>
  );
}
