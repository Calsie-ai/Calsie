"use client";

import { useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowUpDown,
  Bookmark,
  Briefcase,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  FileText,
  LayoutGrid,
  MapPin,
  Search,
  Target,
} from "lucide-react";
import { getSupabaseClient } from "../../lib/supabaseClient";
import { normaliseAppError } from "../../lib/actionState";
import { inferAustralianPostcode, normaliseAustralianPostcode } from "../../lib/australianPostcode";
import { savePendingIntent, type PendingIntentV1 } from "../../lib/pendingIntent";
import BuildResumePanel from "./BuildResumePanel";
import GmailPanel from "./GmailPanel";
import OverviewDashboard from "./OverviewDashboard";
import ResumePreviewPanel from "./ResumePreviewPanel";
import WorkspacePanels from "./WorkspacePanels";
import { isCampaignRunning, templateCategoryAccent, templateCategoryIcon, type CampaignTemplate } from "./workspace-data";

const SAVED_TEMPLATES_KEY = "calsie:saved-templates";

type BaseProps = ComponentProps<typeof WorkspacePanels>;
type Props = BaseProps & {
  approvedCount: number;
  passedCount: number;
  purchasedTemplate?: CampaignTemplate | null;
  pendingIntent: PendingIntentV1 | null;
  userHint: string;
  greetingName: string;
  onPendingIntentChange: (intent: PendingIntentV1 | null) => void;
  onPendingIntentRestored: (intentId: string) => void;
  onOpenTracker: () => void;
  onBrowseTemplates: () => void;
  onOpenResumePanel: () => void;
  onOpenGmailPanel: () => void;
  onOpenCampaignPanel: () => void;
};

type Row = {
  id: string;
  slug: string;
  title: string;
  campaign_name: string;
  image_url: string | null;
  role: string;
  location: string;
  description: string;
  category: string;
  query_terms: string[];
  include_title_terms: string[];
  exclude_title_terms: string[];
  description_keywords: string[];
  job_types: string[];
  posted_within_days: number;
  price_amount: number;
  compare_at_price_amount: number | null;
  currency: string;
  price_label: string;
  pricing_features: string[];
  payment_required: boolean;
};

type PurchaseState = "not_purchased" | "processing" | "purchased_campaign_missing" | "purchased_campaign_ready" | "failed_or_expired";
type PurchaseStateResponse = {
  ok?: boolean;
  state?: PurchaseState;
  purchase_id?: string | null;
  campaign_id?: string | null;
  error?: string;
};

export function mapTemplate(row: Row): CampaignTemplate {
  return {
    id: row.id,
    slug: row.slug || undefined,
    title: row.title,
    campaignName: row.campaign_name || `${row.title} Campaign`,
    imageUrl: row.image_url,
    role: row.role,
    location: row.location,
    description: row.description,
    category: row.category,
    queryTerms: row.query_terms || [],
    includeTitleTerms: row.include_title_terms || [],
    excludeTitleTerms: row.exclude_title_terms || [],
    descriptionKeywords: row.description_keywords || [],
    jobTypes: row.job_types || [],
    postedWithinDays: row.posted_within_days || 30,
    priceAmount: row.price_amount || 0,
    compareAtPriceAmount: row.compare_at_price_amount,
    currency: row.currency || "aud",
    priceLabel: row.price_label || "one-time",
    pricingFeatures: row.pricing_features || [],
    paymentRequired: row.payment_required !== false,
  };
}

function formatMoney(amount: number, currency = "aud") {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: currency.toUpperCase(), maximumFractionDigits: amount % 100 === 0 ? 0 : 2 }).format(amount / 100);
}

function templateInitial(title: string) {
  return title.trim().charAt(0).toUpperCase() || "?";
}

// Local, always-available photos for the known template categories —
// used whenever a template has no image_url of its own yet, so the grid
// doesn't fall back to a bare monogram for templates we already have art
// for. A template's own uploaded image_url still takes priority.
const LOCAL_TEMPLATE_IMAGES: Array<[RegExp, string]> = [
  [/aged care|agecare/i, "/images/templates/agecare.jpg"],
  [/support worker|healthcare|ndis/i, "/images/templates/supportworker.jpg"],
  [/child ?care/i, "/images/templates/childcare.jpg"],
  [/community|caseworker|social care/i, "/images/templates/communityservice.jpg"],
  [/accounting|finance/i, "/images/templates/accounting.jpg"],
];

