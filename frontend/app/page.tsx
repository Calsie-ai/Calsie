"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabaseClient } from "../lib/supabaseClient";
import { CALSIE_CONTACT_EMAIL } from "../lib/contact";
import "./landing-macos.css";

/* Hero background grid. Coordinates are in the SVG viewBox (1200x800), which
   stretches to the hero via preserveAspectRatio="none", so a straight linear
   map from pointer position works at any aspect ratio. */
const HERO_VB_W = 1200;
const HERO_VB_H = 800;
const range = (from: number, to: number, step: number) => {
  const out: number[] = [];
  for (let n = from; n <= to; n += step) out.push(n);
  return out;
};
const GRID_FAR = { v: range(60, 1140, 90), h: range(50, 750, 90) };
const GRID_NEAR = { v: range(150, 1050, 225), h: range(140, 660, 175) };

const TICKER_ITEMS: { dot?: boolean; text: string }[] = [
  { dot: true, text: "120 Australian roles found today" },
  { text: "NDIS · aged care · community services" },
  { text: "100 applications prepared" },
  { text: "90 queued for approval" },
  { text: "1 approved send / hour" },
  { text: "24 prepared / day" },
  { text: "720 max over 30 days" },
];

type TrackerRow = {
  co: string;
  role: string;
  loc: string;
  status: "prepared" | "queued" | "found" | "declined";
  action: string;
  variant: "primary" | "plain" | "ghost";
};

const TRACKER_ROWS: TrackerRow[] = [
  { co: "Harbour Community Care", role: "Disability Support Worker", loc: "Sydney, NSW", status: "prepared", action: "Approve", variant: "primary" },
  { co: "Northside Health Services", role: "Community Support Worker", loc: "Melbourne, VIC", status: "queued", action: "Queued", variant: "ghost" },
  { co: "BrightPath Australia", role: "Caseworker", loc: "Brisbane, QLD", status: "prepared", action: "Approve", variant: "primary" },
  { co: "Civic Support Network", role: "Family Support Worker", loc: "Parramatta, NSW", status: "found", action: "Review", variant: "plain" },
  { co: "CareBridge Group", role: "Youth Support Worker", loc: "Perth, WA", status: "declined", action: "Declined", variant: "ghost" },
  { co: "Willow Tree Care Services", role: "Disability Support Worker", loc: "Adelaide, SA", status: "prepared", action: "Approve", variant: "primary" },
  { co: "Southern Cross Community", role: "Aged Care Support Worker", loc: "Newcastle, NSW", status: "queued", action: "Queued", variant: "ghost" },
  { co: "Yarra Bay Support Services", role: "Community Support Worker", loc: "Geelong, VIC", status: "prepared", action: "Approve", variant: "primary" },
  { co: "Anchor Point Care", role: "In-Home Support Worker", loc: "Gold Coast, QLD", status: "found", action: "Review", variant: "plain" },
  { co: "Kindred Community Services", role: "Mental Health Support Worker", loc: "Canberra, ACT", status: "queued", action: "Queued", variant: "ghost" },
  { co: "Firstlight Disability Services", role: "Support Coordinator", loc: "Hobart, TAS", status: "prepared", action: "Approve", variant: "primary" },
  { co: "Beacon Family Services", role: "Family Support Worker", loc: "Blacktown, NSW", status: "found", action: "Review", variant: "plain" },
  { co: "Harmony Health Network", role: "Community Support Worker", loc: "Wollongong, NSW", status: "declined", action: "Declined", variant: "ghost" },
  { co: "TrueNorth Care Collective", role: "Youth Support Worker", loc: "Darwin, NT", status: "queued", action: "Queued", variant: "ghost" },
  { co: "Parramatta Community Hub", role: "Disability Support Worker", loc: "Parramatta, NSW", status: "prepared", action: "Approve", variant: "primary" },
  { co: "Riverside Support Alliance", role: "Caseworker", loc: "Ipswich, QLD", status: "found", action: "Review", variant: "plain" },
];

const BOARD_COLUMNS = [
  {
    key: "found",
    label: "Found",
    dot: "found",
    cards: [
      { co: "Civic Support Network", role: "Family Support Worker" },
      { co: "Anchor Point Care", role: "In-Home Support Worker" },
      { co: "Beacon Family Services", role: "Family Support Worker" },
      { co: "Riverside Support Alliance", role: "Caseworker" },
    ],
    action: "Review",
    actionPrimary: false,
  },
  {
    key: "prepared",
    label: "Prepared",
    dot: "prepared",
    cards: [
      { co: "Harbour Community Care", role: "Disability Support Worker" },
      { co: "BrightPath Australia", role: "Caseworker" },
      { co: "Willow Tree Care Services", role: "Disability Support Worker" },
      { co: "Yarra Bay Support Services", role: "Community Support Worker" },
      { co: "Firstlight Disability Services", role: "Support Coordinator" },
      { co: "Parramatta Community Hub", role: "Disability Support Worker" },
    ],
    action: "Approve",
    actionPrimary: true,
  },
  {
    key: "queued",
    label: "Queued",
    dot: "queued",
    cards: [
      { co: "Northside Health Services", role: "Community Support Worker", wait: "Sends in 42 min" },
      { co: "Southern Cross Community", role: "Aged Care Support Worker", wait: "Sends in 1h 42m" },
      { co: "Kindred Community Services", role: "Mental Health Support Worker", wait: "Sends in 2h 42m" },
      { co: "TrueNorth Care Collective", role: "Youth Support Worker", wait: "Sends in 3h 42m" },
    ],
  },
  {
    key: "declined",
    label: "Declined",
    dot: "declined",
    declined: true,
    cards: [
      { co: "CareBridge Group", role: "Youth Support Worker", wait: "Didn't match preferences" },
      { co: "Harmony Health Network", role: "Community Support Worker", wait: "Didn't match preferences" },
    ],
  },
] as const;

const ACTIVITY_ROWS: { time: string; dot: string; before: string; bold?: string; after?: string }[] = [
  { time: "08:58", dot: "found", before: "Search ran — ", bold: "16", after: " roles matched your preferences" },
  { time: "09:02", dot: "found", before: "Found ", bold: "Civic Support Network", after: " — Family Support Worker" },
  { time: "09:11", dot: "prepared", before: "Prepared application for ", bold: "Harbour Community Care" },
  { time: "09:24", dot: "prepared", before: "Prepared application for ", bold: "BrightPath Australia" },
  { time: "09:40", dot: "declined", before: "You declined ", bold: "CareBridge Group", after: " — didn't match preferences" },
  { time: "10:02", dot: "sent", before: "Approved send — ", bold: "1", after: " application sent this hour" },
  { time: "10:15", dot: "found", before: "Found ", bold: "Anchor Point Care", after: " — In-Home Support Worker" },
  { time: "10:33", dot: "prepared", before: "Prepared application for ", bold: "Willow Tree Care Services" },
  { time: "10:47", dot: "queued", before: "Queued ", bold: "Northside Health Services", after: " — waiting on your approval" },
  { time: "11:02", dot: "sent", before: "Approved send — ", bold: "1", after: " application sent this hour" },
  { time: "11:20", dot: "prepared", before: "Prepared application for ", bold: "Yarra Bay Support Services" },
  { time: "11:38", dot: "found", before: "Found ", bold: "Beacon Family Services", after: " — Family Support Worker" },
  { time: "11:55", dot: "declined", before: "You declined ", bold: "Harmony Health Network", after: " — didn't match preferences" },
  { time: "12:02", dot: "sent", before: "Approved send — ", bold: "1", after: " application sent this hour" },
  { time: "12:19", dot: "prepared", before: "Prepared application for ", bold: "Firstlight Disability Services" },
  { time: "12:41", dot: "queued", before: "Queued ", bold: "Southern Cross Community", after: " — waiting on your approval" },
];

type PrepareMatch = {
  role: string;
  company: string;
  logo?: string;
  pay: string;
  loc: string;
  type: string;
  summary: string;
  whyFit: string;
  quals: { ok: boolean; text: string }[];
  score: number;
  scoreLabel: string;
};

