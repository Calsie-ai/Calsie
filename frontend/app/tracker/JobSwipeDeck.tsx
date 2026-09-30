"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { BriefcaseBusiness, CalendarDays, ChevronUp, ChevronsLeft, ChevronsRight, CircleDollarSign, ExternalLink, Heart, MapPin, Sparkles, Star, X } from "lucide-react";
import { postedLabel, swipeAction } from "../../lib/jobSwipe";
import styles from "./swipe.module.css";

type ReviewOpportunity = {
  review_id: string; campaign_id: string; title: string | null; company: string | null;
  location: string | null; source: string | null; apply_url: string | null;
  description: string | null; salary?: string | null; job_type?: string | null;
  posted_at?: string | null; company_logo?: string | null;
};
type Props = {
  job: ReviewOpportunity | null; waitingCount: number; busy: boolean; loading?: boolean;
  error?: string; feedback?: string; campaignStatus?: string | null; hasAgent?: boolean;
  onSmash: (job: ReviewOpportunity) => void; onPass: (job: ReviewOpportunity) => void;
  onRetry: () => void;
};

export default function JobSwipeDeck({ job, waitingCount, busy, loading, error, feedback, campaignStatus, hasAgent, onSmash, onPass, onRetry }: Props) {
  const [view, setView] = useState<"review" | "recommended">("review");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  useEffect(() => { setDetailsOpen(false); setLogoFailed(false); setDrag({ x: 0, y: 0 }); start.current = null; }, [job?.review_id, job?.campaign_id]);
  const disabled = busy || loading || campaignStatus !== "active";

  function pointerDown(event: PointerEvent<HTMLElement>) {
    if (disabled || detailsOpen || !job || !event.isPrimary || event.button !== 0 || (event.target as HTMLElement).closest("a,button,input,select")) return;
    start.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function pointerMove(event: PointerEvent<HTMLElement>) {
    if (!start.current || start.current.id !== event.pointerId) return;
    setDrag({ x: event.clientX - start.current.x, y: event.clientY - start.current.y });
  }
  function pointerEnd(event: PointerEvent<HTMLElement>, cancelled = false) {
    const origin = start.current;
    start.current = null;
    setDrag({ x: 0, y: 0 });
    if (!origin || origin.id !== event.pointerId || cancelled || disabled || !job) return;
    const action = swipeAction(event.clientX - origin.x, event.clientY - origin.y);
    if (action === "details") setDetailsOpen(true);
    else if (action === "approved") onSmash(job);
    else if (action === "skipped") onPass(job);
  }
  const emptyTitle = loading ? "Loading your jobs…" : error ? "Could not load your jobs" : !hasAgent ? "Choose a care agent" : campaignStatus !== "active" ? "Your campaign is paused or not started" : "You’re all caught up";
  const emptyBody = loading ? "Getting jobs for your selected agent." : error ? error : !hasAgent ? "Choose an agent from Browse Agents, then start its campaign." : campaignStatus !== "active" ? "Start or resume it from Set Up Campaign to review new jobs." : "No unreviewed jobs match this campaign’s location right now. Check again after the next collection.";
  return (
    <section className={styles.deck} aria-label="Job review">
      <div className={styles.brand}>Calsie<Sparkles aria-hidden="true" /></div>
      <div className={styles.tabs} role="tablist" aria-label="Job feed">
        <button id="swipe-review-tab" type="button" role="tab" aria-selected={view === "review"} aria-controls="swipe-feed-panel" className={view === "review" ? styles.selected : ""} onClick={() => setView("review")}>Smash or Pass</button>
        <button id="swipe-recommended-tab" type="button" role="tab" aria-selected={view === "recommended"} aria-controls="swipe-feed-panel" className={view === "recommended" ? styles.selected : ""} onClick={() => setView("recommended")}>Recommended</button>
      </div>
      <div id="swipe-feed-panel" role="tabpanel" aria-labelledby={view === "review" ? "swipe-review-tab" : "swipe-recommended-tab"}>
        {view === "recommended" ? <div className={styles.empty}><Star size={32} /><h2>Recommendations start from Day 8</h2><p>Your personalized recommendation feed will be connected in a later update. Keep reviewing jobs in Smash or Pass.</p></div> : !job || loading || error ? <div className={styles.empty} role="status"><h2>{emptyTitle}</h2><p>{emptyBody}</p>{error && <button type="button" onClick={onRetry}>Try again</button>}</div> : <>
          <article className={`${styles.card} ${detailsOpen ? styles.expanded : ""}`} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={(event) => pointerEnd(event)} onPointerCancel={(event) => pointerEnd(event, true)} style={{ transform: `translate(${Math.max(-100, Math.min(100, drag.x))}px, ${Math.max(-35, Math.min(35, drag.y))}px) rotate(${drag.x / 40}deg)` }}>
            {Math.abs(drag.x) > 35 && <span className={`${styles.swipeLabel} ${drag.x < 0 ? styles.smashLabel : styles.passLabel}`}>{drag.x < 0 ? "SMASH" : "PASS"}</span>}
            <header className={styles.cardHeader}>
              {job.company_logo && !logoFailed ? <img src={job.company_logo} alt={`${job.company || "Company"} logo`} onError={() => setLogoFailed(true)} /> : <div className={styles.initials} aria-hidden="true">{(job.company || "CO").slice(0, 2).toUpperCase()}</div>}
              <div><h2>{job.title || "Untitled job"}</h2><p>{job.company || "Company not listed"}</p></div>
            </header>
            <div className={styles.facts}>
              <div><CircleDollarSign /><span>{job.salary || "Salary not listed"}</span></div>
              <div><MapPin /><span>{job.location || "Location not listed"}</span></div>
              <div><BriefcaseBusiness /><span>{job.job_type || "Type not listed"}</span></div>
            </div>
            <div className={styles.summary}><span>Summary</span><p className={detailsOpen ? "" : styles.clamped}>{job.description || "No job description was supplied by the source."}</p>{detailsOpen && job.apply_url && <a href={job.apply_url} target="_blank" rel="noreferrer">Open original job <ExternalLink size={16} /></a>}</div>
            <div className={styles.metadata}>
              <div><CalendarDays /><span>Posted at<strong>{postedLabel(job.posted_at)}</strong></span></div>
              <div><ExternalLink /><span>From<strong>{job.source || "Not listed"}</strong></span></div>
              <div><Star /><span>Compatibility<strong className={styles.score}>Not scored</strong></span></div>
            </div>
          </article>
          <button type="button" className={styles.details} aria-expanded={detailsOpen} onClick={() => setDetailsOpen(!detailsOpen)}><ChevronUp className={detailsOpen ? styles.flipped : ""} /><i /><span>{detailsOpen ? "Hide job details" : "Swipe up for more job details"}</span></button>
          <div className={styles.actions}>
            <div><button type="button" className={styles.smash} disabled={disabled} aria-label="Smash job" onClick={() => onSmash(job)}><ChevronsLeft className={styles.direction} /><Heart fill="currentColor" /></button><strong>Smash</strong><span>Swipe left</span></div>
            <div><button type="button" className={styles.pass} disabled={disabled} aria-label="Pass job" onClick={() => onPass(job)}><X /><ChevronsRight className={styles.direction} /></button><strong>Pass</strong><span>Swipe right</span></div>
          </div>
          <p className={styles.count} aria-live="polite">{busy ? "Saving your decision…" : feedback || `${waitingCount} jobs loaded for review`}</p>
        </>}
      </div>
    </section>
  );
}
