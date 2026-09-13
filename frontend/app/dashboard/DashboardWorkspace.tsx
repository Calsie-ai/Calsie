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
import WorkspacePanelsLive, { mapTemplate } from "./WorkspacePanelsLive";
import { CAMPAIGN_PLAN, isCampaignRunning, type CampaignRecord, type CampaignTemplate, type WorkspaceTab } from "./workspace-data";
import { googleAvatarFromMetadata, readHideGoogleAvatar, resolveAvatar } from "../../lib/googleAvatar";
import type { ProfileResumeSignals, ProfileRow } from "./ProfilePanel";

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

    if (externalReturn?.kind === "stripe_cancelled") {
      applyRestoration();
      setExternalReturnState((state) => transitionExternalReturn(
        transitionExternalReturn(state, { type: "return", kind: "stripe_cancelled" }),
        { type: "cancel" },
      ));
      setNotice({
        type: "warning",
        message: "Checkout was cancelled. Your campaign details were kept.",
        actionKey: "verifyPayment",
      });
      const completedPath = dashboardPathAfterProcessing(
        "templates",
        currentParams,
        true,
        PAYMENT_RETURN_PARAMS,
      );
      if (completedPath) router.replace(completedPath);
      return () => {
        activeEffect = false;
      };
    }

    if (externalReturn?.kind === "stripe_success") {
      applyRestoration();
      const validPurchaseIntent = Boolean(
        intent
        && eligibleIntent
        && intent.type === "purchase_template"
        && intent.templateId
        && intent.postcode,
      );
      if (externalReturn.invalidSession || !externalReturn.sessionId || !validPurchaseIntent || !intent || !session?.access_token) {
        setExternalReturnState((state) => transitionExternalReturn(
          transitionExternalReturn(state, { type: "return", kind: "stripe_success" }),
          { type: "fail" },
        ));
        setNotice({
          type: "error",
          message: "This payment return could not be verified. Your checkout draft is safe.",
          actionKey: "verifyPayment",
        });
        const completedPath = dashboardPathAfterProcessing(
          "templates",
          currentParams,
          true,
          PAYMENT_RETURN_PARAMS,
        );
        if (completedPath) router.replace(completedPath);
        return () => {
          activeEffect = false;
        };
      }

      const paymentCheckKey = paymentVerificationKey(externalReturn.sessionId, intent.id);
      if (paymentCheckRef.current === paymentCheckKey) {
        return;
      }
      paymentCheckRef.current = paymentCheckKey;
      setExternalReturnState((state) => transitionExternalReturn(
        transitionExternalReturn(state, { type: "return", kind: "stripe_success", key: paymentCheckKey }),
        { type: "verify" },
      ));
      setNotice({ type: "info", message: "Verifying your payment…", actionKey: "verifyPayment" });
      void runAction(
        "verifyPayment",
        async ({ signal }) => {
          const response = await fetch("/api/stripe/payment-status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              access_token: session.access_token,
              checkout_session_id: externalReturn.sessionId,
              intent_id: intent.id,
              template_id: intent.templateId,
              postcode: intent.postcode,
            }),
            signal,
          });
          return readJsonResponse<PaymentVerificationResponse>(
            response,
            "Could not verify payment.",
          );
        },
        { timeoutMs: ACTION_TIMEOUTS.payment, errorMessage: "Could not verify payment." },
      ).then((outcome) => {
        if (!activeEffect) return;
        if (outcome.outcome === "success") {
          const result = outcome.value;
          if (
            isConfirmedPaymentStatus(result)
            && result.checkoutSessionId === externalReturn.sessionId
            && result.templateId === intent.templateId
            && result.postcode === intent.postcode
          ) {
            consumePendingIntentAfterSuccess(intent.id);
            setPendingIntent(intent);
            setUnclaimedIntent(null);
            setRestoredIntentId("");
            setExternalReturnState((state) => transitionExternalReturn(
              transitionExternalReturn(state, { type: "confirm" }),
              { type: "process" },
            ));
            reportSuccess("verifyPayment", "Payment confirmed. Your saved checkout draft was completed.");
            const completedPath = dashboardPathAfterProcessing(
              intent.panel,
              currentParams,
              true,
              PAYMENT_RETURN_PARAMS,
            );
            if (completedPath) router.replace(completedPath);
            return;
          }
          if (result.status === "pending") {
            setExternalReturnState((state) => transitionExternalReturn(state, { type: "pending" }));
            setNotice({ type: "warning", message: "Payment is still processing. Your checkout draft is safe; retry verification shortly.", actionKey: "verifyPayment" });
            return;
          }
          setExternalReturnState((state) => transitionExternalReturn(state, { type: "fail" }));
          setNotice({ type: "error", message: "Payment could not be confirmed. Your checkout draft is safe.", actionKey: "verifyPayment" });
          return;
        }
        if (outcome.outcome === "error") {
          paymentCheckRef.current = "";
          setExternalReturnState((state) => transitionExternalReturn(state, { type: "fail" }));
          reportError("verifyPayment", outcome.error, "Could not verify payment. Your draft is safe; retry when ready.");
        }
      });
      return () => {
        activeEffect = false;
        abortAction("verifyPayment");
      };
    }

    if (gmailReturn && externalReturn) {
      const gmailCheckKey = `${externalReturn.kind}:${externalReturn.kind === "gmail_error" ? externalReturn.reason : "connected"}`;
      if (gmailCheckRef.current === gmailCheckKey) return;
      gmailCheckRef.current = gmailCheckKey;
      setExternalReturnState((state) => transitionExternalReturn(
        transitionExternalReturn(state, { type: "return", kind: externalReturn.kind, key: gmailCheckKey }),
        { type: "verify" },
      ));
      setNotice({ type: "info", message: "Checking your Gmail connection…", actionKey: "verifyGmail" });
      void runAction(
        "verifyGmail",
        async ({ signal }) => {
          const supabase = getSupabaseClient();
          const result = await supabase
            .from("user_email_authorizations")
            .select("status,provider_email,connected_at")
            .eq("user_identifier", user.email || user.id)
            .eq("provider", "google")
            .abortSignal(signal)
            .maybeSingle();
          if (result.error) throw result.error;
          return { connected: result.data?.status === "connected" };
        },
        { timeoutMs: ACTION_TIMEOUTS.gmail, errorMessage: "Could not check Gmail status." },
      ).then((outcome) => {
        if (!activeEffect) return;
        if (outcome.outcome === "success") {
          const connected = outcome.value.connected;
          setGmailReady(connected);
          if (externalReturn.kind === "gmail_connected" && connected) {
            setExternalReturnState((state) => transitionExternalReturn(
              transitionExternalReturn(state, { type: "confirm" }),
              { type: "process" },
            ));
            reportSuccess("verifyGmail", "Gmail connected.");
          } else {
            setExternalReturnState((state) => transitionExternalReturn(
              transitionExternalReturn(state, { type: "fail" }),
              { type: "process" },
            ));
            setNotice({
              type: connected ? "warning" : "error",
              message: externalReturn.kind === "gmail_error"
                ? gmailReturnMessage(externalReturn.reason)
                : "Gmail authorization returned, but no active connection was confirmed. Try connecting again.",
              actionKey: "verifyGmail",
            });
          }
          const completedPath = dashboardPathAfterProcessing(
            "gmail",
            currentParams,
            true,
            GMAIL_RETURN_PARAMS,
          );
          if (completedPath) router.replace(completedPath);
          return;
        }
        if (outcome.outcome === "error") {
          gmailCheckRef.current = "";
          setExternalReturnState((state) => transitionExternalReturn(state, { type: "fail" }));
          reportError("verifyGmail", outcome.error, "Could not check Gmail status. Your existing connection was left unchanged.");
        }
      });
      return () => {
        activeEffect = false;
        abortAction("verifyGmail");
      };
    }

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
      const [campaignResult, resumeResult, gmailResult, profileResult] = await Promise.all([
        supabase.from("campaigns").select("id,name,location,target_business_type,search,outreach,status,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).abortSignal(signal),
        // The extra columns here are what the profile panel needs. They ride
        // along on queries this load already makes, so Profile opens with no
        // fetch of its own instead of blocking on a second round trip.
        supabase.from("resume_profiles").select("id,resume_file_path,resume_file_name,target_role,profile_summary,skills,work_experience").eq("profile_id", userId).order("updated_at", { ascending: false }).limit(1).abortSignal(signal).maybeSingle(),
        supabase.from("user_email_authorizations").select("status").eq("user_identifier", email || userId).eq("provider", "google").abortSignal(signal).maybeSingle(),
        supabase.from("profiles").select("full_name,email,phone,location,avatar_url,preferences,created_at").eq("id", userId).abortSignal(signal).maybeSingle(),
      ]);
      if (campaignResult.error) throw campaignResult.error;
      if (resumeResult.error) throw resumeResult.error;
      if (gmailResult.error) throw gmailResult.error;
      if (profileResult.error) throw profileResult.error;
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
        profile: (profileResult.data as ProfileRow | null) || null,
        resumeSignals: {
          targetRole: resumeResult.data?.target_role || "",
          profileSummary: resumeResult.data?.profile_summary || "",
          skillsCount: countJsonArray(resumeResult.data?.skills),
          experienceCount: countJsonArray(resumeResult.data?.work_experience),
        } satisfies ProfileResumeSignals,
      };
    }, { replace: true, errorMessage: "Could not load your dashboard." });

    if (outcome.outcome === "success") {
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
      const savedIntent = readPendingIntent();
      setExternalReturnState((state) => transitionExternalReturn(state, {
        type: "depart",
        kind: "gmail_connected",
        key: savedIntent?.id || "",
      }));
      const response = await fetch("/api/applix/connect-gmail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          access_token: token,
          provider: "google",
          return_path: "/dashboard?panel=gmail",
          pending_intent_id: savedIntent?.id || null,
        }),
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
    isActionLoading(actionStates, "startCampaign")
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
  const campaignPrerequisitesMissing = Boolean(campaign) && !isCampaignRunning(campaign?.status) && (!resumeReady || !gmailReady);
  const campaignActionDisabled = Boolean(campaign) && (campaignActionBlocked || campaignPrerequisitesMissing);
  // A disabled control that never says why is a dead end — name the one
  // thing still standing in the way.
  const campaignDisabledReason = !campaign
    ? "Choose a campaign template to get started"
    : campaignPrerequisitesMissing
      ? (!resumeReady ? "Upload your resume first" : "Connect Gmail first")
      : "";

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
        />
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
