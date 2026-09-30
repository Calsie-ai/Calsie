"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, CloudUpload, Recycle, X } from "lucide-react";
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
import {
  GMAIL_RETURN_PARAMS,
  IDLE_EXTERNAL_RETURN,
  PAYMENT_RETURN_PARAMS,
  gmailReturnMessage,
  isConfirmedPaymentStatus,
  parseExternalReturn,
  paymentVerificationKey,
  transitionExternalReturn,
  type ExternalReturnState,
  type PaymentVerificationResponse,
} from "../../lib/externalReturn";
import { HelpCircle } from "lucide-react";
import WorkspaceSidebar from "./WorkspaceSidebar";
import WorkspaceTopbar from "./WorkspaceTopbar";
import WorkspacePanelsLive from "./WorkspacePanelsLive";
import { isCampaignRunning, type CampaignRecord, type CampaignTemplate, type WorkspaceTab } from "./workspace-data";
import { googleAvatarFromMetadata, readHideGoogleAvatar, resolveAvatar } from "../../lib/googleAvatar";
import { AGENT_TEMPLATES, agentCampaign, type CalsieAgent } from "../../lib/careAgents";
import type { ProfileResumeSignals, ProfileRow } from "./ProfilePanel";
import NotificationsPanel from "./NotificationsPanel";
import { useNotifications } from "./useNotifications";
import { safeNotificationUrl, type UserNotification } from "../../lib/notifications";

type AuthUserLike = { email?: string | null; user_metadata?: Record<string, unknown> | null } | null;

/** jsonb columns arrive as unknown; count only real, non-empty entries. */
function countJsonArray(value: unknown): number {
  return Array.isArray(value) ? value.filter(Boolean).length : 0;
}

