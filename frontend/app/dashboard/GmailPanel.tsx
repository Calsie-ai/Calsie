"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Lock, Mail, MailX, ShieldCheck } from "lucide-react";
import { isActionLoading, type ActionStateMap, type DashboardActionKey } from "../../lib/actionState";
import { CALSIE_CONTACT_EMAIL } from "../../lib/contact";
import {
  GMAIL_CONNECTION_CONSENT_TEXT,
  GMAIL_DEDICATED_EMAIL_CONFIRMATION_TEXT,
  GMAIL_PRIVACY_POLICY_VERSION,
  GMAIL_PRIVACY_SUMMARY,
  GMAIL_SEND_SCOPE,
} from "./gmail-consent";

type Props = {
  gmailReady: boolean;
  actionStates: ActionStateMap<DashboardActionKey>;
  onConnectGmail: () => void;
  onRevokeGmail: () => void;
};

// Purely presentational: breaks each (already-approved, legally reviewed)
// privacy paragraph into individual sentences so it can render as a
// scannable bullet list under a heading, instead of one dense block of
// text. The wording itself is untouched — only how it's laid out.
//
// The contact email's own "." characters (e.g. "...@calsie.com.") would
// otherwise be misread as sentence boundaries by the naive regex below,
// splitting the email itself into fragments — guard it out before
// splitting and restore it in whichever sentence contains it.
const EMAIL_DOT_GUARD = "@@DOT@@";
function splitSentences(text: string): string[] {
  const guarded = text.split(CALSIE_CONTACT_EMAIL).join(CALSIE_CONTACT_EMAIL.replaceAll(".", EMAIL_DOT_GUARD));
  return (guarded.match(/[^.!?]+[.!?]+(?:\s+|$)/g) || [guarded])
    .map((sentence) => sentence.trim().replaceAll(EMAIL_DOT_GUARD, "."))
    .filter(Boolean);
}

// Groups line up 1:1 with GMAIL_PRIVACY_SUMMARY's 5 entries — the last
// entry (compliance/version footer) renders separately, near the policy
// version line, rather than as a bulleted section.
const PRIVACY_SECTIONS = [
  { heading: "What happens when you connect" },
  { heading: "Privacy boundaries" },
  { heading: "Our trusted service providers" },
  { heading: "Your account & your rights" },
] as const;

