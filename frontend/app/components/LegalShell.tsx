import Link from "next/link";
import type { ReactNode } from "react";
import { CALSIE_CONTACT_EMAIL } from "../../lib/contact";
import "../legal-theme.css";

export type TocEntry = { id: string; label: string };

/* Shared chrome for the Terms and Privacy pages so both stay visually
   identical to the landing page and to each other. */
export default function LegalShell({
  eyebrow,
  title,
  lede,
  updated,
  active,
  toc,
  children,
}: {
  eyebrow: string;
  title: string;
  lede: string;
  updated: string;
  active: "terms" | "privacy" | "support";
  toc: TocEntry[];
  children: ReactNode;
}) {
  return (
    <div className="csl-legal">
      <header className="csl-nav">
        <div className="csl-nav-inner">
          <Link href="/" className="csl-brand" aria-label="Calsie Jobs home">
            <img src="/favicon.svg" alt="" />
            <span>Calsie</span> <span className="badge">Jobs</span>
          </Link>
          <nav className="csl-navlinks" aria-label="Legal pages">
            <Link href="/terms" className={`csl-navlink${active === "terms" ? " is-active" : ""}`} aria-current={active === "terms" ? "page" : undefined}>
              Terms
            </Link>
            <Link href="/privacy" className={`csl-navlink${active === "privacy" ? " is-active" : ""}`} aria-current={active === "privacy" ? "page" : undefined}>
              Privacy
            </Link>
            <Link href="/support" className={`csl-navlink${active === "support" ? " is-active" : ""}`} aria-current={active === "support" ? "page" : undefined}>
              Support
            </Link>
          </nav>
        </div>
      </header>

      <section className="csl-hero">
        <span className="csl-bloom b1" aria-hidden="true" />
        <span className="csl-bloom b2" aria-hidden="true" />
        <div className="csl-hero-inner">
          <span className="csl-eyebrow">{eyebrow}</span>
          <h1>{title}</h1>
          <p className="csl-lede">{lede}</p>
          <div className="csl-meta">
            <span className="csl-chip"><span className="dot" />Last updated {updated}</span>
            <span className="csl-chip">Australia · en-AU</span>
            <span className="csl-chip">{toc.length} sections</span>
          </div>
        </div>
      </section>

      <div className="csl-body">
        <nav className="csl-toc" aria-label="On this page">
          <p className="csl-toc-title">On this page</p>
          <ol>
            {toc.map((t) => (
              <li key={t.id}>
                <a href={`#${t.id}`}>{t.label}</a>
              </li>
            ))}
          </ol>
        </nav>
        <div className="csl-prose">{children}</div>
      </div>

      <footer className="csl-foot">
        <div className="csl-foot-inner">
          <span className="csl-copy">© 2026 Calsie Jobs. All rights reserved.</span>
          <div className="csl-foot-links">
            <Link href="/">Home</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
            <a href={`mailto:${CALSIE_CONTACT_EMAIL}`}>{CALSIE_CONTACT_EMAIL}</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* Numbered content block used by both legal pages. */
export function LegalSection({ id, n, title, children }: { id: string; n: number; title: string; children: ReactNode }) {
  return (
    <section className="csl-section" id={id}>
      <div className="csl-section-head">
        <span className="csl-num">{String(n).padStart(2, "0")}</span>
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  );
}

/* Numbered pre-flight check used on the Support page. */
export function CheckStep({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="csl-step">
      <span className="csl-step-n">{n}</span>
      <span>
        <b>{title}</b>
        <span className="csl-step-body">{children}</span>
      </span>
    </li>
  );
}

export function YesNoItem({ kind, children }: { kind: "yes" | "no"; children: ReactNode }) {
  return (
    <div className="csl-item">
      <span className={`csl-mark ${kind}`}>
        {kind === "yes" ? (
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12.5 9 17.5 20 6" /></svg>
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        )}
      </span>
      <span>{children}</span>
    </div>
  );
}