const SHOWCASE_MATCHES: PrepareMatch[] = [
  {
    role: "Early Childhood Educator",
    company: "Goodstart Early Learning",
    logo: "/images/Layer_1_3.webp",
    pay: "$31–$35/hr",
    loc: "Brisbane, QLD",
    type: "Full-time",
    summary:
      "Plan and deliver EYLF-aligned play-based learning for a mixed-age room, working alongside a small educator team.",
    whyFit:
      "Your Diploma in Early Childhood Education and EYLF experience line up closely with Goodstart's curriculum approach.",
    quals: [
      { ok: true, text: "Working with Children Check current" },
      { ok: true, text: "Diploma in ECEC" },
      { ok: true, text: "First Aid incl. Anaphylaxis" },
    ],
    score: 94,
    scoreLabel: "Excellent fit",
  },
  {
    role: "Care Coordinator",
    company: "Medibank Private",
    logo: "/images/Medibank-Private-Logo-Vector.svg-.png",
    pay: "$36–$41/hr",
    loc: "Melbourne, VIC",
    type: "Full-time",
    summary:
      "Support members accessing home and community care, coordinating with providers and tracking care plans.",
    whyFit:
      "Your care coordination background and experience liaising with allied health providers suit this member-support role.",
    quals: [
      { ok: true, text: "Certificate IV in Community Services" },
      { ok: true, text: "Care coordination experience" },
      { ok: false, text: "Current driver's licence" },
    ],
    score: 85,
    scoreLabel: "Good fit",
  },
  {
    role: "Patient Care Assistant",
    company: "Ramsay Health Care",
    logo: "/images/Ramsay_Health_Care_logo.svg",
    pay: "$34–$39/hr",
    loc: "Sydney, NSW",
    type: "Casual",
    summary:
      "Assist nursing staff with patient care, mobility and daily living support across surgical and rehabilitation wards.",
    whyFit:
      "Your hands-on patient care experience and manual handling certification suit this hospital-based support role.",
    quals: [
      { ok: true, text: "First Aid & CPR current" },
      { ok: true, text: "Manual handling certified" },
      { ok: true, text: "Aged or disability care experience" },
    ],
    score: 91,
    scoreLabel: "Great fit",
  },
  {
    role: "Aged Care Support Worker",
    company: "Regis Aged Care",
    logo: "/images/REG.AX_BIG-f46e4ff5.png",
    pay: "$32–$37/hr",
    loc: "Adelaide, SA",
    type: "Part-time",
    summary:
      "Support residents with personal care, mobility and daily activities in a residential aged care home.",
    whyFit:
      "Your dementia care training and personal care experience align well with this residential care role.",
    quals: [
      { ok: true, text: "First Aid & CPR current" },
      { ok: true, text: "Dementia care certificate" },
      { ok: false, text: "NDIS Worker Screening Check" },
    ],
    score: 88,
    scoreLabel: "Good fit",
  },
];

/* Auto-swipe deck: cycles a job-match card like a Tinder deck so the section
   feels alive without requiring user interaction. Paused on hover/focus, and
   skipped entirely for reduced-motion users. Self-contained so multiple
   instances (showcase, prepare) can rotate independently. */
function MatchCardCarousel({ matches }: { matches: PrepareMatch[] }) {
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const pausedRef = useRef(false);

  useEffect(() => {
    if (matches.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let leaveTimer: ReturnType<typeof setTimeout> | undefined;
    const interval = setInterval(() => {
      if (pausedRef.current) return;
      setLeaving(true);
      leaveTimer = setTimeout(() => {
        setIndex((i) => (i + 1) % matches.length);
        setLeaving(false);
      }, 380);
    }, 4200);
    return () => {
      clearInterval(interval);
      if (leaveTimer) clearTimeout(leaveTimer);
    };
  }, [matches.length]);

  const match = matches[index];
  const scoreClass = match.score >= 90 ? " great" : match.score >= 75 ? " good" : "";

  return (
    <>
      <div
        className="match-stage"
        onMouseEnter={() => { pausedRef.current = true; }}
        onMouseLeave={() => { pausedRef.current = false; }}
        onFocus={() => { pausedRef.current = true; }}
        onBlur={() => { pausedRef.current = false; }}
      >
        <div className="match-stack-deck" aria-hidden="true">
          <span className="deck-card d2" />
          <span className="deck-card d1" />
        </div>
        <div className={`match-card${leaving ? " match-card--leaving" : ""}`} key={match.role}>
          <div className="match-card-grid">
            <div className="match-card-left">
              <div className="match-card-head">
                {match.logo ? (
                  <img className="match-logo-img" src={match.logo} alt={`${match.company} logo`} />
                ) : null}
                <div className="match-card-head-text">
                  <h3>{match.role}</h3>
                  <div className="match-co">{match.company}</div>
                </div>
              </div>
              <div className="match-pills">
                <span className="match-pill pay">{match.pay}</span>
                <span className="match-pill loc">{match.loc}</span>
                <span className="match-pill type">{match.type}</span>
              </div>
              <div className="match-summary-box">
                <span className="match-summary-label">Summary</span>
                <p>{match.summary}</p>
              </div>
              <a
                className="btn btn-accent match-apply"
                href="/login"
                aria-label={`Apply now for ${match.role} at ${match.company}`}
              >
                Apply now <span aria-hidden="true">→</span>
              </a>
            </div>
            <div className="match-card-right">
              <div className="match-fit-head">Why this is a good fit</div>
              <p className="match-fit-text">{match.whyFit}</p>
              <div className="match-quals-head">Qualifications</div>
              <div className="match-quals">
                {match.quals.map((qual) => (
                  <div className={`match-qual ${qual.ok ? "ok" : "no"}`} key={qual.text}>
                    <span className="q" aria-hidden="true" />
                    {qual.text}
                  </div>
                ))}
              </div>
              <div className={`match-score-pill${scoreClass}`}>
                <b>{match.score}/100</b>
                {match.scoreLabel}
              </div>
            </div>
          </div>
        </div>
      </div>
      {matches.length > 1 ? (
        <div className="match-dots" role="tablist" aria-label="Job matches">
          {matches.map((m, i) => (
            <span key={m.role} className={`match-dot${i === index ? " active" : ""}`} />
          ))}
        </div>
      ) : null}
    </>
  );
}

const FEATURE_ITEMS: {
  icon: "orange" | "ink";
  title: string;
  body: string;
  detail: string;
  path: React.ReactNode;
  switchInstead?: boolean;
}[] = [
  {
    icon: "orange",
    title: "Finds roles that fit your shifts",
    body: "Matched to the work you actually do — NDIS, aged care, youth or family support — plus the suburb, the hours and the award you're on, not just keywords in a title.",
    detail:
      'Example: if a listing needs "experience with high support needs," that line moves near the top of your resume for that one application — instead of staying buried on page two.',
    path: (
      <>
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="3.2" />
        <line x1="12" y1="1.5" x2="12" y2="4.5" />
        <line x1="12" y1="19.5" x2="12" y2="22.5" />
      </>
    ),
  },
  {
    icon: "orange",
    title: "A resume that speaks to each employer",
    body: "Same experience, reworded around what this provider's ad is actually asking for — no rebuilding your resume from scratch for every application.",
    detail:
      "You keep one base resume — Calsie Jobs adjusts the emphasis per role, including your checks and clearances (WWCC, NDIS Worker Screening, First Aid). Nothing is invented that isn't already on your profile.",
    path: (
      <>
        <path d="M6 3h9l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
        <line x1="8.5" y1="10" x2="15.5" y2="10" />
        <line x1="8.5" y1="13.5" x2="15.5" y2="13.5" />
        <line x1="8.5" y1="17" x2="12.5" y2="17" />
      </>
    ),
  },
  {
    icon: "orange",
    title: "A short, honest cover email",
    body: "Written the way you'd actually write it — brief and specific to the role, not a form-letter paragraph that sounds like everyone else's application.",
    detail:
      "\"I've got three years in community access work and I'm looking for something closer to home — happy to chat about start dates.\" That's the tone — plain, not padded.",
    path: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="1.5" />
        <path d="M3.5 6 12 13 20.5 6" />
      </>
    ),
  },
  {
    icon: "ink",
    title: "Nothing goes out without you",
    body: "Every application sits in your queue until you tap approve. Calsie Jobs drafts it — you're still the one who decides it's ready to send.",
    detail: "You can edit any line before approving, or decline the role outright. Either way, nothing sends itself.",
    path: <path d="M4 12.5 9 17.5 20 6" />,
  },
  {
    icon: "ink",
    title: "One place to see where you stand",
    body: "Found, prepared, sent, and what came back — all in one queue instead of screenshots and browser tabs you'll lose track of.",
    detail: "Tap any entry to see exactly when it was found, prepared, and — if you approved it — sent.",
    path: (
      <>
        <rect x="3.5" y="4" width="17" height="5" rx="1" />
        <rect x="3.5" y="10.5" width="17" height="5" rx="1" />
        <rect x="3.5" y="17" width="10" height="4" rx="1" />
      </>
    ),
  },
  {
    icon: "ink",
    title: "A pace that won't get you blocked",
    body: "One approved send an hour, twenty-four prepared a day — a limit built into the system, not a promise, so you don't trip spam filters or flood the same employer twice.",
    detail: "That's roughly what one careful person applying by hand could keep up with — not a mass-blast.",
    path: (
      <>
        <line x1="4" y1="6" x2="20" y2="6" />
        <circle cx="9" cy="6" r="2" />
        <line x1="4" y1="12" x2="20" y2="12" />
        <circle cx="15" cy="12" r="2" />
        <line x1="4" y1="18" x2="20" y2="18" />
        <circle cx="11" cy="18" r="2" />
      </>
    ),
    switchInstead: true,
  },
];