// Categories that still show as cards in the grid and stay searchable, but
// are left out of the filter chip row specifically.
const HIDDEN_FILTER_CATEGORIES = new Set(["Accounting"]);

function templateImage(item: CampaignTemplate): string | null {
  if (item.imageUrl) return item.imageUrl;
  const haystack = `${item.category} ${item.title}`;
  const match = LOCAL_TEMPLATE_IMAGES.find(([pattern]) => pattern.test(haystack));
  return match ? match[1] : null;
}

// Template descriptions come back from the CMS as one long block with no
// paragraph breaks. Once expanded, reflow it into short paragraphs at
// sentence boundaries so it reads as more than a single wall of text —
// purely presentational, the stored description itself is untouched.

function descriptionParagraphs(text: string, sentencesPerParagraph = 2): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+(?:\s+|$)/g) || [text];
  const paragraphs: string[] = [];
  for (let i = 0; i < sentences.length; i += sentencesPerParagraph) {
    paragraphs.push(sentences.slice(i, i + sentencesPerParagraph).join("").trim());
  }
  return paragraphs.filter(Boolean);
}

export default function WorkspacePanelsLive(props: Props) {
  const router = useRouter();
  const [templates, setTemplates] = useState<CampaignTemplate[]>([]);
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("");
  const [sortAlpha, setSortAlpha] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<string>>(() => new Set());
  const [selected, setSelected] = useState<CampaignTemplate | null>(null);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [postcode, setPostcode] = useState("");
  const [postcodeTouched, setPostcodeTouched] = useState(false);
  const [checkoutNavigating, setCheckoutNavigating] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [purchaseState, setPurchaseState] = useState<PurchaseState>("not_purchased");
  const [purchaseId, setPurchaseId] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [purchaseLoading, setPurchaseLoading] = useState(false);
  const intentIdRef = useRef("");
  const restoredIntentIdRef = useRef("");

  useEffect(() => {
    if (props.active !== "templates") return;
    const controller = new AbortController();
    setLoading(true);
    setError("");

    async function loadTemplates() {
      try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
          .from("campaign_templates")
          .select("id,slug,title,campaign_name,image_url,role,location,description,category,query_terms,include_title_terms,exclude_title_terms,description_keywords,job_types,posted_within_days,price_amount,compare_at_price_amount,currency,price_label,pricing_features,payment_required")
          .eq("is_active", true)
          .order("updated_at", { ascending: false })
          .abortSignal(controller.signal);
        if (error) throw error;
        if (!controller.signal.aborted) setTemplates(((data || []) as Row[]).map(mapTemplate));
      } catch (error) {
        if (!controller.signal.aborted) setError(normaliseAppError(error, "Could not load templates.") || "");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadTemplates();
    return () => controller.abort();
  }, [props.active]);

  useEffect(() => {
    intentIdRef.current = props.pendingIntent?.type === "purchase_template" ? props.pendingIntent.id : "";
    if (props.pendingIntent || !restoredIntentIdRef.current) return;
    restoredIntentIdRef.current = "";
    setSelected(null);
    setPostcode("");
    setPostcodeTouched(false);
    setCheckoutError("");
  }, [props.pendingIntent]);

  useEffect(() => {
    const intent = props.pendingIntent;
    if (props.active !== "templates" || intent?.type !== "purchase_template" || restoredIntentIdRef.current === intent.id || templates.length === 0) return;
    const template = templates.find((item) => item.id === intent.templateId);
    if (!template) {
      setCheckoutError("The saved campaign template is no longer available. Your draft was kept so you can discard it or try again later.");
      return;
    }
    setSelected(template);
    setPostcode(intent.postcode || "");
    setPostcodeTouched(Boolean(intent.postcode));
    setCheckoutNavigating(false);
    setCheckoutError("");
    restoredIntentIdRef.current = intent.id;
    props.onPendingIntentRestored(intent.id);
  }, [props.active, props.onPendingIntentRestored, props.pendingIntent, templates]);

  // A template picked earlier in the same browser session (via a plain
  // click, not a saved checkout draft) used to stay selected forever once
  // set, since nothing cleared it — so leaving Templates for another tab
  // and coming back landed straight back on that review screen instead of
  // the browse list. Reset on every fresh entry into the tab, unless the
  // effect above is about to restore a genuine unclaimed checkout draft
  // (ref mutations run synchronously, so `restoredIntentIdRef` already
  // reflects that by the time this runs in the same pass).
  const prevActiveRef = useRef(props.active);
  useEffect(() => {
    const enteringTemplates = props.active === "templates" && prevActiveRef.current !== "templates";
    prevActiveRef.current = props.active;
    if (!enteringTemplates) return;
    const intent = props.pendingIntent;
    const hasUnrestoredIntent = intent?.type === "purchase_template" && restoredIntentIdRef.current !== intent.id;
    if (hasUnrestoredIntent) return;
    setSelected(null);
    setPostcode("");
    setPostcodeTouched(false);
    setCheckoutNavigating(false);
    setCheckoutError("");
  }, [props.active, props.pendingIntent]);

  useEffect(() => {
    setDescriptionExpanded(false);
  }, [selected?.id]);

  // Save-for-later is a local, purely presentational affordance — it does
  // not touch campaigns/purchases, so plain localStorage is enough.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SAVED_TEMPLATES_KEY);
      if (raw) setSavedIds(new Set(JSON.parse(raw) as string[]));
    } catch {
      // Ignore unavailable/corrupt storage — saving just starts empty.
    }
  }, []);

  function toggleSaved(id: string) {
    setSavedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      try {
        window.localStorage.setItem(SAVED_TEMPLATES_KEY, JSON.stringify(Array.from(next)));
      } catch {
        // Ignore unavailable storage — the in-memory toggle still works this session.
      }
      return next;
    });
  }

  useEffect(() => {
    if (!selected || props.active !== "templates") {
      setPurchaseState("not_purchased");
      setPurchaseId("");
      setCampaignId("");
      return;
    }
    void refreshPurchaseState(selected.id);
  }, [props.active, selected?.id]);

  const categories = useMemo(() => Array.from(new Set(templates.map((item) => item.category))).sort((a, b) => a.localeCompare(b)), [templates]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = templates.filter((item) => (
      (!needle || `${item.title} ${item.campaignName} ${item.role} ${item.category} ${item.description}`.toLowerCase().includes(needle))
      && (!activeCategory || item.category === activeCategory)
    ));
    return sortAlpha ? [...filtered].sort((a, b) => a.title.localeCompare(b.title)) : filtered;
  }, [activeCategory, query, sortAlpha, templates]);

  const postcodeInfo = useMemo(() => inferAustralianPostcode(postcode.trim()), [postcode]);

  async function accessToken() {
    const { data } = await getSupabaseClient().auth.getSession();
    return data.session?.access_token || "";
  }

  async function refreshPurchaseState(templateId: string) {
    setPurchaseLoading(true);
    try {
      const token = await accessToken();
      if (!token) return;
      const response = await fetch("/api/stripe/purchase-state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: token, template_id: templateId }),
      });
      const result = await response.json() as PurchaseStateResponse;
      if (!response.ok || !result.ok || !result.state) throw new Error(result.error || "Could not load purchase state.");
      setPurchaseState(result.state);
      setPurchaseId(result.purchase_id || "");
      setCampaignId(result.campaign_id || "");
    } catch (error) {
      setCheckoutError(normaliseAppError(error, "Could not load purchase state.") || "");
    } finally {
      setPurchaseLoading(false);
    }
  }

  async function activateCampaign() {
    if (!selected || !purchaseId || checkoutNavigating) return;
    setCheckoutNavigating(true);
    setCheckoutError("");
    try {
      const token = await accessToken();
      if (!token) throw new Error("Your session expired. Sign in again.");
      const response = await fetch("/api/stripe/activate-campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: token, purchase_id: purchaseId }),
      });
      const result = await response.json() as { ok?: boolean; campaign_id?: string; error?: string };
      if (!response.ok || !result.ok || !result.campaign_id) throw new Error(result.error || "Could not create campaign.");
      setCampaignId(result.campaign_id);
      setPurchaseState("purchased_campaign_ready");
      router.push("/dashboard?panel=overview");
    } catch (error) {
      setCheckoutError(normaliseAppError(error, "Could not create campaign.") || "");
    } finally {
      setCheckoutNavigating(false);
    }
  }

  function persistTemplateIntent(item: CampaignTemplate, nextPostcode: string) {
    const saved = savePendingIntent({ id: intentIdRef.current || undefined, type: "purchase_template", returnPath: "/dashboard?panel=templates&restoreIntent=1", panel: "templates", templateId: item.id, templateSlug: item.slug, postcode: nextPostcode || undefined, currentStep: "review", intendedAction: "continue_to_checkout", userHint: props.userHint });
    if (!saved) return null;
    intentIdRef.current = saved.id;
    // Mark this draft as already applied to the view. It was just created
    // here by the user opening a template, so the restore effect below must
    // not treat it as a draft recovered from storage — doing so fired the
    // "your campaign draft has been restored" notice on every template
    // click, which is why discarding it never stuck.
    restoredIntentIdRef.current = saved.id;
    props.onPendingIntentChange(saved);
    return saved;
  }

  function openTemplate(item: CampaignTemplate) {
    setSelected(item);
    setPostcode("");
    setPostcodeTouched(false);
    setCheckoutNavigating(false);
    setCheckoutError("");
    persistTemplateIntent(item, "");
  }

  function continueToCheckout() {
    setPostcodeTouched(true);
    setCheckoutError("");
    if (!selected) return setCheckoutError("Choose a campaign template before checkout.");
    if (!postcodeInfo.valid) return setCheckoutError("Enter a valid 4-digit Australian postcode.");
    if (checkoutNavigating || purchaseState === "processing" || purchaseState.startsWith("purchased_")) return;
    if (!persistTemplateIntent(selected, postcodeInfo.postcode)) return setCheckoutError("Could not safely save this campaign draft. Check browser storage permissions and try again.");
    setCheckoutNavigating(true);
    router.push("/payment?restoreIntent=1");
  }

  if (props.active === "overview") return <OverviewDashboard campaign={props.campaign} purchasedTemplate={props.purchasedTemplate} resumeReady={props.resumeReady} resumeName={props.resumeName} gmailReady={props.gmailReady} approvedCount={props.approvedCount} passedCount={props.passedCount} greetingName={props.greetingName} onOpenTracker={props.onOpenTracker} onBrowseTemplates={props.onBrowseTemplates} onUpdateResume={props.onOpenResumePanel} onConnectGmail={props.onOpenGmailPanel} onSetUpCampaign={props.onOpenCampaignPanel} />;
  if (props.active === "resume") return <ResumePreviewPanel resumeReady={props.resumeReady} resumeName={props.resumeName} uploadState={props.actionStates.uploadResume} onResumeUpload={props.onResumeUpload} />;
  if (props.active === "buildResume") return <BuildResumePanel uploadState={props.actionStates.uploadResume} onResumeUpload={props.onResumeUpload} />;
  if (props.active === "gmail") return <GmailPanel gmailReady={props.gmailReady} actionStates={props.actionStates} onConnectGmail={props.onConnectGmail} onRevokeGmail={props.onRevokeGmail} />;
  if (props.active === "approve" || props.active === "tracker") {
    const approvalMode = props.active === "approve";
    const status = props.campaign?.status || "Not configured";
    const running = isCampaignRunning(status);
    const paused = status === "paused";
    const statusClass = running ? "is-running" : paused ? "is-paused" : "is-idle";
    const statusText = running ? "Campaign running" : paused ? "Paused" : status;
    return <section className="workspace-tracker-section"><header className="workspace-tracker-heading"><div><p>{approvalMode ? "Approval queue" : "Calsie tracker"}</p>{approvalMode ? <h1><span style={{ color: "#ff5f78" }}>SMASH</span> <span style={{ color: "#111" }}>OR PASS</span></h1> : <h1>Application tracker</h1>}<span>{approvalMode ? "Review matched jobs and choose Pass or Smash." : "Only jobs you Smash are added to this tracker."}</span></div><span className={`workspace-status-pill ${statusClass}`}><i /> {statusText}</span></header><div className="workspace-tracker-frame-wrap"><iframe className="workspace-tracker-frame" src={`/tracker?embedded=1&view=${approvalMode ? "review" : "tracker"}`} title={approvalMode ? "Applix job approval queue" : "Applix application tracker"} /></div></section>;
  }
  if (props.active !== "templates") return <WorkspacePanels {...props} />;

  const purchased = purchaseState === "purchased_campaign_missing" || purchaseState === "purchased_campaign_ready";
  const buttonLabel = purchaseLoading ? "Checking purchase…" : purchaseState === "processing" ? "Retry verification" : purchaseState === "purchased_campaign_missing" ? "Create campaign" : purchaseState === "purchased_campaign_ready" ? "Open campaign" : checkoutNavigating ? "Opening checkout…" : selected?.paymentRequired === false ? "Use free template" : "Continue to checkout";
  const buttonAction = purchaseState === "purchased_campaign_missing" ? activateCampaign : purchaseState === "purchased_campaign_ready" ? () => router.push("/dashboard?panel=overview") : purchaseState === "processing" && selected ? () => void refreshPurchaseState(selected.id) : continueToCheckout;

  return (
    <div className="ws-panel">
      {selected ? (
        <div className="ws-review-page">
          {/* Back sits above the page title, as the first thing on the
              page — not buried inside the card below the header, where it
              read as part of the card's content instead of navigation. */}
          <button type="button" className="ws-review-back" onClick={() => setSelected(null)}>
            <ChevronLeft size={17} strokeWidth={2.4} /> Back to templates
          </button>

          {/* No "Templates" eyebrow here — "Back to templates" already
              says which section this is, so the label was pure repetition. */}
          <header className="ws-panel-head ws-templates-hero">
            <h1 className="ws-panel-title">Template details</h1>
            <p className="ws-panel-sub">Review the campaign, choose your postcode, and confirm the price before checkout.</p>
          </header>

          <div className="ws-review-card">
          {/* Compact identity row. The template photo is decorative here, so
              it is a small thumbnail rather than the full-width banner it
              used to be — that banner plus the long description pushed the
              campaign specs below the fold, and those specs are what the
              user is actually deciding on. */}
          <div className="ws-review-identity">
            {templateImage(selected) ? (
              <img className="ws-review-thumb" src={templateImage(selected) as string} alt="" />
            ) : (
              <div className="ws-review-thumb ws-review-thumb-placeholder">
                <span className="ws-placeholder-mark">{templateInitial(selected.title)}</span>
              </div>
            )}
            <div className="ws-review-identity-copy">
              <span className={`ws-template-tag ${templateCategoryAccent(selected.category)}`}>{selected.category}</span>
              <h2>{selected.title}</h2>
              <span className="ws-review-ready">
                <span className="ws-usage-check"><Check size={12} strokeWidth={3} /></span>
                Ready-made campaign · <strong>{selected.campaignName || selected.title}</strong>
              </span>
            </div>
          </div>

          {/* The decision-making detail, promoted directly under the title. */}
          <div className="ws-review-spec">
            <h3>What this campaign runs</h3>
            <div className="ws-recipe-grid">
              <div className="ws-recipe-item">
                <span className="ws-recipe-icon"><Search size={15} strokeWidth={2} /></span>
                <span><span>Search recipe</span><strong>Every Day Job Portal Search</strong></span>
              </div>
              <div className="ws-recipe-item">
                <span className="ws-recipe-icon"><Target size={15} strokeWidth={2} /></span>
                <span><span>Target role</span><strong>{selected.role}</strong></span>
              </div>
              <div className="ws-recipe-item">
                <span className="ws-recipe-icon"><MapPin size={15} strokeWidth={2} /></span>
                <span><span>Location</span><strong>{postcodeInfo.valid ? postcodeInfo.label : "Choose postcode below"}</strong></span>
              </div>
              <div className="ws-recipe-item">
                <span className="ws-recipe-icon"><CalendarDays size={15} strokeWidth={2} /></span>
                <span><span>Posted within</span><strong>{selected.postedWithinDays} days</strong></span>
              </div>
              <div className="ws-recipe-item">
                <span className="ws-recipe-icon"><Briefcase size={15} strokeWidth={2} /></span>
                <span><span>Job type</span><strong>{(selected.jobTypes || []).join(" / ") || "Not specified"}</strong></span>
              </div>
            </div>
          </div>

          {/* Background reading, demoted below the specs and collapsed. */}
          <div className="ws-review-section">
            <h3><FileText size={16} strokeWidth={2} /> About this sector</h3>
            {descriptionExpanded ? (
              <div className="ws-review-hero-desc">
                {descriptionParagraphs(selected.description).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
              </div>
            ) : (
              <p className={`ws-review-hero-desc${selected.description.length > 320 ? " is-clamped" : ""}`}>{selected.description}</p>
            )}
            {selected.description.length > 320 ? (
              <button type="button" className={`ws-template-btn ws-read-more-btn${descriptionExpanded ? " is-expanded" : ""}`} onClick={() => setDescriptionExpanded((value) => !value)}>
                {descriptionExpanded ? "Read less" : "Read more"}<ChevronDown size={14} strokeWidth={2.4} />
              </button>
            ) : null}
          </div>

          <div className="ws-review-section">
            <h3><MapPin size={16} strokeWidth={2} /> Choose campaign location</h3>
            <label className="ws-field ws-field-postcode" htmlFor="campaign-postcode">
              Australian postcode
              <input
                id="campaign-postcode"
                inputMode="numeric"
                autoComplete="postal-code"
                maxLength={4}
                value={postcode}
                disabled={purchased}
                onBlur={() => setPostcodeTouched(true)}
                onChange={(event) => {
                  const nextPostcode = normaliseAustralianPostcode(event.target.value.trim());
                  setPostcode(nextPostcode);
                  setCheckoutError("");
                  persistTemplateIntent(selected, nextPostcode);
                }}
                placeholder="Example: 2141"
                aria-invalid={postcodeTouched && !postcodeInfo.valid}
                aria-describedby="campaign-postcode-message"
              />
            </label>
            <div id="campaign-postcode-message" aria-live="polite">
              {postcodeTouched && !postcodeInfo.valid ? <p className="ws-field-error">Enter a valid 4-digit Australian postcode.</p> : null}
              {postcodeInfo.valid ? <p className="ws-field-success">Detected location: {postcodeInfo.label}</p> : null}
            </div>
            <p className="ws-review-hint">Your postcode will be used to rank nearby jobs and providers that service your area.</p>
          </div>

          <div className="ws-review-section">
            <h3><CheckCircle2 size={16} strokeWidth={2} /> Included with this template</h3>
            {(selected.pricingFeatures || []).length > 0 ? (
              <div className="ws-feature-list">
                {(selected.pricingFeatures || []).map((feature) => (
                  <div key={feature} className="ws-feature-item"><Check size={15} strokeWidth={2.6} />{feature}</div>
                ))}
              </div>
            ) : (
              /* This section previously rendered nothing at all when a
                 template's pricing_features came back empty (AgeCare's
                 row genuinely had []) — an empty heading with no content
                 below it read as a broken page, not an empty one. */
              <p className="ws-review-hint">Feature details for this template are being finalised — check back soon, or contact support for what's included.</p>
            )}
          </div>

          {purchaseState === "processing" ? <div className="ws-panel-message" role="status">Checkout is still being confirmed.</div> : null}
          {purchaseState === "purchased_campaign_missing" ? <div className="ws-panel-message" role="status">Checkout completed. No additional payment is required.</div> : null}
          {purchaseState === "purchased_campaign_ready" ? <div className="ws-panel-message" role="status">This campaign is already in your account.</div> : null}
          {purchaseState === "failed_or_expired" ? <div className="ws-panel-message ws-panel-message-alert" role="alert">The previous checkout failed or expired. Your draft is safe and you can try again.</div> : null}
          {checkoutError ? <div className="ws-panel-message ws-panel-message-alert" role="alert">{checkoutError}</div> : null}

          <div className="ws-checkout-bar">
            <div className="ws-checkout-meta">
              <span>Campaign template</span>
              <strong>{selected.campaignName || selected.title}</strong>
              <small>{postcodeInfo.valid ? postcodeInfo.label : "Enter postcode to continue"}</small>
            </div>
            <div className="ws-checkout-price" aria-label="Template price">
              {selected.compareAtPriceAmount ? <span className="ws-checkout-price-was">{formatMoney(selected.compareAtPriceAmount, selected.currency)}</span> : null}
              <span className="ws-checkout-price-now">{formatMoney(selected.priceAmount || 0, selected.currency)}</span>
              <span className="ws-checkout-price-label">{selected.priceLabel}</span>
            </div>
            <button type="button" className="ws-btn-primary" onClick={() => void buttonAction()} disabled={purchaseLoading || checkoutNavigating || (!postcodeInfo.valid && purchaseState === "not_purchased")}>
              {buttonLabel}<ArrowRight size={15} strokeWidth={2.4} />
            </button>
          </div>
          </div>
        </div>
      ) : (
        <>
          <div className="ws-templates-top">
            <header className="ws-panel-head ws-templates-hero">
              <p className="ws-panel-eyebrow">Templates</p>
              <h1 className="ws-panel-title">Browse templates</h1>
              <p className="ws-panel-sub">Login and browsing are free. Pricing appears only after you choose a template.</p>
            </header>

            <div className="ws-template-search">
              <Search size={18} strokeWidth={1.8} />
              <input id="template-search" aria-label="Search templates or job roles" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search templates or job roles" />
            </div>

            {categories.length > 1 ? (
              <div className="ws-filter-row">
                <button type="button" className={`ws-filter-chip${activeCategory ? "" : " is-active"}`} onClick={() => setActiveCategory("")}>
                  <LayoutGrid size={14} strokeWidth={2.2} /> All categories
                </button>
                {categories.filter((category) => !HIDDEN_FILTER_CATEGORIES.has(category)).map((category) => {
                  const CategoryIcon = templateCategoryIcon(category);
                  return (
                    <button type="button" key={category} className={`ws-filter-chip${activeCategory === category ? " is-active" : ""}`} onClick={() => setActiveCategory(category)}>
                      <CategoryIcon size={14} strokeWidth={2.2} /> {category}
                    </button>
                  );
                })}
                <button type="button" className={`ws-filter-chip${sortAlpha ? " is-active" : ""}`} onClick={() => setSortAlpha((value) => !value)}>
                  <ArrowUpDown size={14} strokeWidth={2.2} /> A–Z
                </button>
              </div>
            ) : null}
          </div>

          {error && <div className="ws-panel-message ws-panel-message-alert" role="alert">{error}</div>}

          {loading ? (
            <div className="ws-template-grid" aria-hidden="true">
              {Array.from({ length: 6 }, (_, index) => (
                <div className="ws-template-card ws-template-card-skeleton" key={index}>
                  <div className="ws-skeleton ws-skeleton-image" />
                  <div className="ws-skeleton ws-skeleton-tag" />
                  <div className="ws-skeleton ws-skeleton-title" />
                  <div className="ws-skeleton ws-skeleton-line" />
                  <div className="ws-skeleton ws-skeleton-line ws-skeleton-line-short" />
                </div>
              ))}
            </div>
          ) : visible.length === 0 ? (
            <div className="ws-empty-state">
              <p className="ws-empty-state-title">No templates match that search</p>
              <p className="ws-empty-state-text">Try a different role or keyword, or use the custom campaign option instead.</p>
            </div>
          ) : (
            <div className="ws-template-grid">
              {visible.map((item) => {
                const cardImage = templateImage(item);
                const accent = templateCategoryAccent(item.category);
                const CategoryIcon = templateCategoryIcon(item.category);
                const saved = savedIds.has(item.id);
                return (
                  <article className="ws-template-card" key={item.id} onClick={() => openTemplate(item)}>
                    <div className="ws-template-card-media">
                      {cardImage ? (
                        <img className="ws-template-card-image" src={cardImage} alt={item.title} />
                      ) : (
                        <div className="ws-template-card-image ws-template-card-image-placeholder">
                          <span className="ws-placeholder-mark">{templateInitial(item.title)}</span>
                        </div>
                      )}
                      <button
                        type="button"
                        className={`ws-card-bookmark${saved ? " is-saved" : ""}`}
                        aria-pressed={saved}
                        aria-label={saved ? `Remove ${item.title} from saved templates` : `Save ${item.title} for later`}
                        onClick={(event) => { event.stopPropagation(); toggleSaved(item.id); }}
                      >
                        <Bookmark size={15} strokeWidth={2.2} fill={saved ? "currentColor" : "none"} />
                      </button>
                      <span className={`ws-card-category-badge ${accent}`}><CategoryIcon size={17} strokeWidth={2} /></span>
                    </div>
                    <span className={`ws-template-tag ${accent}`}>{item.category}</span>
                    <h3>{item.title}</h3>
                    <p>{item.description}</p>
                    <div className="ws-template-foot">
                      <span className="ws-template-usage">{item.role} · Choose postcode</span>
                      {/* Kept as a real button so the card stays reachable by
                          keyboard now that the click target is the whole
                          article; stopPropagation avoids a double open. */}
                      <button type="button" className="ws-template-btn" onClick={(event) => { event.stopPropagation(); openTemplate(item); }}>Review template<ArrowRight size={14} strokeWidth={2.4} /></button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
