"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  Building2,
  Camera,
  CheckCircle2,
  ExternalLink,
  FileText,
  HelpCircle,
  LayoutGrid,
  Mail,
  MailX,
  MapPin,
  MessageSquare,
  Power,
  ScrollText,
  ShieldCheck,
  Target,
  Trash2,
  UserRound,
} from "lucide-react";
import { getSupabaseClient } from "../../lib/supabaseClient";
import { isActionLoading, normaliseAppError, type ActionStateMap, type DashboardActionKey } from "../../lib/actionState";
import { CALSIE_CONTACT_EMAIL } from "../../lib/contact";
import {
  buildProfileChecklist,
  profileStrength,
  profileStrengthLabel,
} from "../../lib/profileCompletion";
import { isGoogleAvatarUrl, readHideGoogleAvatar, resolveAvatar } from "../../lib/googleAvatar";
import {
  applyThemePreference,
  isThemePreference,
  readStoredTheme,
  readThemePreference,
  THEME_CHANGE_EVENT,
  type ThemePreference,
} from "../../lib/theme";
import { GMAIL_PRIVACY_POLICY_VERSION } from "./gmail-consent";
import {
  CAMPAIGN_PLAN,
  campaignLocation,
  campaignRole,
  isCampaignRunning,
  type CampaignRecord,
  type CampaignTemplate,
  type WorkspaceTab,
} from "./workspace-data";

/** The columns of `profiles` this screen reads. Loaded by DashboardWorkspace. */
export type ProfileRow = {
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  avatar_url?: string | null;
  preferences?: unknown;
  created_at?: string | null;
};

/** Derived from the latest `resume_profiles` row, for the strength meter. */
export type ProfileResumeSignals = {
  targetRole?: string | null;
  profileSummary?: string | null;
  skillsCount?: number;
  experienceCount?: number;
};

type Props = {
  userId: string;
  email: string;
  /** auth.users.created_at — used for "Member since". */
  memberSince?: string | null;
  emailConfirmed: boolean;
  /** Already-loaded profile row — this panel does not fetch it itself. */
  profile: ProfileRow | null;
  profileResumeSignals: ProfileResumeSignals;
  /** True only while the dashboard's single load is still in flight. */
  profileLoading: boolean;
  /** Google picture from Supabase auth metadata; "" when there is none. */
  googleAvatarUrl: string | null;
  /** Public URL of a picture uploaded to Calsie; "" when there is none. */
  uploadedAvatarUrl: string;
  campaign: CampaignRecord | null;
  purchasedTemplate?: CampaignTemplate | null;
  resumeReady: boolean;
  resumeName: string;
  gmailReady: boolean;
  approvedCount: number;
  passedCount: number;
  actionStates: ActionStateMap<DashboardActionKey>;
  onNavigate: (panel: WorkspaceTab) => void;
  onToggleCampaign: () => void;
  onConnectGmail: () => void;
  onRevokeGmail: () => void;
  onLogout: () => void;
  /** Lets the sidebar/topbar avatar and name update without a page reload. */
  onProfileChange: (patch: Partial<ProfileRow>) => void;
};

const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const AVATAR_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const THEME_OPTIONS: Array<{ value: ThemePreference; label: string }> = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

function monthYear(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-AU", { month: "long", year: "numeric" });
}