const PRICING_FLOW = [
  { step: "Step 01", title: "Create your account", body: "Login and account creation are free, with no card required to get in and have a look around." },
  { step: "Step 02", title: "Browse templates", body: "Review roles, campaign settings, and included features for each template before paying anything." },
  { step: "Step 03", title: "Choose a template", body: "The exact price appears only for the campaign you select — in AUD, GST included, at checkout." },
];

const FOOTER_GROUPS: { title: string; links: [string, string][] }[] = [
  {
    title: "Product",
    links: [
      ["Features", "#features"],
      ["How it works", "#how"],
      ["Prepare a resume", "#prepare"],
      ["Pricing", "#pricing"],
      ["Application tracking", "#tracker"],
    ],
  },
  {
    title: "Company",
    links: [
      ["About", "#about"],
      ["Contact", "/contact"],
      ["Support", "/support"],
    ],
  },
  {
    title: "Resources",
    links: [
      ["Dashboard", "/dashboard"],
      ["Resume tools", "/resume-canvas"],
      ["Help centre", "/support"],
    ],
  },
  {
    title: "Legal",
    links: [
      ["Privacy Policy", "/privacy"],
      ["Terms of Service", "/terms"],
      ["Contact", "/contact"],
    ],
  },
];

export default function HomePage() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const oauthTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState("");

  /* The OAuth handoff navigates the tab away, so the success path never runs
     its own cleanup. If the user cancels at Google, hits Back, or the redirect
     never fires, the button would otherwise sit on "Opening…" forever — these
     three signals cover every way of arriving back on this page. */
  useEffect(() => {
    const clearPending = () => {
      setLoading(false);
      if (oauthTimer.current) {
        clearTimeout(oauthTimer.current);
        oauthTimer.current = null;
      }
    };
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) clearPending(); // restored from bfcache (Back button)
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") clearPending();
    };
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibility);
      if (oauthTimer.current) clearTimeout(oauthTimer.current);
    };
  }, []);

  async function loginWithGoogle() {
    if (loading) return;
    setStatus("");
    setLoading(true);

    // Last-resort unstick: if no navigation has happened by now, something
    // blocked the handoff (popup blocker, provider misconfigured, offline).
    if (oauthTimer.current) clearTimeout(oauthTimer.current);
    oauthTimer.current = setTimeout(() => {
      setLoading(false);
      setStatus("Could not open Google sign-in. Try again, or use the login page.");
    }, 12000);

    try {
      const supabase = getSupabaseClient();
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent("/dashboard?panel=overview")}`;
      const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
      if (error) throw error;
    } catch (error) {
      if (oauthTimer.current) {
        clearTimeout(oauthTimer.current);
        oauthTimer.current = null;
      }
      setStatus(error instanceof Error ? error.message : "Could not continue with Google.");
      setLoading(false);
    }
  }

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const cleanups: Array<() => void> = [];

    /* ---- Hero geometry field ----
       Each line is a quadratic curve whose control point is pulled toward the
       pointer with a gaussian falloff, so the grid bends locally like a lens
       instead of shearing as one rigid sheet. Motion is eased toward the
       target every frame, and a slow sine drift keeps it alive when the
       pointer is idle or absent (touch devices). */
    const heroEl = root.querySelector<HTMLElement>(".hero");
    const gridSvg = root.querySelector<SVGSVGElement>(".hero-grid");
    if (heroEl && gridSvg) {
      const farG = gridSvg.querySelector<SVGGElement>(".grid-far");
      const nearG = gridSvg.querySelector<SVGGElement>(".grid-near");
      const paths = Array.from(gridSvg.querySelectorAll<SVGPathElement>("path")).map((el) => ({
        el,
        axis: el.dataset.axis as "v" | "h",
        pos: Number(el.dataset.pos),
        near: el.parentElement?.classList.contains("grid-near") ?? false,
      }));

      const SIGMA = 300; // falloff width of the bend, in viewBox units
      const curveFor = (p: (typeof paths)[number], px: number, py: number) => {
        const amp = p.near ? 0.42 : 0.26;
        if (p.axis === "v") {
          const d = px - p.pos;
          const infl = Math.exp(-(d * d) / (2 * SIGMA * SIGMA));
          const cx = p.pos + d * amp * infl;
          return `M${p.pos} 0Q${cx.toFixed(1)} ${py.toFixed(1)} ${p.pos} ${HERO_VB_H}`;
        }
        const d = py - p.pos;
        const infl = Math.exp(-(d * d) / (2 * SIGMA * SIGMA));
        const cy = p.pos + d * amp * infl;
        return `M0 ${p.pos}Q${px.toFixed(1)} ${cy.toFixed(1)} ${HERO_VB_W} ${p.pos}`;
      };

      const draw = (px: number, py: number) => {
        paths.forEach((p) => p.el.setAttribute("d", curveFor(p, px, py)));
      };

      if (reduceMotion) {
        // Static, perfectly straight grid — still adds depth, zero motion.
        draw(HERO_VB_W / 2, HERO_VB_H / 2);
      } else {
        let targetX = HERO_VB_W / 2;
        let targetY = HERO_VB_H / 2;
        let curX = targetX;
        let curY = targetY;
        let pointerInside = false;
        let raf = 0;
        const start = performance.now();

        const onMove = (e: PointerEvent) => {
          const r = heroEl.getBoundingClientRect();
          if (!r.width || !r.height) return;
          pointerInside = true;
          targetX = ((e.clientX - r.left) / r.width) * HERO_VB_W;
          targetY = ((e.clientY - r.top) / r.height) * HERO_VB_H;
        };
        const onLeave = () => {
          pointerInside = false;
        };

        const frame = (now: number) => {
          const t = (now - start) * 0.00042;
          // Idle orbit keeps the field breathing; it also biases the pointer
          // target slightly so motion never feels perfectly locked.
          const driftX = Math.sin(t) * 105;
          const driftY = Math.cos(t * 0.78) * 78;
          const baseX = pointerInside ? targetX : HERO_VB_W / 2;
          const baseY = pointerInside ? targetY : HERO_VB_H / 2;
          const gx = baseX + driftX;
          const gy = baseY + driftY;

          curX += (gx - curX) * 0.055;
          curY += (gy - curY) * 0.055;
          draw(curX, curY);

          // Parallax: layers shift at different rates for depth.
          const nx = curX / HERO_VB_W - 0.5;
          const ny = curY / HERO_VB_H - 0.5;
          if (farG) farG.style.transform = `translate3d(${(-nx * 10).toFixed(2)}px, ${(-ny * 7).toFixed(2)}px, 0)`;
          if (nearG) nearG.style.transform = `translate3d(${(nx * 20).toFixed(2)}px, ${(ny * 14).toFixed(2)}px, 0)`;

          raf = requestAnimationFrame(frame);
        };
        raf = requestAnimationFrame(frame);

        window.addEventListener("pointermove", onMove, { passive: true });
        heroEl.addEventListener("pointerleave", onLeave);
        cleanups.push(() => {
          cancelAnimationFrame(raf);
          window.removeEventListener("pointermove", onMove);
          heroEl.removeEventListener("pointerleave", onLeave);
        });
      }
    }

    const navEl = root.querySelector<HTMLElement>(".nav");
    if (navEl) {
      const revealZone = 16; // always visible right at the very top
      const dragThreshold = 4; // near-instant response, just enough to ignore jitter
      let lastY = window.scrollY;
      let ticking = false;
      let holdOpen = false; // keeps the bar down during in-page anchor scrolling
      let holdTimer: ReturnType<typeof setTimeout> | undefined;

      const showNav = () => navEl.classList.remove("nav-hidden");
      const hideNav = () => navEl.classList.add("nav-hidden");

      const onScroll = () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
          const y = Math.max(0, window.scrollY);
          navEl.classList.toggle("nav-scrolled", y > 4);
          if (holdOpen || y <= revealZone) {
            showNav();
          } else if (y > lastY + dragThreshold) {
            hideNav(); // scrolling down → get out of the way
          } else if (y < lastY - dragThreshold) {
            showNav(); // scrolling up → come back immediately
          }
          lastY = y;
          ticking = false;
        });
      };
      window.addEventListener("scroll", onScroll, { passive: true });
      cleanups.push(() => window.removeEventListener("scroll", onScroll));

      // Clicking an in-page link smooth-scrolls downward; the bar shouldn't
      // flee mid-flight, so pin it open until the animation settles.
      const anchors = root.querySelectorAll<HTMLAnchorElement>('a[href^="#"]');
      const onAnchorClick = () => {
        holdOpen = true;
        showNav();
        clearTimeout(holdTimer);
        holdTimer = setTimeout(() => {
          holdOpen = false;
          lastY = window.scrollY;
        }, 900);
      };
      anchors.forEach((a) => a.addEventListener("click", onAnchorClick));

      // Keyboard users tabbing into the bar must never be scrolled away from it.
      navEl.addEventListener("focusin", showNav);

      cleanups.push(() => {
        clearTimeout(holdTimer);
        anchors.forEach((a) => a.removeEventListener("click", onAnchorClick));
        navEl.removeEventListener("focusin", showNav);
      });
    }

    const counters = root.querySelectorAll<HTMLElement>(".count");
    function animateCount(el: HTMLElement) {
      const target = parseInt(el.getAttribute("data-target") || "0", 10);
      if (reduceMotion) {
        el.textContent = String(target);
        return;
      }
      const duration = 900;
      let startTime: number | null = null;
      function step(ts: number) {
        if (startTime === null) startTime = ts;
        const progress = Math.min((ts - startTime) / duration, 1);
        el.textContent = String(Math.floor(progress * target));
        if (progress < 1) requestAnimationFrame(step);
        else el.textContent = String(target);
      }
      requestAnimationFrame(step);
    }
    const countObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            animateCount(entry.target as HTMLElement);
            countObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.5 }
    );
    counters.forEach((c) => countObserver.observe(c));
    cleanups.push(() => countObserver.disconnect());

    const reveals = root.querySelectorAll<HTMLElement>(".reveal");
    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry, i) => {
          if (entry.isIntersecting) {
            const target = entry.target as HTMLElement;
            const delay = target.dataset.delay ? Number(target.dataset.delay) : i * 40;
            setTimeout(() => target.classList.add("in"), delay);
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );
    reveals.forEach((r) => revealObserver.observe(r));
    cleanups.push(() => revealObserver.disconnect());

    const macWindow = root.querySelector<HTMLElement>("#mac-window");
    if (macWindow) {
      const segButtons = macWindow.querySelectorAll<HTMLButtonElement>(".mac-segmented .seg");
      const panels = macWindow.querySelectorAll<HTMLElement>(".mac-panel");
      const segHandlers: Array<() => void> = [];
      segButtons.forEach((btn) => {
        const handler = () => {
          const target = btn.getAttribute("data-panel");
          segButtons.forEach((b) => {
            b.classList.remove("active");
            b.setAttribute("aria-selected", "false");
          });
          btn.classList.add("active");
          btn.setAttribute("aria-selected", "true");
          panels.forEach((p) => {
            p.hidden = p.getAttribute("data-panel") !== target;
          });
        };
        btn.addEventListener("click", handler);
        segHandlers.push(() => btn.removeEventListener("click", handler));
      });

      const sideItems = macWindow.querySelectorAll<HTMLAnchorElement>(".mac-sidebar-item");
      const listRows = macWindow.querySelectorAll<HTMLElement>("#mac-list .mac-list-row");
      sideItems.forEach((item) => {
        const handler = (e: Event) => {
          e.preventDefault();
          const filter = item.getAttribute("data-filter");
          sideItems.forEach((i) => i.classList.remove("active"));
          item.classList.add("active");
          listRows.forEach((row) => {
            const show = filter === "all" || row.getAttribute("data-status") === filter;
            row.classList.toggle("is-hidden", !show);
          });
          const listSeg = macWindow.querySelector<HTMLButtonElement>('.mac-segmented .seg[data-panel="list"]');
          listSeg?.click();
        };
        item.addEventListener("click", handler);
        segHandlers.push(() => item.removeEventListener("click", handler));
      });
      cleanups.push(() => segHandlers.forEach((fn) => fn()));
    }

    const macRows = root.querySelectorAll<HTMLElement>(".mac-settings .mac-row");
    const macRowHandlers: Array<() => void> = [];
    macRows.forEach((row) => {
      const toggleRow = () => {
        const item = row.closest(".mac-item");
        const isOpen = item?.classList.toggle("open");
        row.setAttribute("aria-expanded", isOpen ? "true" : "false");
      };
      const keyHandler = (e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggleRow();
        }
      };
      row.addEventListener("click", toggleRow);
      row.addEventListener("keydown", keyHandler);
      macRowHandlers.push(() => {
        row.removeEventListener("click", toggleRow);
        row.removeEventListener("keydown", keyHandler);
      });
    });
    cleanups.push(() => macRowHandlers.forEach((fn) => fn()));

    const stepMoreButtons = root.querySelectorAll<HTMLButtonElement>(".step-more");
    const stepHandlers: Array<() => void> = [];
    stepMoreButtons.forEach((btn) => {
      const handler = (e: Event) => {
        e.stopPropagation();
        const step = btn.closest(".step");
        const isOpen = step?.classList.toggle("open");
        btn.setAttribute("aria-expanded", isOpen ? "true" : "false");
      };
      btn.addEventListener("click", handler);
      stepHandlers.push(() => btn.removeEventListener("click", handler));
    });
    cleanups.push(() => stepHandlers.forEach((fn) => fn()));

    const timelineEl = root.querySelector(".timeline");
    const timelineFill = root.querySelector<HTMLElement>("#timeline-fill");
    if (timelineEl && timelineFill) {
      const timelineObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              timelineFill.classList.add("in");
              timelineObserver.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.4 }
      );
      timelineObserver.observe(timelineEl);
      cleanups.push(() => timelineObserver.disconnect());
    }

    const slider = root.querySelector<HTMLInputElement>("#pace-slider");
    if (slider) {
      const dayLabel = root.querySelector<HTMLElement>("#scrub-day")!;
      const calsieDot = root.querySelector<SVGCircleElement>("#calsie-dot")!;
      const typicalDot = root.querySelector<SVGCircleElement>("#typical-dot")!;
      const dayGuide = root.querySelector<SVGLineElement>("#day-guide")!;
      const statCalsie = root.querySelector<HTMLElement>("#stat-calsie")!;
      const statTypical = root.querySelector<HTMLElement>("#stat-typical")!;
      const statDiff = root.querySelector<HTMLElement>("#stat-diff")!;
      const unitDiff = root.querySelector<HTMLElement>("#unit-diff")!;
      const unitCalsie = root.querySelector<HTMLElement>("#unit-calsie")!;
      const unitTypical = root.querySelector<HTMLElement>("#unit-typical")!;

      const typicalPoints: [number, number][] = [
        [0, 0],
        [2, 150],
        [4, 180],
        [8, 195],
        [14, 210],
        [20, 225],
        [30, 260],
      ];

      const xForDay = (day: number) => 48 + (day / 30) * 572;
      const yForVal = (val: number) => 210 - (val / 720) * 190;
      const calsieValue = (day: number) => Math.round((day / 30) * 720);
      const typicalValue = (day: number) => {
        for (let i = 0; i < typicalPoints.length - 1; i++) {
          const [d0, v0] = typicalPoints[i];
          const [d1, v1] = typicalPoints[i + 1];
          if (day >= d0 && day <= d1) {
            const t = (day - d0) / (d1 - d0);
            return Math.round(v0 + t * (v1 - v0));
          }
        }
        return typicalPoints[typicalPoints.length - 1][1];
      };

      function updatePace(day: number) {
        const cVal = calsieValue(day);
        const tVal = typicalValue(day);
        const x = xForDay(day);
        calsieDot.setAttribute("cx", String(x));
        calsieDot.setAttribute("cy", String(yForVal(cVal)));
        typicalDot.setAttribute("cx", String(x));
        typicalDot.setAttribute("cy", String(yForVal(tVal)));
        dayGuide.setAttribute("x1", String(x));
        dayGuide.setAttribute("x2", String(x));
        dayLabel.textContent = String(day);
        statCalsie.textContent = String(cVal);
        statTypical.textContent = String(tVal);
        // Early in a campaign the paced approach is legitimately behind, so the
        // label has to follow the sign — "-93 more sent" would be nonsense.
        const diff = cVal - tVal;
        statDiff.textContent = (diff >= 0 ? "+" : "") + diff;
        unitDiff.textContent = diff >= 0 ? "more sent with Calsie" : "behind, but still climbing";
        unitCalsie.textContent = "sent by day " + day;
        unitTypical.textContent = "sent by day " + day;
      }

      const clipRect = root.querySelector<SVGRectElement>("#pace-clip-rect");
      const chartFullWidth = 572;
      let hasRevealed = false;

      function setClipProgress(p: number) {
        clipRect?.setAttribute("width", String(Math.max(0, Math.min(1, p)) * chartFullWidth));
      }
      function easeOutCubic(t: number) {
        return 1 - Math.pow(1 - t, 3);
      }

      let rafId: number | null = null;
      function playReveal() {
        if (hasRevealed) return;
        hasRevealed = true;
        if (reduceMotion) {
          setClipProgress(1);
          updatePace(30);
          slider!.value = "30";
          return;
        }
        const duration = 4200;
        let startTime: number | null = null;
        function frame(ts: number) {
          if (startTime === null) startTime = ts;
          const raw = Math.min((ts - startTime) / duration, 1);
          const eased = easeOutCubic(raw);
          setClipProgress(eased);
          const day = Math.max(1, Math.round(1 + eased * 29));
          updatePace(day);
          slider!.value = String(day);
          if (raw < 1) {
            rafId = requestAnimationFrame(frame);
          } else {
            setClipProgress(1);
            updatePace(30);
            slider!.value = "30";
          }
        }
        rafId = requestAnimationFrame(frame);
      }

      const paceCard = root.querySelector(".pace-card");
      let paceObserver: IntersectionObserver | null = null;
      if (paceCard) {
        paceObserver = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                playReveal();
                paceObserver?.unobserve(entry.target);
              }
            });
          },
          { threshold: 0.4 }
        );
        paceObserver.observe(paceCard);
      }

      const sliderHandler = function (this: HTMLInputElement) {
        hasRevealed = true;
        setClipProgress(1);
        updatePace(parseInt(this.value, 10));
      };
      slider.addEventListener("input", sliderHandler);
      updatePace(parseInt(slider.value, 10));

      cleanups.push(() => {
        slider.removeEventListener("input", sliderHandler);
        paceObserver?.disconnect();
        if (rafId !== null) cancelAnimationFrame(rafId);
      });
    }

    return () => cleanups.forEach((fn) => fn());
  }, []);

  return (
    <div className="clm-landing" id="top" ref={rootRef}>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "Organization",
                "@id": "https://calsie.com.au/#organisation",
                name: "Calsie Jobs",
                url: "https://calsie.com.au",
                logo: "https://calsie.com.au/applix-logo.svg",
                description:
                  "AI-powered job application automation for Australian job seekers, with human approval required on every send.",
                email: CALSIE_CONTACT_EMAIL,
                address: { "@type": "PostalAddress", addressCountry: "AU" },
                areaServed: { "@type": "Country", name: "Australia" },
              },
              {
                "@type": "WebSite",
                "@id": "https://calsie.com.au/#website",
                url: "https://calsie.com.au",
                name: "Calsie Jobs",
                inLanguage: "en-AU",
                publisher: { "@id": "https://calsie.com.au/#organisation" },
              },
              {
                "@type": "Service",
                name: "AI job application automation",
                serviceType: "Employment application service",
                provider: { "@id": "https://calsie.com.au/#organisation" },
                inLanguage: "en-AU",
                description:
                  "Finds NDIS, aged care, disability and community support roles across Australia, tailors your resume to each ad, drafts the application email, and sends only what you approve — capped at one send per hour.",
                areaServed: [
                  { "@type": "Country", name: "Australia" },
                  { "@type": "State", name: "New South Wales" },
                  { "@type": "State", name: "Victoria" },
                  { "@type": "State", name: "Queensland" },
                  { "@type": "State", name: "Western Australia" },
                  { "@type": "State", name: "South Australia" },
                  { "@type": "State", name: "Tasmania" },
                  { "@type": "State", name: "Australian Capital Territory" },
                  { "@type": "State", name: "Northern Territory" },
                ],
                audience: {
                  "@type": "Audience",
                  audienceType: "Australian job seekers in disability, aged care and community services",
                  geographicArea: { "@type": "Country", name: "Australia" },
                },
              },
            ],
          }),
        }}
      />
      <nav className="nav">
        <div className="wrap">
          <a className="logo" href="#top">
            <img src="/favicon.svg" alt="" />
            Calsie <span className="badge">Jobs</span>
          </a>
          <div className="nav-links">
            <a href="#features">Features</a>
            <a href="#how">How it works</a>
            <a href="#prepare">Prepare</a>
            <a href="#tracker">Tracker</a>
            <a href="#pricing">Pricing</a>
            <a href="#about">About</a>
          </div>
          <div className="nav-cta">
            <a className="login" href="/login">
              Log in
            </a>
            <a className="btn btn-primary btn-sm" href="#pricing">
              Get started
            </a>
          </div>
        </div>
      </nav>

      <div className="ticker" aria-hidden="true">
        <div className="ticker-track">
          {[0, 1].map((rep) =>
            TICKER_ITEMS.map((item, i) => (
              <span key={`${rep}-${i}`}>
                {item.dot ? <span className="live-dot" /> : null}
                {item.text}
              </span>
            ))
          )}
        </div>
      </div>

      <header className="hero">
        <div className="hero-bg" aria-hidden="true">
          <span className="hero-blob hb1" />
          <span className="hero-blob hb2" />
          <svg className="hero-grid" viewBox="0 0 1200 800" preserveAspectRatio="none" focusable="false">
            <g className="grid-far">
              {GRID_FAR.v.map((x) => (
                <path key={`fv${x}`} data-axis="v" data-pos={x} />
              ))}
              {GRID_FAR.h.map((y) => (
                <path key={`fh${y}`} data-axis="h" data-pos={y} />
              ))}
            </g>
            <g className="grid-near">
              {GRID_NEAR.v.map((x) => (
                <path key={`nv${x}`} data-axis="v" data-pos={x} />
              ))}
              {GRID_NEAR.h.map((y) => (
                <path key={`nh${y}`} data-axis="h" data-pos={y} />
              ))}
            </g>
          </svg>
        </div>
        <div className="wrap">
          <span className="eyebrow">AI job applications · Australia</span>
          <h1>
            We find the jobs.
            <br />
            We write the applications.
            <br />
            You approve every send.
          </h1>
          <p className="lead">
            Calsie Jobs finds NDIS, aged care and support roles across Australia, tailors your resume to each one and
            drafts the email. Nothing sends until you say so.
          </p>
          <div className="hero-actions">
            <a className="btn btn-accent" href="#pricing">
              Start a campaign
            </a>
            <a className="btn btn-secondary" href="#how">
              See how it works
            </a>
          </div>
          <div className="hero-trusted">
            <span className="hero-trusted-avatars">
              <img src="https://i.pravatar.cc/64?img=32" alt="" />
              <img src="https://i.pravatar.cc/64?img=47" alt="" />
              <img src="https://i.pravatar.cc/64?img=13" alt="" />
            </span>
            <span className="hero-trusted-text">Trusted by 10,000 users</span>
          </div>
          {status ? (
            <p style={{ color: "#C2440F", fontFamily: "var(--clm-mono)", fontSize: 12, marginBottom: 24 }} role="alert">
              {status}{" "}
              <a href="/login" style={{ textDecoration: "underline" }}>
                Go to the login page
              </a>
            </p>
          ) : null}
        </div>
      </header>

      <div className="showcase-stage">
        <div className="wrap">
          <div className="section-head split reveal" style={{ marginBottom: 44 }}>
            <div className="split-left">
              <span className="eyebrow">What makes it different</span>
              <h2>Every match is built to fit — not just to fill a queue.</h2>
            </div>
            <p className="thread split-right">
              Instead of blasting the same resume everywhere, Calsie Jobs looks for roles like these — real fits at
              providers you&apos;d recognise — then lets through just <b>one approved application</b> an hour.
            </p>
          </div>
          <div className="showcase-carousel reveal">
            <MatchCardCarousel matches={SHOWCASE_MATCHES} />
          </div>
        </div>
      </div>

      <section className="metrics">
        <div className="wrap" style={{ flexDirection: "column", paddingTop: 56, paddingBottom: 8 }}>
          <div className="section-head split reveal" style={{ marginBottom: 0 }}>
            <div className="split-left">
              <span className="eyebrow">What that adds up to</span>
              <h2>The math behind a calmer job hunt.</h2>
            </div>
            <p className="thread split-right">Multiply that one rule across a day, then a month, and here&apos;s what it becomes.</p>
          </div>
        </div>
        <div className="wrap">
          <div className="metric reveal">
            <div className="num">
              <span className="count" data-target="24">
                0
              </span>
              <span className="unit">/day</span>
            </div>
            <div className="cap">Applications prepared for review, released across the day</div>
          </div>
          <div className="metric reveal">
            <div className="num">
              <span className="count" data-target="1">
                0
              </span>
              <span className="unit">/hour</span>
            </div>
            <div className="cap">Maximum approved applications sent at any time</div>
          </div>
          <div className="metric reveal">
            <div className="num">
              <span className="count" data-target="720">
                0
              </span>
              <span className="unit">/30d</span>
            </div>
            <div className="cap">Ceiling on a full campaign, kept steady by design</div>
          </div>
        </div>
        <div className="wrap" style={{ paddingTop: 56, paddingBottom: 64 }}>
          <div className="pace-card reveal">
            <div className="pace-head">
              <div>
                <h3>Same 30 days. Very different pace.</h3>
                <div className="sub">Drag through the campaign and watch the gap grow</div>
              </div>
              <div className="pace-legend">
                <span className="row">
                  <span className="sw orange" />
                  Calsie Jobs — steady, capped pace
                </span>
                <span className="row">
                  <span className="sw grey" />
                  Unpaced mass-apply tools — bursts, then throttled
                </span>
              </div>
            </div>

            <div className="pace-scrub">
              <div className="scrub-row">
                <span className="scrub-label">
                  Day <b id="scrub-day">1</b> of 30
                </span>
                <span className="scrub-hint">
                  <svg viewBox="0 0 24 24">
                    <path d="M8 9 4 12l4 3" />
                    <path d="M16 9l4 3-4 3" />
                  </svg>
                  Drag to scrub
                </span>
              </div>
              <input type="range" min={1} max={30} defaultValue={1} step={1} id="pace-slider" aria-label="Campaign day" />
            </div>

            <svg
              className="pace-chart"
              viewBox="0 0 640 250"
              role="img"
              aria-label="Interactive line chart comparing cumulative applications sent over 30 days: Calsie Jobs rises steadily to 720, while unpaced mass-apply tools burst early then plateau around 260."
            >
              <defs>
                <clipPath id="pace-clip">
                  <rect id="pace-clip-rect" x={48} y={0} width={0} height={250} />
                </clipPath>
              </defs>
              <line className="grid-line" x1={48} y1={210} x2={620} y2={210} />
              <line className="grid-line" x1={48} y1={162.5} x2={620} y2={162.5} />
              <line className="grid-line" x1={48} y1={115} x2={620} y2={115} />
              <line className="grid-line" x1={48} y1={67.5} x2={620} y2={67.5} />
              <line className="grid-line" x1={48} y1={20} x2={620} y2={20} />

              <text className="axis-label" x={40} y={213} textAnchor="end">
                0
              </text>
              <text className="axis-label" x={40} y={165.5} textAnchor="end">
                180
              </text>
              <text className="axis-label" x={40} y={118} textAnchor="end">
                360
              </text>
              <text className="axis-label" x={40} y={70.5} textAnchor="end">
                540
              </text>
              <text className="axis-label" x={40} y={23} textAnchor="end">
                720
              </text>

              <text className="axis-label" x={48} y={232} textAnchor="start">
                Day 1
              </text>
              <text className="axis-label" x={238.7} y={232} textAnchor="middle">
                Day 10
              </text>
              <text className="axis-label" x={429.3} y={232} textAnchor="middle">
                Day 20
              </text>
              <text className="axis-label" x={620} y={232} textAnchor="end">
                Day 30
              </text>

              <line id="day-guide" x1={48} y1={15} x2={48} y2={210} />

              <g clipPath="url(#pace-clip)">
                <polyline
                  points="48,210 86,170 124,163 200,159 315,155 429,151 620,141"
                  fill="none"
                  style={{ stroke: "var(--clm-muted)", strokeWidth: 2, strokeDasharray: "5 5", strokeLinecap: "round", strokeLinejoin: "round" }}
                />
                <line x1={48} y1={210} x2={620} y2={20} style={{ stroke: "var(--clm-orange)", strokeWidth: 3, strokeLinecap: "round" }} />
              </g>

              <text className="end-label" x={596} y={12} textAnchor="end" style={{ fill: "var(--clm-orange-deep)" }}>
                Day 30: 720
              </text>
              <text className="end-label" x={596} y={160} textAnchor="end" style={{ fill: "var(--clm-ink-soft)" }}>
                Day 30: ~260
              </text>

              <circle id="typical-dot" cx={48} cy={210} r={5.5} />
              <circle id="calsie-dot" cx={48} cy={210} r={5.5} />
            </svg>

            <div className="pace-stats">
              <div className="pace-stat">
                <div className="k">Calsie Jobs</div>
                <div className="v" id="stat-calsie">
                  0
                </div>
                <div className="u" id="unit-calsie">
                  sent by day 1
                </div>
              </div>
              <div className="pace-stat">
                <div className="k">Typical mass-apply tool</div>
                <div className="v" id="stat-typical">
                  0
                </div>
                <div className="u" id="unit-typical">
                  sent by day 1
                </div>
              </div>
              <div className="pace-stat highlight">
                <div className="k">Difference</div>
                <div className="v" id="stat-diff">
                  +0
                </div>
                <div className="u" id="unit-diff">more sent with Calsie</div>
              </div>
            </div>

            <div className="pace-caption">
              Illustrative comparison — mass-sending tools often hit daily caps or spam filters on job boards before a
              campaign finishes
            </div>
          </div>
        </div>
      </section>

      <section className="section orange" id="how">
        <div className="wrap">
          <div className="section-head split reveal">
            <div className="split-left">
              <span className="eyebrow">A day inside it</span>
              <h2>Here&apos;s what one day actually looks like</h2>
            </div>
            <p className="split-right">Not a stock photo of a laptop and coffee — this is the same loop, built around your shifts, every day of the campaign.</p>
          </div>
          <div className="timeline">
            <div className="timeline-track">
              <div className="timeline-track-fill" id="timeline-fill" />
            </div>
            <div className="steps">
              <div className="step reveal" data-step={1}>
                <div className="idx">
                  <svg className="icon" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="4.5" />
                    <line x1="12" y1="2" x2="12" y2="4.5" />
                    <line x1="12" y1="19.5" x2="12" y2="22" />
                    <line x1="4.2" y1="4.2" x2="6" y2="6" />
                    <line x1="18" y1="18" x2="19.8" y2="19.8" />
                    <line x1="2" y1="12" x2="4.5" y2="12" />
                    <line x1="19.5" y1="12" x2="22" y2="12" />
                    <line x1="4.2" y1="19.8" x2="6" y2="18" />
                    <line x1="18" y1="6" x2="19.8" y2="4.2" />
                  </svg>
                </div>
                <div className="step-time">6:00 AM</div>
                <h3>Before your shift — the search runs</h3>
                <p>
                  While you&apos;re getting ready, Calsie Jobs is already scanning for roles that match your suburb, your
                  hours and the kind of support work you actually do.
                </p>
                <button className="step-more" type="button" aria-expanded="false">
                  See what it&apos;s searching for
                  <svg className="step-chev" viewBox="0 0 8 8">
                    <path d="M1 1l6 3-6 3" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <div className="step-detail">
                  <p>
                    Example filter: <b>Disability Support Worker · part-time · Bankstown &amp; nearby</b> — no live-in or
                    FIFO roles, and nothing outside your rostered availability, unless you switch that on.
                  </p>
                </div>
              </div>
              <div className="step reveal" data-step={2}>
                <div className="idx">
                  <svg className="icon" viewBox="0 0 24 24">
                    <rect x="3.5" y="7" width="17" height="13" rx="1.5" />
                    <path d="M3.5 12h4l1.6 2.4h5.8L16.5 12h4" />
                    <path d="M8 7V5.5A2.5 2.5 0 0 1 10.5 3h3A2.5 2.5 0 0 1 16 5.5V7" />
                  </svg>
                </div>
                <div className="step-time">12:30 PM</div>
                <h3>On your break — the queue fills</h3>
                <p>
                  By lunch, up to 24 tailored applications are sitting in your queue — resume and email already drafted
                  for each one, ready for you to check between clients.
                </p>
                <button className="step-more" type="button" aria-expanded="false">
                  See a queued example
                  <svg className="step-chev" viewBox="0 0 8 8">
                    <path d="M1 1l6 3-6 3" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <div className="step-detail">
                  <p>
                    <b>BrightPath Australia — Caseworker.</b> Drafted 11:42 AM, waiting in your queue since — nothing sends
                    until you say so.
                  </p>
                </div>
              </div>
              <div className="step reveal" data-step={3}>
                <div className="idx">
                  <svg className="icon" viewBox="0 0 24 24">
                    <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
                    <line x1="6.5" y1="17.5" x2="17.5" y2="17.5" />
                    <line x1="10.6" y1="20" x2="13.4" y2="20" />
                  </svg>
                </div>
                <div className="step-time">Every hour</div>
                <h3>Whenever you check your phone — you decide</h3>
                <p>
                  Open the queue on your phone, approve the ones worth sending, and one goes out — never more than one an
                  hour, so no employer ever sees your name flood their inbox.
                </p>
                <button className="step-more" type="button" aria-expanded="false">
                  Why only one an hour
                  <svg className="step-chev" viewBox="0 0 8 8">
                    <path d="M1 1l6 3-6 3" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <div className="step-detail">
                  <p>
                    Mass-sending tools that fire off dozens at once are what get flagged as spam by Seek, Indeed and NDIS
                    providers — one an hour keeps every send looking like what it is: a real application from you.
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div className="loop-note reveal">
            <svg viewBox="0 0 24 24">
              <polyline points="17 1 21 5 17 9" />
              <path d="M3 11V9a4 4 0 0 1 4-4h14" />
              <polyline points="7 23 3 19 7 15" />
              <path d="M21 13v2a4 4 0 0 1-4 4H3" />
            </svg>
            <span>Then it starts again — same loop, tomorrow&apos;s shift</span>
          </div>
        </div>
      </section>

      <section className="section" id="prepare">
        <div className="wrap">
          <div className="section-head split reveal">
            <div className="split-left">
              <span className="eyebrow">Before the send</span>
              <h2>Your AI Resume Creator, built for care work</h2>
            </div>
            <p className="split-right">
              Generate a resume and cover email for every application — reworded from your real shifts and checks in
              childcare, aged care and NDIS support. No tech-résumé template, no starting from scratch each time.
            </p>
          </div>

          <div className="prepare-tags reveal">
            <span className="prepare-tag">AI for care jobs</span>
            <span className="prepare-tag">NDIS resume builder</span>
            <span className="prepare-tag">Aged care resume tips</span>
            <span className="prepare-tag">Childcare resume AI</span>
          </div>

          <div className="mac-window-stage prepare-stage">
            <div className="mac-blob b1" aria-hidden="true" />
            <div className="mac-blob b2" aria-hidden="true" />
            <div className="mac-blob b3" aria-hidden="true" />
            <div className="prepare-resume reveal">
              <div className="mac-window prepare-doc">
                <div className="mac-titlebar">
                  <div className="mac-traffic">
                    <span className="dot red" />
                    <span className="dot yellow" />
                    <span className="dot green" />
                  </div>
                  <div className="mac-title">Resume — Priya Nair.pdf</div>
                </div>
                <div className="prepare-refine">
                  <span className="prepare-refine-text">
                    Make it less wordy
                    <span className="prepare-caret" aria-hidden="true" />
                  </span>
                </div>
                <div className="prepare-doc-body">
                  <div className="pdoc-head">
                    <h3>Priya Nair</h3>
                    <p>Parramatta, NSW</p>
                    <p>priya.nair@email.com · linkedin.com/in/priyanair</p>
                  </div>

                  <div className="pdoc-block">
                    <h4>Summary</h4>
                    <p>
                      Support worker with 8+ years in aged care, NDIS and early childhood — skilled in personal
                      care, behaviour support plans and building trust with families.
                    </p>
                  </div>

                  <div className="pdoc-block">
                    <h4>Experience</h4>
                    <div className="pdoc-role">
                      <div className="pdoc-role-head">
                        <b>Disability Support Worker</b>
                        <span>2021–Present</span>
                      </div>
                      <div className="pdoc-role-co">Willow Tree Care Services</div>
                      <ul>
                        <li>Delivered personal care and community access support for NDIS participants with high needs.</li>
                        <li>Implemented behaviour support plans per NDIS Practice Standards.</li>
                      </ul>
                    </div>
                    <div className="pdoc-role">
                      <div className="pdoc-role-head">
                        <b>Aged Care Support Worker</b>
                        <span>2019–2021</span>
                      </div>
                      <div className="pdoc-role-co">Southern Cross Community</div>
                      <ul>
                        <li>Provided in-home and residential care, including medication prompts and mobility support.</li>
                      </ul>
                    </div>
                    <div className="pdoc-role">
                      <div className="pdoc-role-head">
                        <b>Family Day Care Educator</b>
                        <span>2016–2019</span>
                      </div>
                      <div className="pdoc-role-co">BrightPath Australia</div>
                      <ul>
                        <li>Planned age-appropriate learning activities for children 0–5 under the EYLF.</li>
                      </ul>
                    </div>
                  </div>

                  <div className="pdoc-block">
                    <h4>Checks &amp; clearances</h4>
                    <p>WWCC (NSW) · NDIS Worker Screening Check · First Aid &amp; CPR</p>
                  </div>
                </div>
              </div>
              <a className="btn btn-secondary btn-sm prepare-apply" href="#pricing">
                Auto-prepare applications for roles like these
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="section warm" id="features">
        <div className="wrap">
          <div className="section-head split reveal">
            <div className="split-left">
              <span className="eyebrow">What&apos;s running behind it</span>
              <h2>None of that happens by magic</h2>
            </div>
            <p className="split-right">Six things Calsie Jobs is quietly doing so your queue is never empty — and you&apos;re never the one doing the busywork.</p>
          </div>
          <div className="mac-settings reveal">
            <div className="mac-settings-crumb">
              <b>Calsie Jobs</b>
              <span className="chev">›</span>
              <span>How it works</span>
            </div>
            <div className="mac-settings-panel">
              {FEATURE_ITEMS.map((item) => (
                <div className="mac-item" key={item.title}>
                  <div className="mac-row" tabIndex={0} role="button" aria-expanded="false">
                    <div className={`mac-icon ${item.icon}`}>
                      <svg viewBox="0 0 24 24">{item.path}</svg>
                    </div>
                    <div className="mac-row-text">
                      <h3>{item.title}</h3>
                      <p>{item.body}</p>
                    </div>
                    {item.switchInstead ? (
                      <div className="mac-row-side">
                        <span className="mac-switch-label">On</span>
                        <span className="mac-switch" />
                      </div>
                    ) : (
                      <svg className="mac-chevron" viewBox="0 0 8 14">
                        <path d="M1 1l6 6-6 6" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                  <div className="mac-row-detail">
                    <p>{item.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="section tracker-band" id="tracker">
        <div className="wrap">
          <div className="section-head split reveal">
            <div className="split-left">
              <span className="eyebrow">Proof, not promises</span>
              <h2>This is what it looks like mid-story</h2>
            </div>
            <p className="split-right">An actual campaign, one day in — the kind of view you&apos;d have open in another tab while you get on with your day.</p>
          </div>

          <div className="mac-window-stage">
            <div className="mac-blob b1" aria-hidden="true" />
            <div className="mac-blob b2" aria-hidden="true" />
            <div className="mac-blob b3" aria-hidden="true" />

            <div className="mac-window reveal" id="mac-window">
              <div className="mac-titlebar">
                <div className="mac-traffic">
                  <span className="dot red" />
                  <span className="dot yellow" />
                  <span className="dot green" />
                </div>
                <div className="mac-title">Support Worker / Community Services — Day 1</div>
              </div>
              <div className="mac-toolbar">
                <div className="mac-segmented" id="mac-segmented" role="tablist">
                  <button className="seg active" type="button" data-panel="list" role="tab" aria-selected="true">
                    List
                  </button>
                  <button className="seg" type="button" data-panel="board" role="tab" aria-selected="false">
                    Board
                  </button>
                  <button className="seg" type="button" data-panel="activity" role="tab" aria-selected="false">
                    Activity
                  </button>
                </div>
                <div className="mac-search">
                  <svg viewBox="0 0 24 24">
                    <circle cx="10.5" cy="10.5" r="6.5" />
                    <line x1="20" y1="20" x2="15.3" y2="15.3" />
                  </svg>
                  Search applications
                </div>
              </div>
              <div className="mac-body">
                <aside className="mac-sidebar" id="mac-sidebar">
                  <div className="mac-sidebar-label">Campaign</div>
                  <a className="mac-sidebar-item active" href="#" data-filter="all">
                    <span className="sdot all" />
                    All roles
                    <span className="scount">16</span>
                  </a>
                  <a className="mac-sidebar-item" href="#" data-filter="found">
                    <span className="sdot found" />
                    Found
                    <span className="scount">4</span>
                  </a>
                  <a className="mac-sidebar-item" href="#" data-filter="prepared">
                    <span className="sdot prepared" />
                    Prepared
                    <span className="scount">6</span>
                  </a>
                  <a className="mac-sidebar-item" href="#" data-filter="queued">
                    <span className="sdot queued" />
                    Queued
                    <span className="scount">4</span>
                  </a>
                  <a className="mac-sidebar-item" href="#" data-filter="declined">
                    <span className="sdot declined" />
                    Declined
                    <span className="scount">2</span>
                  </a>
                </aside>

                <div className="mac-panel" data-panel="list">
                  <div className="mac-list" id="mac-list">
                    {TRACKER_ROWS.map((row) => (
                      <div className="mac-list-row" data-status={row.status} key={`${row.co}-${row.role}`}>
                        <div className="mlr-main">
                          <div className="mlr-co">{row.co}</div>
                          <div className="mlr-role">{row.role} · {row.loc}</div>
                        </div>
                        <span className={`pill ${row.status}`}>{row.status[0].toUpperCase() + row.status.slice(1)}</span>
                        {row.variant === "primary" ? (
                          <button className="mac-btn primary" type="button">
                            {row.action}
                          </button>
                        ) : row.variant === "ghost" ? (
                          <button className="mac-btn ghost" type="button" disabled>
                            {row.action}
                          </button>
                        ) : (
                          <button className="mac-btn" type="button">
                            {row.action}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mac-panel" data-panel="board" hidden>
                  <div className="mac-board">
                    {BOARD_COLUMNS.map((col) => (
                      <div className="mac-board-col" key={col.key}>
                        <div className="mac-board-head">
                          <span className={`sdot ${col.dot}`} />
                          {col.label}
                          <span className="bcount">{col.cards.length}</span>
                        </div>
                        <div className="mac-board-cards">
                          {col.cards.map((card) => (
                            <div className={`board-card${"declined" in col && col.declined ? " declined" : ""}`} key={card.co}>
                              <div className="bc-co">{card.co}</div>
                              <div className="bc-role">{card.role}</div>
                              {"wait" in card ? <div className="bc-wait">{card.wait}</div> : null}
                              {"action" in col ? (
                                <button className={`mac-btn sm${col.actionPrimary ? " primary" : ""}`} type="button">
                                  {col.action}
                                </button>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mac-panel" data-panel="activity" hidden>
                  <div className="mac-activity">
                    {ACTIVITY_ROWS.map((row, i) => (
                      <div className="a-row" key={i}>
                        <span className="a-time">{row.time}</span>
                        <span className={`a-dot ${row.dot}`} />
                        <span className="a-text">
                          {row.before}
                          {row.bold ? <b>{row.bold}</b> : null}
                          {row.after || ""}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mac-statusbar">
                <span className="live-dot" />4 found · 6 prepared · 4 queued · 2 declined — 16 roles today
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="quote-section">
        <div className="wrap">
          <span className="eyebrow" style={{ justifyContent: "center", marginBottom: 26 }}>
            If there&apos;s a moral to this
          </span>
          <blockquote className="reveal">
            &quot;AI should <em>accelerate</em> the workflow, not take away your judgment.&quot;
          </blockquote>
          <cite>— Calsie Jobs, on why every send waits for your approval</cite>
        </div>
      </section>

      <section className="section alt" id="pricing">
        <div className="wrap">
          <div className="section-head split reveal">
            <div className="split-left">
              <span className="eyebrow">Where you come in</span>
              <h2>Browse first. Pay for the template you choose.</h2>
            </div>
            <p className="split-right">
              No commitment just to look. Calsie Jobs never asks for payment at login — each campaign template carries
              its own price, shown only once you&apos;ve picked it.
            </p>
          </div>
          <div className="pricing-flow">
            {PRICING_FLOW.map((item) => (
              <div className="pflow-item reveal" key={item.step}>
                <div className="idx">{item.step}</div>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </div>
            ))}
          </div>
          <div className="pricing-cta reveal">
            <a className="btn btn-accent" href="/login">
              Login and browse
            </a>
          </div>
        </div>
      </section>

      <section className="cta-banner">
        <div className="wrap">
          <span className="eyebrow" style={{ justifyContent: "center", color: "#FFE0CE" }}>
            Your move
          </span>
          <h2 className="reveal">The next 30 days start with one campaign</h2>
          <p>
            Prepare up to 24 applications a day, approve the ones you want, and let Calsie Jobs send no more than one an
            hour — up to 720 over 30 days. Same story, told at your pace.
          </p>
          <div className="cta-actions">
            <button type="button" className="btn btn-primary" onClick={loginWithGoogle} disabled={loading}>
              {loading ? "Opening…" : "Get started"}
            </button>
            <a className="btn btn-secondary" href="#pricing">
              Browse templates
            </a>
          </div>
        </div>
      </section>

      <footer id="about">
        <div className="wrap">
          <div className="footer-top">
            <div className="footer-brand">
              <div className="logo">
                <img src="/favicon.svg" alt="" />
                Calsie <span className="badge">Jobs</span>
              </div>
              <p>AI-powered job application support for Australian job seekers — NDIS, aged care and community services. Move faster, and keep every decision that matters in your hands.</p>
              <div className="contact">{CALSIE_CONTACT_EMAIL}</div>
            </div>
            {FOOTER_GROUPS.map((group) => (
              <div className="footer-col" key={group.title}>
                <h4>{group.title}</h4>
                <ul>
                  {group.links.map(([label, href]) => (
                    <li key={label}>
                      <a href={href}>{label}</a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="footer-bottom">
            <span className="copyright">© 2026 Calsie Jobs. All rights reserved.</span>
            <div className="footer-social">
              <a href="#">X</a>
              <a href="#">Instagram</a>
              <a href="#">LinkedIn</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