export default function GmailPanel({ gmailReady, actionStates, onConnectGmail, onRevokeGmail }: Props) {
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [dedicatedEmailConfirmed, setDedicatedEmailConfirmed] = useState(false);

  const gmailConsentComplete = privacyAccepted && dedicatedEmailConfirmed;
  const connectLoading = isActionLoading(actionStates, "connectGmail");
  const revokeLoading = isActionLoading(actionStates, "revokeGmail");

  return (
    <div className="ws-panel">
      <div className="ws-gmail-hero">
        <header className="ws-panel-head ws-gmail-hero-main">
          <p className="ws-panel-eyebrow ws-panel-eyebrow-icon"><Mail size={13} strokeWidth={2.4} /> Connection</p>
          <h1 className="ws-panel-title">Gmail connection</h1>
          <p className="ws-panel-sub">Read the Calsie Privacy Policy and complete both consent confirmations before connecting Google.</p>
        </header>
        <div className="ws-gmail-hero-art" aria-hidden="true">
          <svg className="ws-gmail-hero-dashes" viewBox="0 0 200 110" fill="none">
            <path d="M0 55 C 36 24, 58 24, 80 48" stroke="var(--line-2)" strokeWidth="1.5" strokeDasharray="4 5" />
            <path d="M128 46 C 150 22, 168 22, 200 54" stroke="var(--line-2)" strokeWidth="1.5" strokeDasharray="4 5" />
          </svg>
          <span className="ws-gmail-hero-glow" />
          <span className="ws-gmail-hero-chip ws-gmail-hero-chip-left"><ShieldCheck size={14} strokeWidth={2.2} /></span>
          <span className="ws-gmail-hero-card">
            <img src="/images/Gmail_icon_(2020).svg.webp" alt="Gmail" className="ws-gmail-hero-img" />
          </span>
          <span className="ws-gmail-hero-badge"><CheckCircle2 size={14} strokeWidth={2.8} /></span>
          <span className="ws-gmail-hero-ring" />
        </div>
      </div>

      <div className="ws-gmail-card">
        <div className="ws-gmail-status">
          <div className="ws-gmail-status-copy">
            <span className={`ws-gmail-status-icon${gmailReady ? " is-connected" : ""}`}>
              {gmailReady ? <CheckCircle2 size={18} strokeWidth={2.2} /> : <MailX size={18} strokeWidth={2.2} />}
            </span>
            <div>
              <h3>{gmailReady ? "Gmail connected" : "Gmail disconnected"}</h3>
              <p>{gmailReady ? "Calsie can prepare approved sends through your connected account." : "Google cannot be connected until both confirmations below are selected."}</p>
            </div>
          </div>
          <span className={`ws-gmail-badge${gmailReady ? " is-connected" : " is-disconnected"}`}>
            {gmailReady ? "Connected" : "Not connected"}
          </span>
        </div>

        <div className="ws-gmail-disclosure" id="gmail-privacy-permission">
          <div className="ws-gmail-disclosure-heading">
            <div>
              <small>Privacy Policy</small>
              <h3>How Calsie handles your information</h3>
            </div>
            <Link href="/privacy" target="_blank" rel="noreferrer">Open full Privacy Policy</Link>
          </div>

          <div className="ws-gmail-policy-copy">
            {PRIVACY_SECTIONS.map(({ heading }, index) => (
              <div className="ws-gmail-policy-section" key={heading}>
                <strong className="ws-gmail-policy-section-heading">{heading}</strong>
                <ul>
                  {splitSentences(GMAIL_PRIVACY_SUMMARY[index]).map((sentence) => <li key={sentence}>{sentence}</li>)}
                </ul>
              </div>
            ))}
            <p className="ws-gmail-policy-footer">{GMAIL_PRIVACY_SUMMARY[GMAIL_PRIVACY_SUMMARY.length - 1]}</p>
          </div>

          <div className="ws-gmail-recommendation">
            <strong>Google permission requested</strong>
            <span><code>{GMAIL_SEND_SCOPE}</code> — used only to send job-application emails after user review and approval.</span>
          </div>

          <div className="ws-gmail-consent-block">
            <div className="ws-gmail-consent-heading">
              <strong>Consent</strong>
              <small>Both confirmations are required to enable Google connection.</small>
            </div>

            <label className={`ws-gmail-consent${gmailReady ? " is-disabled" : ""}`}>
              <input type="checkbox" checked={privacyAccepted || gmailReady} disabled={gmailReady || connectLoading} onChange={(event) => setPrivacyAccepted(event.target.checked)} />
              <span><strong>{GMAIL_CONNECTION_CONSENT_TEXT}</strong></span>
            </label>

            <label className={`ws-gmail-consent${gmailReady ? " is-disabled" : ""}`}>
              <input type="checkbox" checked={dedicatedEmailConfirmed || gmailReady} disabled={gmailReady || connectLoading} onChange={(event) => setDedicatedEmailConfirmed(event.target.checked)} />
              <span><strong>{GMAIL_DEDICATED_EMAIL_CONFIRMATION_TEXT}</strong></span>
            </label>
          </div>

          <p className="ws-gmail-policy-version">Privacy Policy version: {GMAIL_PRIVACY_POLICY_VERSION}</p>
        </div>

        {gmailReady ? (
          <div>
            <button type="button" className="ws-gmail-revoke" onClick={onRevokeGmail} disabled={revokeLoading}>
              {revokeLoading ? "Revoking…" : "Revoke connection"}
            </button>
            <small className="ws-gmail-revoke-note">This removes Calsie&apos;s saved Google tokens and prevents Gmail sending until you connect again.</small>
          </div>
        ) : (
          <div>
            <div className="ws-gmail-cta-row">
              <button type="button" className="ws-btn-primary ws-gmail-connect" onClick={onConnectGmail} disabled={connectLoading || !gmailConsentComplete} aria-describedby="gmail-privacy-permission">
                <Mail size={15} strokeWidth={2.4} /> {connectLoading ? "Connecting…" : "Connect Google"}
              </button>
              <div className="ws-gmail-security-note">
                <Lock size={15} strokeWidth={2.2} />
                <span>Secure — covered by our Privacy Policy.</span>
              </div>
            </div>
            {!gmailConsentComplete && <small className="ws-gmail-required">Select both consent checkboxes to enable Google connection.</small>}
          </div>
        )}
      </div>
    </div>
  );
}