export default function ProfilePanel({
  userId,
  email,
  memberSince,
  emailConfirmed,
  profile,
  profileResumeSignals,
  profileLoading,
  googleAvatarUrl,
  uploadedAvatarUrl,
  campaign,
  purchasedTemplate,
  resumeReady,
  resumeName,
  gmailReady,
  approvedCount,
  passedCount,
  actionStates,
  onNavigate,
  onToggleCampaign,
  onConnectGmail,
  onRevokeGmail,
  onLogout,
  onProfileChange,
}: Props) {
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedNote, setSavedNote] = useState("");
  const [editing, setEditing] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const [themePreference, setThemePreference] = useState<ThemePreference>("system");

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Read straight from the already-loaded row. There is deliberately no fetch
  // in this component: the dashboard's single load has this data before the
  // user can click through to here, so the panel paints immediately.
  const fullName = profile?.full_name || "";
  const phone = profile?.phone || "";
  const location = profile?.location || "";
  const avatarPath = profile?.avatar_url || null;
  const hideGoogleAvatar = readHideGoogleAvatar(profile?.preferences);

  const avatar = resolveAvatar({
    uploadedUrl: uploadedAvatarUrl,
    googleUrl: googleAvatarUrl,
    hideGoogle: hideGoogleAvatar,
  });
  const hasGoogleAvatar = isGoogleAvatarUrl(googleAvatarUrl);

  // Draft copies so Cancel can restore what was last saved.
  const [draft, setDraft] = useState({ fullName, phone, location });

  // Re-seed the draft when the saved row changes underneath (first load, or
  // a save elsewhere) — but never while the user is mid-edit, or their typing
  // would be discarded.
  useEffect(() => {
    if (editing) return;
    setDraft({ fullName, phone, location });
  }, [editing, fullName, phone, location]);

  // The stored account preference is the *default* for a new device. A choice
  // already made on this device wins, so switching theme on one machine does
  // not yank it out from under another.
  const appliedAccountThemeRef = useRef(false);
  useEffect(() => {
    if (appliedAccountThemeRef.current || !profile) return;
    appliedAccountThemeRef.current = true;
    const stored = (profile.preferences as { theme?: unknown } | null)?.theme;
    if (!readStoredTheme() && isThemePreference(stored)) {
      applyThemePreference(stored);
      setThemePreference(stored);
      return;
    }
    setThemePreference(readThemePreference());
  }, [profile]);

  // Keep the picker in step with the topbar toggle.
  useEffect(() => {
    setThemePreference(readThemePreference());
    const sync = () => setThemePreference(readThemePreference());
    window.addEventListener(THEME_CHANGE_EVENT, sync);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, sync);
  }, []);

  useEffect(() => {
    if (!savedNote) return;
    const timer = window.setTimeout(() => setSavedNote(""), 3500);
    return () => window.clearTimeout(timer);
  }, [savedNote]);

  /* ---------------- actions ---------------- */

  const saveDetails = useCallback(async () => {
    setSaving(true);
    setLoadError("");
    try {
      const supabase = getSupabaseClient();
      const next = {
        full_name: draft.fullName.trim(),
        phone: draft.phone.trim(),
        location: draft.location.trim(),
      };
      const { error } = await supabase.from("profiles").upsert({
        id: userId,
        email,
        ...next,
      });
      if (error) throw error;

      setEditing(false);
      setSavedNote("Your details were saved.");
      onProfileChange(next);
    } catch (error) {
      setLoadError(normaliseAppError(error, "Could not save your details.") || "");
    } finally {
      setSaving(false);
    }
  }, [draft, email, onProfileChange, userId]);

  const uploadAvatar = useCallback(async (file: File) => {
    setAvatarError("");
    const extension = AVATAR_TYPES[file.type];
    if (!extension) {
      setAvatarError("Choose a JPG, PNG, or WEBP image.");
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      setAvatarError("The image must be 2 MB or smaller.");
      return;
    }

    setAvatarBusy(true);
    const previousPath = avatarPath;
    try {
      const supabase = getSupabaseClient();
      const path = `${userId}/avatar-${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;

      const { error } = await supabase.from("profiles").upsert({ id: userId, email, avatar_url: path });
      if (error) throw error;

      onProfileChange({ avatar_url: path });
      setSavedNote("Profile photo updated.");

      // Best effort — a leftover old file is harmless, a failed cleanup
      // must not fail the upload the user just completed successfully.
      if (previousPath) await supabase.storage.from("avatars").remove([previousPath]).catch(() => undefined);
    } catch (error) {
      setAvatarError(normaliseAppError(error, "Could not update your photo.") || "");
    } finally {
      setAvatarBusy(false);
    }
  }, [avatarPath, email, onProfileChange, userId]);

  const removeAvatar = useCallback(async () => {
    if (!avatarPath) return;
    setAvatarBusy(true);
    setAvatarError("");
    const previousPath = avatarPath;
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.from("profiles").upsert({ id: userId, email, avatar_url: null });
      if (error) throw error;
      onProfileChange({ avatar_url: null });
      // Falls back to the Google picture when there is one, not to initials.
      setSavedNote(hasGoogleAvatar && !hideGoogleAvatar
        ? "Removed. Your Google profile photo is showing again."
        : "Profile photo removed.");
      await supabase.storage.from("avatars").remove([previousPath]).catch(() => undefined);
    } catch (error) {
      setAvatarError(normaliseAppError(error, "Could not remove your photo.") || "");
    } finally {
      setAvatarBusy(false);
    }
  }, [avatarPath, email, hasGoogleAvatar, hideGoogleAvatar, onProfileChange, userId]);

  /**
   * Merges into the `preferences` jsonb rather than replacing it — it is a
   * shared bag, so writing one key must not drop the others. The current
   * value is already in memory, so this needs no read round trip.
   */
  const savePreferences = useCallback(async (patch: Record<string, unknown>) => {
    const base = (profile?.preferences as Record<string, unknown> | null) || {};
    const merged = { ...base, ...patch };
    onProfileChange({ preferences: merged });
    try {
      await getSupabaseClient().from("profiles").upsert({ id: userId, email, preferences: merged });
    } catch {
      /* Already applied locally; a failed preference write is not worth
         interrupting the user for. */
    }
  }, [email, onProfileChange, profile?.preferences, userId]);

  const chooseTheme = useCallback(async (preference: ThemePreference) => {
    // Apply immediately — persistence is a background nicety, not a gate.
    applyThemePreference(preference);
    setThemePreference(preference);
    try {
      await savePreferences({ theme: preference });
    } catch {
      /* The theme is already applied locally; failing to persist the
         account default is not worth interrupting the user for. */
    }
  }, [savePreferences]);

  /* ---------------- derived ---------------- */

  const checklist = useMemo(() => buildProfileChecklist({
    fullName,
    phone,
    location,
    // The *shown* picture, so a Google photo counts — the workspace is
    // personalised either way, which is what this item is about.
    avatarUrl: avatar.src,
    resumeReady,
    gmailReady,
    hasCampaign: Boolean(campaign),
    ...profileResumeSignals,
  }), [avatar.src, campaign, fullName, gmailReady, location, phone, profileResumeSignals, resumeReady]);

  const strength = useMemo(() => profileStrength(checklist), [checklist]);

  const displayName = fullName.trim() || email.split("@")[0] || "Your account";
  const initial = (displayName.trim().charAt(0) || "?").toUpperCase();
  const running = isCampaignRunning(campaign?.status);
  const campaignBusy = isActionLoading(actionStates, "startCampaign") || isActionLoading(actionStates, "pauseCampaign");
  const logoutLoading = isActionLoading(actionStates, "logout");
  const revokeLoading = isActionLoading(actionStates, "revokeGmail");
  const connectLoading = isActionLoading(actionStates, "connectGmail");
  // Deliberately does NOT fall back to campaign.name: this card sits beside
  // the campaign card, and echoing the same title in both made two different
  // cards look like duplicates of each other.
  const activeTemplateName = purchasedTemplate?.title || "";

  const plan = (campaign?.outreach || {}) as Record<string, unknown>;
  const planNumber = (key: string, fallback: number) => {
    const value = plan[key];
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
  };

  // Only reached when someone lands directly on ?panel=profile and the
  // dashboard's single load has not returned yet. Navigating here from
  // inside the app hits no loading state at all — the data is already here.
  // The skeleton mirrors the real layout so nothing jumps when it swaps in.
  if (profileLoading) {
    return (
      <div className="ws-panel">
        <header className="ws-panel-head">
          <p className="ws-panel-eyebrow ws-panel-eyebrow-icon"><UserRound size={13} strokeWidth={2.4} /> Account</p>
          <h1 className="ws-panel-title">Profile</h1>
          <p className="ws-panel-sub">Your details, campaign, preferences and support — all in one place.</p>
        </header>

        <p className="ws-acct-sr-only" role="status" aria-live="polite">Loading your profile…</p>

        <section className="ws-acct-card ws-acct-identity" aria-hidden="true">
          <div className="ws-acct-identity-main">
            <div className="ws-acct-avatar-block">
              <span className="ws-skeleton ws-acct-skel-avatar" />
              <span className="ws-skeleton ws-acct-skel-line" style={{ width: 118, height: 32 }} />
            </div>
            <div className="ws-acct-identity-copy">
              <span className="ws-skeleton ws-acct-skel-line" style={{ width: "42%", height: 24 }} />
              <span className="ws-skeleton ws-acct-skel-line" style={{ width: "30%", height: 14 }} />
              <div className="ws-acct-skel-row">
                <span className="ws-skeleton ws-acct-skel-pill" />
                <span className="ws-skeleton ws-acct-skel-pill" style={{ width: 170 }} />
              </div>
              <div className="ws-acct-skel-grid">
                {[0, 1, 2].map((key) => (
                  <div key={key}>
                    <span className="ws-skeleton ws-acct-skel-line" style={{ width: "60%", height: 11 }} />
                    <span className="ws-skeleton ws-acct-skel-line" style={{ width: "80%", height: 16 }} />
                  </div>
                ))}
              </div>
              <span className="ws-skeleton ws-acct-skel-line" style={{ width: 120, height: 36 }} />
            </div>
          </div>
        </section>

        <section className="ws-acct-card" aria-hidden="true">
          <div className="ws-acct-card-head">
            <div style={{ flex: 1 }}>
              <span className="ws-skeleton ws-acct-skel-line" style={{ width: 60, height: 11 }} />
              <span className="ws-skeleton ws-acct-skel-line" style={{ width: 170, height: 20 }} />
            </div>
            <span className="ws-skeleton ws-acct-skel-line" style={{ width: 62, height: 26 }} />
          </div>
          <span className="ws-skeleton" style={{ display: "block", height: 8, borderRadius: 999 }} />
          <div className="ws-acct-skel-list">
            {[0, 1, 2, 3, 4].map((key) => (
              <div className="ws-acct-skel-item" key={key}>
                <span className="ws-skeleton ws-acct-skel-dot" />
                <span className="ws-skeleton ws-acct-skel-line" style={{ flex: 1, height: 15 }} />
                <span className="ws-skeleton ws-acct-skel-line" style={{ width: 46, height: 13 }} />
              </div>
            ))}
          </div>
        </section>

        <div className="ws-acct-grid" aria-hidden="true">
          {[0, 1].map((key) => (
            <section className="ws-acct-card" key={key}>
              <div className="ws-acct-card-head">
                <div style={{ flex: 1 }}>
                  <span className="ws-skeleton ws-acct-skel-line" style={{ width: 72, height: 11 }} />
                  <span className="ws-skeleton ws-acct-skel-line" style={{ width: "65%", height: 20 }} />
                </div>
                <span className="ws-skeleton" style={{ width: 38, height: 38, borderRadius: 11 }} />
              </div>
              <span className="ws-skeleton ws-acct-skel-line" style={{ width: "100%", height: 14 }} />
              <span className="ws-skeleton ws-acct-skel-line" style={{ width: "70%", height: 14 }} />
              <div className="ws-acct-skel-row">
                <span className="ws-skeleton ws-acct-skel-line" style={{ width: 132, height: 38 }} />
                <span className="ws-skeleton ws-acct-skel-line" style={{ width: 132, height: 38 }} />
              </div>
            </section>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="ws-panel">
      <header className="ws-panel-head">
        <p className="ws-panel-eyebrow ws-panel-eyebrow-icon"><UserRound size={13} strokeWidth={2.4} /> Account</p>
        <h1 className="ws-panel-title">Profile</h1>
        <p className="ws-panel-sub">Your details, campaign, preferences and support — all in one place.</p>
      </header>

      {loadError ? <p className="ws-acct-alert" role="alert">{loadError}</p> : null}
      {savedNote ? <p className="ws-acct-note" role="status" aria-live="polite">{savedNote}</p> : null}

      {/* ---------- Identity ---------- */}
      <section className="ws-acct-card ws-acct-identity" aria-labelledby="acct-identity-heading">
        <div className="ws-acct-identity-main">
          <div className="ws-acct-avatar-block">
            <span className="ws-acct-avatar">
              {avatar.src
                ? <img src={avatar.src} alt="" referrerPolicy="no-referrer" />
                : <span className="ws-acct-avatar-initial" aria-hidden="true">{initial}</span>}
            </span>

            <div className="ws-acct-avatar-actions">
              <button
                type="button"
                className="ws-btn-outline ws-acct-photo-btn"
                disabled={avatarBusy}
                onClick={() => fileInputRef.current?.click()}
              >
                <Camera size={14} strokeWidth={2.2} />
                {avatarBusy ? "Working…" : avatar.source === "upload" ? "Change photo" : "Upload photo"}
              </button>

              {avatar.source === "upload" ? (
                <button type="button" className="ws-acct-link-btn" disabled={avatarBusy} onClick={() => void removeAvatar()}>
                  <Trash2 size={13} strokeWidth={2.2} /> Remove
                </button>
              ) : null}

              <input
                ref={fileInputRef}
                hidden
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => {
                  const input = event.currentTarget;
                  const file = input.files?.[0];
                  input.value = "";
                  if (file) void uploadAvatar(file);
                }}
              />
            </div>

            {avatar.source === "google" ? null : (
              <small className="ws-acct-avatar-note">
                {avatar.source === "upload"
                  ? "Used in Calsie only. Never sent to employers."
                  : "JPG, PNG or WEBP, up to 2 MB."}
              </small>
            )}

            {avatarError ? <small className="ws-acct-field-error" role="alert">{avatarError}</small> : null}
          </div>

          <div className="ws-acct-identity-copy">
            {editing ? (
              <div className="ws-acct-form">
                <h2 id="acct-identity-heading" className="ws-acct-form-title">Edit your details</h2>
                <label className="ws-acct-field">
                  <span>Full name</span>
                  <input
                    value={draft.fullName}
                    autoComplete="name"
                    placeholder="Your full name"
                    onChange={(event) => setDraft((current) => ({ ...current, fullName: event.target.value }))}
                  />
                </label>
                <label className="ws-acct-field">
                  <span>Contact number</span>
                  <input
                    value={draft.phone}
                    autoComplete="tel"
                    inputMode="tel"
                    placeholder="04XX XXX XXX"
                    onChange={(event) => setDraft((current) => ({ ...current, phone: event.target.value }))}
                  />
                </label>
                <label className="ws-acct-field">
                  <span>Location</span>
                  <input
                    value={draft.location}
                    autoComplete="address-level2"
                    placeholder="Sydney NSW"
                    onChange={(event) => setDraft((current) => ({ ...current, location: event.target.value }))}
                  />
                </label>
                <p className="ws-acct-field-hint">
                  Your email address is your sign-in and cannot be changed here.
                </p>
                <div className="ws-acct-form-actions">
                  <button type="button" className="ws-btn-primary" disabled={saving} onClick={() => void saveDetails()}>
                    {saving ? "Saving…" : "Save changes"}
                  </button>
                  <button
                    type="button"
                    className="ws-btn-outline"
                    disabled={saving}
                    onClick={() => {
                      setDraft({ fullName, phone, location });
                      setEditing(false);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <h2 id="acct-identity-heading" className="ws-acct-name">{displayName}</h2>
                <p className="ws-acct-email">{email}</p>
                <div className="ws-acct-chips">
                  <span className={`ws-acct-chip${emailConfirmed ? " is-verified" : ""}`}>
                    {emailConfirmed ? <CheckCircle2 size={13} strokeWidth={2.4} /> : <Mail size={13} strokeWidth={2.4} />}
                    {emailConfirmed ? "Email verified" : "Email not verified"}
                  </span>
                  <span className="ws-acct-chip">Member since {monthYear(memberSince)}</span>
                </div>

                <dl className="ws-acct-detail-grid">
                  <div>
                    <dt>Contact number</dt>
                    <dd>{phone || <span className="ws-acct-empty">Not added</span>}</dd>
                  </div>
                  <div>
                    <dt>Location</dt>
                    <dd>{location || <span className="ws-acct-empty">Not added</span>}</dd>
                  </div>
                  <div>
                    <dt>Target role</dt>
                    <dd>{profileResumeSignals.targetRole || <span className="ws-acct-empty">Not set</span>}</dd>
                  </div>
                </dl>

                <button type="button" className="ws-btn-outline" onClick={() => { setDraft({ fullName, phone, location }); setEditing(true); }}>
                  Edit details
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ---------- Profile strength ---------- */}
      <section className="ws-acct-card" aria-labelledby="acct-strength-heading">
        <div className="ws-acct-card-head">
          <div>
            <small>Setup</small>
            <h3 id="acct-strength-heading">Profile strength</h3>
          </div>
          <span className="ws-acct-strength-value">{strength.percent}%</span>
        </div>

        <div
          className="ws-acct-meter"
          role="progressbar"
          aria-valuenow={strength.percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Profile strength"
        >
          <span style={{ width: `${strength.percent}%` }} />
        </div>
        <p className="ws-acct-meter-label">
          {profileStrengthLabel(strength.percent)} — {strength.done} of {strength.total} complete.
          {strength.campaignReady
            ? " Everything needed to run a campaign is in place."
            : ` ${strength.missingRequired.length} required ${strength.missingRequired.length === 1 ? "item" : "items"} left before a campaign can start.`}
        </p>

        <ul className="ws-acct-checklist">
          {checklist.map((item) => (
            <li key={item.id} className={item.done ? "is-done" : ""}>
              <span className="ws-acct-check" aria-hidden="true">
                {item.done ? <CheckCircle2 size={16} strokeWidth={2.3} /> : <span className="ws-acct-check-dot" />}
              </span>
              <span className="ws-acct-check-copy">
                <strong>{item.label}</strong>
                {item.done ? null : <small>{item.hint}</small>}
              </span>
              {item.done ? (
                <span className="ws-acct-check-state">Done</span>
              ) : item.panel === "profile" ? (
                <button type="button" className="ws-acct-link-btn" onClick={() => { setDraft({ fullName, phone, location }); setEditing(true); }}>
                  {item.id === "photo" ? "Add photo" : "Edit"}
                </button>
              ) : (
                <button type="button" className="ws-acct-link-btn" onClick={() => onNavigate(item.panel)}>Open</button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* ---------- Campaign + template ---------- */}
      <div className="ws-acct-grid">
        <section className="ws-acct-card" aria-labelledby="acct-campaign-heading">
          <div className="ws-acct-card-head">
            <div>
              <small>Campaign</small>
              <h3 id="acct-campaign-heading">{campaign ? campaign.name : "No campaign yet"}</h3>
            </div>
            <span className={`ws-status-pill ${running ? "is-running" : campaign ? "is-paused" : "is-idle"}`}>
              <i />{running ? "Running" : campaign ? "Paused" : "Not set up"}
            </span>
          </div>

          {campaign ? (
            <>
              <dl className="ws-acct-detail-grid">
                <div>
                  <dt><Target size={13} strokeWidth={2.2} /> Target role</dt>
                  <dd>{campaignRole(campaign)}</dd>
                </div>
                <div>
                  <dt><MapPin size={13} strokeWidth={2.2} /> Location</dt>
                  <dd>{campaignLocation(campaign)}</dd>
                </div>
                <div>
                  <dt><BarChart3 size={13} strokeWidth={2.2} /> Reviewed</dt>
                  <dd>{approvedCount} smashed · {passedCount} passed</dd>
                </div>
              </dl>
              <div className="ws-acct-actions">
                <button type="button" className="ws-btn-primary" disabled={campaignBusy} onClick={onToggleCampaign}>
                  {campaignBusy ? (running ? "Pausing…" : "Starting…") : running ? "Pause campaign" : "Start campaign"}
                </button>
                <button type="button" className="ws-btn-outline" onClick={() => onNavigate("campaign")}>Campaign settings</button>
                <button type="button" className="ws-btn-outline" onClick={() => onNavigate("tracker")}>Open tracker</button>
              </div>
            </>
          ) : (
            <>
              <p className="ws-acct-body">Pick a campaign template to tell Calsie which roles and locations to search for you.</p>
              <div className="ws-acct-actions">
                <button type="button" className="ws-btn-primary" onClick={() => onNavigate("templates")}>Browse templates</button>
              </div>
            </>
          )}
        </section>

        <section className="ws-acct-card" aria-labelledby="acct-template-heading">
          <div className="ws-acct-card-head">
            <div>
              <small>Template</small>
              <h3 id="acct-template-heading">{activeTemplateName || "No template selected"}</h3>
            </div>
            <span className="ws-acct-card-icon" aria-hidden="true"><LayoutGrid size={17} strokeWidth={2} /></span>
          </div>

          {purchasedTemplate ? (
            <dl className="ws-acct-detail-grid">
              <div>
                <dt><Building2 size={13} strokeWidth={2.2} /> Category</dt>
                <dd>{purchasedTemplate.category}</dd>
              </div>
              <div>
                <dt><Target size={13} strokeWidth={2.2} /> Role</dt>
                <dd>{purchasedTemplate.role}</dd>
              </div>
              <div>
                <dt><MapPin size={13} strokeWidth={2.2} /> Location</dt>
                <dd>{purchasedTemplate.location}</dd>
              </div>
            </dl>
          ) : (
            <p className="ws-acct-body">
              {campaign
                ? "This campaign was set up without a saved template record."
                : "Templates bundle the search terms, filters and locations for a role type."}
            </p>
          )}

          <div className="ws-acct-actions">
            <button type="button" className="ws-btn-outline" onClick={() => onNavigate("templates")}>Browse templates</button>
          </div>
        </section>
      </div>

      {/* ---------- Documents + connections ---------- */}
      <div className="ws-acct-grid">
        <section className="ws-acct-card" aria-labelledby="acct-resume-heading">
          <div className="ws-acct-card-head">
            <div>
              <small>Documents</small>
              <h3 id="acct-resume-heading">Resume</h3>
            </div>
            <span className={`ws-acct-card-icon${resumeReady ? " is-ready" : ""}`} aria-hidden="true">
              <FileText size={17} strokeWidth={2} />
            </span>
          </div>
          <p className="ws-acct-body">
            {resumeReady
              ? resumeName || "Your resume is saved and ready to attach."
              : "No resume saved yet. Calsie needs one before it can apply on your behalf."}
          </p>
          <div className="ws-acct-actions">
            <button type="button" className="ws-btn-outline" onClick={() => onNavigate("resume")}>
              {resumeReady ? "Update resume" : "Upload resume"}
            </button>
            <button type="button" className="ws-btn-outline" onClick={() => onNavigate("buildResume")}>Build a resume</button>
          </div>
        </section>

        <section className="ws-acct-card" aria-labelledby="acct-connections-heading">
          <div className="ws-acct-card-head">
            <div>
              <small>Connected accounts</small>
              <h3 id="acct-connections-heading">Gmail</h3>
            </div>
            <span className={`ws-acct-card-icon${gmailReady ? " is-ready" : ""}`} aria-hidden="true">
              {gmailReady ? <CheckCircle2 size={17} strokeWidth={2} /> : <MailX size={17} strokeWidth={2} />}
            </span>
          </div>
          <p className="ws-acct-body">
            {gmailReady
              ? "Connected. Applications are sent from your own Gmail account, only after you approve them."
              : "Not connected. Calsie cannot send any application until you connect Gmail and give consent."}
          </p>
          <div className="ws-acct-actions">
            {gmailReady ? (
              <>
                <button type="button" className="ws-btn-outline" disabled={revokeLoading} onClick={onRevokeGmail}>
                  {revokeLoading ? "Revoking…" : "Revoke access"}
                </button>
                <button type="button" className="ws-btn-outline" onClick={() => onNavigate("gmail")}>Connection details</button>
              </>
            ) : (
              <>
                <button type="button" className="ws-btn-primary" disabled={connectLoading} onClick={() => onNavigate("gmail")}>
                  Connect Gmail
                </button>
                <button type="button" className="ws-btn-outline" onClick={onConnectGmail} disabled={connectLoading}>
                  {connectLoading ? "Connecting…" : "Quick connect"}
                </button>
              </>
            )}
          </div>
        </section>
      </div>

      {/* ---------- Preferences ---------- */}
      <section className="ws-acct-card" aria-labelledby="acct-preferences-heading">
        <div className="ws-acct-card-head">
          <div>
            <small>App preferences</small>
            <h3 id="acct-preferences-heading">Appearance</h3>
          </div>
        </div>
        <p className="ws-acct-body">
          Choose how Calsie looks. <strong>System</strong> follows your device setting. This is saved to your account and
          applies on any device where you have not picked one directly.
        </p>
        <div className="ws-acct-segment" role="radiogroup" aria-label="Appearance">
          {THEME_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={themePreference === option.value}
              className={themePreference === option.value ? "is-selected" : ""}
              onClick={() => void chooseTheme(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="ws-acct-divider" />

        <h4 className="ws-acct-subheading">Campaign safety settings</h4>
        <p className="ws-acct-body">
          These limits protect your sending reputation and are applied to every campaign. Change them in campaign settings.
        </p>
        <dl className="ws-acct-detail-grid">
          <div>
            <dt>Approval</dt>
            <dd>{String(plan.approval_mode || CAMPAIGN_PLAN.approval_mode)}</dd>
          </div>
          <div>
            <dt>Jobs found per day</dt>
            <dd>{planNumber("daily_job_limit", CAMPAIGN_PLAN.daily_job_limit)}</dd>
          </div>
          <div>
            <dt>Emails per hour</dt>
            <dd>{planNumber("hourly_email_limit", CAMPAIGN_PLAN.hourly_email_limit)}</dd>
          </div>
          <div>
            <dt>Campaign length</dt>
            <dd>{planNumber("campaign_days", CAMPAIGN_PLAN.campaign_days)} days</dd>
          </div>
          <div>
            <dt>Total application cap</dt>
            <dd>{planNumber("total_cap", CAMPAIGN_PLAN.total_cap)}</dd>
          </div>
        </dl>
        <div className="ws-acct-actions">
          <button type="button" className="ws-btn-outline" onClick={() => onNavigate("campaign")}>Campaign settings</button>
        </div>
      </section>

      {/* ---------- Support + legal ---------- */}
      <div className="ws-acct-grid">
        <section className="ws-acct-card" aria-labelledby="acct-support-heading">
          <div className="ws-acct-card-head">
            <div>
              <small>Support</small>
              <h3 id="acct-support-heading">Get help</h3>
            </div>
          </div>
          <ul className="ws-acct-links">
            <li>
              <Link href="/support">
                <span className="ws-acct-link-icon" aria-hidden="true"><HelpCircle size={16} strokeWidth={2} /></span>
                <span className="ws-acct-link-copy"><strong>Help centre</strong><small>Guides for resumes, campaigns and Gmail</small></span>
              </Link>
            </li>
            <li>
              <Link href="/contact">
                <span className="ws-acct-link-icon" aria-hidden="true"><MessageSquare size={16} strokeWidth={2} /></span>
                <span className="ws-acct-link-copy"><strong>Contact us</strong><small>Send the team a question</small></span>
              </Link>
            </li>
            <li>
              <a href={`mailto:${CALSIE_CONTACT_EMAIL}`}>
                <span className="ws-acct-link-icon" aria-hidden="true"><Mail size={16} strokeWidth={2} /></span>
                <span className="ws-acct-link-copy"><strong>Email support</strong><small>{CALSIE_CONTACT_EMAIL}</small></span>
              </a>
            </li>
          </ul>
        </section>

        <section className="ws-acct-card" aria-labelledby="acct-legal-heading">
          <div className="ws-acct-card-head">
            <div>
              <small>Legal</small>
              <h3 id="acct-legal-heading">Policies</h3>
            </div>
          </div>
          <ul className="ws-acct-links">
            <li>
              <Link href="/privacy" target="_blank" rel="noreferrer">
                <span className="ws-acct-link-icon" aria-hidden="true"><ShieldCheck size={16} strokeWidth={2} /></span>
                <span className="ws-acct-link-copy"><strong>Privacy Policy</strong><small>How your data is stored and used</small></span>
                <ExternalLink size={13} strokeWidth={2.2} aria-hidden="true" />
              </Link>
            </li>
            <li>
              <Link href="/terms" target="_blank" rel="noreferrer">
                <span className="ws-acct-link-icon" aria-hidden="true"><ScrollText size={16} strokeWidth={2} /></span>
                <span className="ws-acct-link-copy"><strong>Terms of Service</strong><small>The agreement covering your account</small></span>
                <ExternalLink size={13} strokeWidth={2.2} aria-hidden="true" />
              </Link>
            </li>
            <li>
              <button type="button" onClick={() => onNavigate("gmail")}>
                <span className="ws-acct-link-icon" aria-hidden="true"><Mail size={16} strokeWidth={2} /></span>
                <span className="ws-acct-link-copy"><strong>Gmail data use &amp; consent</strong><small>Policy version {GMAIL_PRIVACY_POLICY_VERSION}</small></span>
              </button>
            </li>
          </ul>
        </section>
      </div>

      {/* ---------- Session ---------- */}
      <section className="ws-acct-card ws-acct-session" aria-labelledby="acct-session-heading">
        <div>
          <h3 id="acct-session-heading">Sign out</h3>
          <p className="ws-acct-body">Ends this session on this device. Your campaign keeps running on schedule.</p>
        </div>
        <button type="button" className="ws-btn-outline ws-acct-signout" disabled={logoutLoading} onClick={onLogout}>
          <Power size={15} strokeWidth={2.2} />
          {logoutLoading ? "Signing out…" : "Sign out"}
        </button>
      </section>
    </div>
  );
}