function metaStringField(user: AuthUserLike, keys: string[]) {
  const meta = user?.user_metadata;
  if (!meta) return null;
  for (const key of keys) {
    const value = meta[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function fullNameFor(user: AuthUserLike) {
  return metaStringField(user, ["full_name", "name"]) || user?.email || "Account";
}

function greetingNameFor(user: AuthUserLike) {
  const source = metaStringField(user, ["full_name", "name"]) || (user?.email ? user.email.split("@")[0] : "");
  const firstToken = source.split(/[\s._-]+/)[0] || "";
  if (!firstToken) return "there";
  return firstToken.charAt(0).toUpperCase() + firstToken.slice(1);
}

export default function DashboardWorkspace() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { session, signOut, status, user } = useAuth();
  const query = searchParams.toString();
  const returnPath = safeInternalPath(`${pathname}${query ? `?${query}` : ""}`);
  const active = parseDashboardPanel(searchParams.get("panel"));
  const [campaign, setCampaign] = useState<CampaignRecord | null>(null);
  const [ownedAgents, setOwnedAgents] = useState<CalsieAgent[]>([]);
  const campaignIdRef = useRef("");
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
  const [gmailRetryNonce, setGmailRetryNonce] = useState(0);
  const [externalReturnState, setExternalReturnState] = useState<ExternalReturnState>(IDLE_EXTERNAL_RETURN);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  // Saved profile row values. These override the auth user_metadata fallback
  // so an edit on the profile panel shows in the sidebar/topbar immediately,
  // without a reload.
  // Loaded as part of the single dashboard load below, not by the profile
  // panel on mount — so opening Profile costs no round trip and renders
  // immediately with data that is already in memory.
  const [profileRow, setProfileRow] = useState<ProfileRow | null>(null);
  const [resumeSignals, setResumeSignals] = useState<ProfileResumeSignals>({});
  const paymentCheckRef = useRef("");
  const gmailCheckRef = useRef("");
  const { abortAction, runAction, states: actionStates } = useActionStates(DASHBOARD_ACTION_KEYS);
  const notifications = useNotifications(user?.id);

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

  // Selecting a template in search deep-links via the ?template= param that
  // dashboardPanelPath already retains and validates; WorkspacePanelsLive
  // reads it and opens that template's detail view.
  // Keeps the sidebar/topbar and the cached row in step after an edit, so
  // leaving Profile and coming back shows the saved values without refetching.
  const handleProfileChange = useCallback((patch: Partial<ProfileRow>) => {
    setProfileRow((current) => ({ ...(current || {}), ...patch }));
  }, []);

  const openTemplateFromSearch = useCallback((slug: string) => {
    const params = new URLSearchParams(query);
    params.set("template", slug);
    router.push(dashboardPanelPath("templates", params));
  }, [query, router]);

  const openNotification = useCallback((notification: UserNotification) => {
    if (notification.status === "unread") void notifications.markRead(notification.id);
    const destination = safeNotificationUrl(notification.action_url);
    if (destination) router.push(destination);
    else navigateToPanel("notifications");
  }, [navigateToPanel, notifications, router]);

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
    const externalReturn = parseExternalReturn(currentParams);
    const intent = readPendingIntent();
    const eligibleIntent = Boolean(
      intent
      && (intent.type !== "purchase_template" || AGENT_TEMPLATES.some((item) => item.id === intent.templateId))
      && pendingIntentMatchesWorkflow(intent, pathname)
      && (!intent.userHint || intent.userHint === user.id),
    );
    const paymentReturn = externalReturn?.kind === "stripe_success" || externalReturn?.kind === "stripe_cancelled";
    const gmailReturn = externalReturn?.kind === "gmail_connected" || externalReturn?.kind === "gmail_error";
    const expectedPanel = paymentReturn ? "templates" : gmailReturn ? "gmail" : null;
    const shouldRestoreIntent = Boolean(eligibleIntent && intent && (
      currentParams.get("restoreIntent") === "1"
      || paymentReturn
      || requestedPanel === intent.panel
    ));

    if (expectedPanel && requestedPanel !== expectedPanel) {
      router.replace(dashboardPanelPath(expectedPanel, currentParams));
      return;
    }

    if (!expectedPanel && shouldRestoreIntent && intent && requestedPanel !== intent.panel) {
      router.replace(dashboardPanelPath(intent.panel, currentParams));
      return;
    }

    const canonicalPath = canonicalDashboardPanelPath(currentParams);
    if (canonicalPath) {
      router.replace(canonicalPath);
      return;
    }

    if (paymentReturn || gmailReturn) {
      setNotice({ type: "info", message: paymentReturn ? "Payments are deferred while your workspace is rebuilt." : "Gmail integration is not connected to this fresh workspace yet." });
      const clean = new URLSearchParams(currentParams);
      for (const key of [...PAYMENT_RETURN_PARAMS, ...GMAIL_RETURN_PARAMS]) clean.delete(key);
      router.replace(dashboardPanelPath(paymentReturn ? "templates" : "gmail", clean));
      return;
    }

    let activeEffect = true;
    const applyRestoration = () => {
      if (!activeEffect || !intent || !eligibleIntent) return;
      if (intent.userHint === user.id) {
        setPendingIntent(intent);
        setUnclaimedIntent(null);
      } else {
        setUnclaimedIntent(intent);
        setPendingIntent(null);
      }
    };

    if (shouldRestoreIntent && intent && isDashboardPanel(requestedPanel)) applyRestoration();
    return () => {
      activeEffect = false;
    };
  }, [
    abortAction,
    gmailRetryNonce,
    pathname,
    paymentRetryNonce,
    query,
    reportError,
    reportSuccess,
    router,
    runAction,
    session?.access_token,
    status,
    user,
  ]);
  useEffect(() => {
    const receiveTrackerCounts = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === "applix-tracker-counts") {
        if (event.data.campaignId === campaignIdRef.current) {
          setApprovedCount(Number(event.data.approvedCount || 0));
          setPassedCount(Number(event.data.passedCount || 0));
        } else if (event.data.campaignId && user?.id) {
          void load(user.id, user.email || undefined);
        }
      }
    };
    window.addEventListener("message", receiveTrackerCounts);
    return () => window.removeEventListener("message", receiveTrackerCounts);
  }, [user?.id, user?.email]);

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

  async function load(userId: string, email: string | undefined, preferredAgentId?: string) {
    setNotice(null);
    const outcome = await runAction("loadDashboard", async ({ signal }) => {
      const supabase = getSupabaseClient();
      const [agentResult, profileResult] = await Promise.all([
        supabase.from("calsie_agents").select("id,category,name,status,payment_status,preferences,created_at,started_at").eq("user_id", userId).order("created_at", { ascending: false }).abortSignal(signal),
        supabase.from("calsie_profiles").select("full_name,email,phone,location,avatar_url,preferences,created_at,resume_file_path,resume_file_name,resume_draft").eq("id", userId).abortSignal(signal).maybeSingle(),
      ]);
      if (agentResult.error) throw agentResult.error;
      if (profileResult.error) throw profileResult.error;
      const savedCampaignId = preferredAgentId || window.localStorage.getItem(`calsie:agent-campaign:${userId}`);
      const agents = (agentResult.data || []) as CalsieAgent[];
      const selectedAgent = agents.find((item) => item.id === savedCampaignId) || agents[0] || null;
      const latestCampaign = selectedAgent ? agentCampaign(selectedAgent) : null;
      const definition = AGENT_TEMPLATES.find((item) => item.id === selectedAgent?.category);
      const purchased = definition ? { ...definition, location: latestCampaign?.location || definition.location } : null;
      const resume = (profileResult.data?.resume_draft || {}) as Record<string, unknown>;
      let nextApprovedCount = 0;
      let nextPassedCount = 0;
      if (latestCampaign) {
        const [approved, skipped] = await Promise.all([
          supabase.from("calsie_job_swipe_decisions").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("agent_id", latestCampaign.id).eq("decision", "approved").abortSignal(signal),
          supabase.from("calsie_job_swipe_decisions").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("agent_id", latestCampaign.id).eq("decision", "skipped").abortSignal(signal),
        ]);
        if (approved.error) throw approved.error;
        if (skipped.error) throw skipped.error;
        nextApprovedCount = approved.count || 0;
        nextPassedCount = skipped.count || 0;
      }

      return {
        agents,
        campaign: latestCampaign,
        gmailReady: false,
        purchased,
        resumeName: profileResult.data?.resume_file_name || "",
        resumeReady: Boolean(profileResult.data?.resume_file_path),
        approvedCount: nextApprovedCount,
        passedCount: nextPassedCount,
        profile: (profileResult.data as ProfileRow | null) || null,
        resumeSignals: {
          targetRole: typeof resume.target_role === "string" ? resume.target_role : "",
          profileSummary: typeof resume.profile_summary === "string" ? resume.profile_summary : "",
          skillsCount: countJsonArray(resume.skills),
          experienceCount: countJsonArray(resume.work_experience),
        } satisfies ProfileResumeSignals,
      };
    }, { replace: true, errorMessage: "Could not load your dashboard." });

    if (outcome.outcome === "success") {
      setOwnedAgents(outcome.value.agents);
      campaignIdRef.current = outcome.value.campaign?.id || "";
      setProfileRow(outcome.value.profile);
      setResumeSignals(outcome.value.resumeSignals);
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
      if (!AGENT_TEMPLATES.some((item) => item.id === template.id)) throw new Error("Choose an available agent.");
      const { data: created, error } = await supabase.rpc("calsie_choose_agent", {
        p_category: template.id, p_location: template.location || "Australia",
      }).abortSignal(signal).single();
      if (error) throw error;
      const agent = created as CalsieAgent;
      window.localStorage.setItem(`calsie:agent-campaign:${currentUser.id}`, agent.id);
      return agentCampaign(agent);
    }, { errorMessage: "Could not activate this agent." });
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
      campaignIdRef.current = outcome.value.id;
      void load(user!.id, user!.email);
      reportSuccess("useTemplate", `${template.title} selected.`);
      navigateToPanel("campaign");
    } else if (outcome.outcome === "error") {
      reportError("useTemplate", outcome.error, "Could not activate this agent. Your draft was kept.");
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
      const { error } = await supabase.from("calsie_profiles").upsert({
        id: currentUser.id,
        resume_file_path: path,
        resume_file_name: file.name,
        resume_file_type: file.type || extension,
      }, { onConflict: "id" });
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
    setNotice({ type: "info", message: "Gmail connection is the next integration step. Your dashboard and resume are preserved.", actionKey: "connectGmail" });
  }

  async function revokeGmail() {
    setNotice({ type: "info", message: "No Gmail account is connected to this fresh workspace.", actionKey: "revokeGmail" });
  }

  async function toggleCampaign() {
    if (!campaign) { navigateToPanel("templates"); return; }
    if (isActionLoading(actionStates, "loadDashboard")) return;
    const currentUser = requireUser();
    const agentId = campaign.id;
    const nextStatus = campaign.status === "active" ? "paused" : "active";
    const actionKey = nextStatus === "paused" ? "pauseCampaign" : "startCampaign";
    setNotice(null);
    const outcome = await runAction(actionKey, async ({ signal }) => {
      const { data, error } = await getSupabaseClient().from("calsie_agents")
        .update({ status: nextStatus }).eq("id", agentId).eq("user_id", currentUser.id)
        .eq("status", campaign.status)
        .select("id,category,name,status,payment_status,preferences,created_at,started_at").abortSignal(signal).single();
      if (error) throw error;
      return data as CalsieAgent;
    }, { errorMessage: "Could not update your campaign. Refresh and try again." });
    if (outcome.outcome === "success") {
      setOwnedAgents((items) => items.map((item) => item.id === agentId ? outcome.value : item));
      if (campaignIdRef.current === agentId) setCampaign(agentCampaign(outcome.value));
      reportSuccess(actionKey, nextStatus === "paused" ? "Campaign paused. Your history is saved." : "Campaign started. You can review jobs in Smash / Pass.");
    } else if (outcome.outcome === "error") {
      reportError(actionKey, outcome.error, "Could not update your campaign. Refresh and try again.");
    }
  }

  function openOwnedAgent(agent: CalsieAgent) {
    const currentUser = requireUser();
    if (!ownedAgents.some((item) => item.id === agent.id)) return;
    if (pendingIntent?.templateId === agent.category) {
      consumePendingIntentAfterSuccess(pendingIntent.id);
      setPendingIntent(null);
    }
    window.localStorage.setItem(`calsie:agent-campaign:${currentUser.id}`, agent.id);
    setCampaign(agentCampaign(agent));
    campaignIdRef.current = agent.id;
    const definition = AGENT_TEMPLATES.find((item) => item.id === agent.category);
    setPurchasedTemplate(definition ? { ...definition, location: agent.preferences?.location || definition.location } : null);
    void load(currentUser.id, currentUser.email, agent.id);
    navigateToPanel("campaign");
  }

  async function findJobsNow() {
    if (!campaign) { navigateToPanel("templates"); return; }
    navigateToPanel("approve");
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

  // The "draft restored" notice is purely informational — the draft is
  // already applied by the time it shows — so it behaves like a toast:
  // it clears itself after a few seconds, and can be dismissed sooner.
  // Dismissing only hides the message; the restored draft itself stays.
  useEffect(() => {
    if (!restoredIntentId) return;
    const timer = window.setTimeout(() => setRestoredIntentId(""), 4500);
    return () => window.clearTimeout(timer);
  }, [restoredIntentId]);

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
    isActionLoading(actionStates, "loadDashboard")
    || isActionLoading(actionStates, "startCampaign")
    || isActionLoading(actionStates, "pauseCampaign")
  );
  // A saved profile row wins over auth user_metadata, which is only ever a
  // fallback for accounts that have never opened the profile screen.
  const savedName = (profileRow?.full_name || "").trim();
  const fullName = savedName || fullNameFor(user);
  const greetingName = savedName.split(/[\s._-]+/)[0] || greetingNameFor(user);
  const initial = (fullName.trim().charAt(0) || "?").toUpperCase();

  // "avatars" is a public bucket, so this needs no signed-URL round trip.
  const uploadedAvatarUrl = profileRow?.avatar_url
    ? getSupabaseClient().storage.from("avatars").getPublicUrl(profileRow.avatar_url).data.publicUrl
    : "";
  // Supabase Auth already carries the Google picture for anyone who signed in
  // with, or linked, Google — so this default costs nothing to fetch.
  const googleAvatarUrl = googleAvatarFromMetadata(user.user_metadata as Record<string, unknown> | null);
  const avatar = resolveAvatar({
    uploadedUrl: uploadedAvatarUrl,
    googleUrl: googleAvatarUrl,
    hideGoogle: readHideGoogleAvatar(profileRow?.preferences),
  });
  const avatarUrl = avatar.src;
  const profileLoading = isActionLoading(actionStates, "loadDashboard") && !profileRow;
  const campaignActionDisabled = Boolean(campaign) && campaignActionBlocked;
  const campaignDisabledReason = !campaign ? "Choose an agent to get started" : "";

  return (
    <main className={`applix-workspace${sidebarOpen ? "" : " is-sidebar-collapsed"}`}>
      <WorkspaceSidebar
        active={active}
        onNavigate={navigateToPanel}
        running={isCampaignRunning(campaign?.status)}
        approvedCount={approvedCount}
        actionLoading={campaignActionLoading}
        actionDisabled={campaignActionDisabled}
        disabledReason={campaignDisabledReason}
        onToggleCampaign={() => campaign ? void toggleCampaign() : navigateToPanel("campaign")}
        logoutLoading={isActionLoading(actionStates, "logout")}
        onLogout={() => void logout()}
        displayName={fullName}
        email={user.email ?? ""}
        initial={initial}
        avatarUrl={avatarUrl}
        profileActive={active === "profile"}
        onOpenProfile={() => navigateToPanel("profile")}
        collapsed={!sidebarOpen}
        onToggleCollapsed={() => setSidebarOpen((value) => !value)}
      />
      <div className={`workspace-main${active === "templates" ? " is-templates" : ""}`}>
        <div className="ws-topbar-zone">
          <WorkspaceTopbar
            displayName={fullName}
            initial={initial}
            avatarUrl={avatarUrl}
            onOpenProfile={() => navigateToPanel("profile")}
            onNavigate={navigateToPanel}
            onOpenTemplate={openTemplateFromSearch}
            notifications={notifications.items}
            unreadNotificationCount={notifications.unreadCount}
            notificationsLoading={notifications.loading}
            onOpenNotification={openNotification}
            onOpenNotifications={() => navigateToPanel("notifications")}
            onMarkAllNotificationsRead={() => void notifications.markAllRead()}
          />
          {unclaimedIntent ? (
            <div className="ws-notice ws-notice-draft" role="status" aria-live="polite">
              <span className="ws-notice-icon"><CloudUpload size={18} strokeWidth={2} /></span>
              <p className="ws-notice-text">A campaign draft is ready. Restore it to this account?</p>
              <span className="ws-notice-actions">
                <button type="button" className="ws-btn-primary" disabled={isActionLoading(actionStates, "restoreIntent")} onClick={() => void restoreUnclaimedDraft()}>
                  {isActionLoading(actionStates, "restoreIntent") ? "Restoring…" : "Restore draft"}
                </button>
                <button type="button" className="ws-notice-link" disabled={isActionLoading(actionStates, "discardIntent")} onClick={() => void discardDraft(unclaimedIntent)}>
                  {isActionLoading(actionStates, "discardIntent") ? "Discarding…" : "Discard draft"}<ArrowRight size={13} strokeWidth={2.4} />
                </button>
              </span>
            </div>
          ) : null}
          {pendingIntent && restoredIntentId === pendingIntent.id ? (
            <div className="ws-notice ws-notice-draft" role="status" aria-live="polite">
              <span className="ws-notice-icon"><Recycle size={18} strokeWidth={2} /></span>
              <p className="ws-notice-text">Your campaign draft has been restored.</p>
              <span className="ws-notice-actions">
                <button type="button" className="ws-notice-link" disabled={isActionLoading(actionStates, "discardIntent")} onClick={() => void discardDraft(pendingIntent)}>
                  {isActionLoading(actionStates, "discardIntent") ? "Discarding…" : "Discard draft"}<ArrowRight size={13} strokeWidth={2.4} />
                </button>
              </span>
              <button type="button" className="ws-notice-close" aria-label="Dismiss this message" onClick={() => setRestoredIntentId("")}>
                <X size={15} strokeWidth={2.4} />
              </button>
            </div>
          ) : null}
        </div>
        {notice ? (
          <div
            className={`ws-notice${notice.type === "error" ? " ws-notice-error" : notice.type === "success" ? " ws-notice-success" : " ws-notice-warning"}`}
            role={notice.type === "error" ? "alert" : "status"}
            aria-live={notice.type === "error" ? "assertive" : "polite"}
          >
            <span>{notice.message}</span>
            <span className="ws-notice-actions">
              {notice.actionKey === "verifyPayment"
                && (externalReturnState.phase === "pending" || (externalReturnState.phase === "failed" && searchParams.get("payment") === "success")) ? (
                <button
                  type="button"
                  className="ws-btn-outline"
                  disabled={isActionLoading(actionStates, "verifyPayment")}
                  onClick={() => {
                    paymentCheckRef.current = "";
                    setPaymentRetryNonce((value) => value + 1);
                  }}
                >
                  Retry verification
                </button>
              ) : null}
              {notice.actionKey === "verifyPayment"
                && pendingIntent?.type === "purchase_template"
                && (externalReturnState.phase === "cancelled" || externalReturnState.phase === "failed") ? (
                <button
                  type="button"
                  className="ws-btn-outline"
                  onClick={() => router.push("/payment?restoreIntent=1")}
                >
                  Continue to checkout
                </button>
              ) : null}
              {notice.actionKey === "verifyGmail"
                && notice.type === "error"
                && searchParams.has("gmail") ? (
                <button
                  type="button"
                  className="ws-btn-outline"
                  disabled={isActionLoading(actionStates, "verifyGmail")}
                  onClick={() => {
                    gmailCheckRef.current = "";
                    setGmailRetryNonce((value) => value + 1);
                  }}
                >
                  Check Gmail status
                </button>
              ) : null}
            </span>
          </div>
        ) : null}
        {active === "notifications" ? (
          <NotificationsPanel
            items={notifications.items}
            unreadCount={notifications.unreadCount}
            loading={notifications.loading}
            error={notifications.error}
            onRefresh={() => void notifications.refresh()}
            onOpen={openNotification}
            onMarkRead={(id) => void notifications.markRead(id)}
            onMarkUnread={(id) => void notifications.markUnread(id)}
            onMarkAllRead={() => void notifications.markAllRead()}
            onArchive={(id) => void notifications.archive(id)}
          />
        ) : <WorkspacePanelsLive
          active={active}
          campaign={campaign}
          purchasedTemplate={purchasedTemplate}
          ownedAgents={ownedAgents}
          onOpenOwnedAgent={openOwnedAgent}
          resumeReady={resumeReady}
          resumeName={resumeName}
          gmailReady={gmailReady}
          actionStates={actionStates}
          selectedTemplateActionId={selectedTemplateActionId}
          approvedCount={approvedCount}
          passedCount={passedCount}
          pendingIntent={pendingIntent}
          userHint={user.id}
          greetingName={greetingName}
          accountEmail={user.email ?? ""}
          memberSince={user.created_at}
          emailConfirmed={Boolean(user.email_confirmed_at)}
          profile={profileRow}
          profileResumeSignals={resumeSignals}
          profileLoading={profileLoading}
          googleAvatarUrl={googleAvatarUrl}
          uploadedAvatarUrl={uploadedAvatarUrl}
          onNavigatePanel={navigateToPanel}
          onOpenTemplateDeepLink={openTemplateFromSearch}
          onLogout={() => void logout()}
          onProfileChange={handleProfileChange}
          onPendingIntentChange={setPendingIntent}
          onPendingIntentRestored={handlePendingIntentRestored}
          onOpenTracker={() => navigateToPanel("tracker")}
          onBrowseTemplates={() => navigateToPanel("templates")}
          onOpenResumePanel={() => navigateToPanel("resume")}
          onOpenGmailPanel={() => navigateToPanel("gmail")}
          onOpenCampaignPanel={() => navigateToPanel("campaign")}
          onUseTemplate={(item) => void useTemplate(item)}
          onResumeUpload={uploadResume}
          onConnectGmail={() => void connectGmail()}
          onRevokeGmail={() => void revokeGmail()}
          onToggleCampaign={() => void toggleCampaign()}
          onFindJobsNow={() => void findJobsNow()}
        />}
      </div>
      <button
        type="button"
        className="ws-fab"
        aria-label="Help"
        title="Help"
        onClick={() => router.push("/support")}
      >
        <HelpCircle size={26} strokeWidth={2.1} />
      </button>
    </main>
  );
}
