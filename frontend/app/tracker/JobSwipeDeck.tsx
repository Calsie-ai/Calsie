"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { BriefcaseBusiness, Check, ChevronLeft, ChevronRight, CircleCheck, CircleDollarSign, MapPin, X } from "lucide-react";
import type { ReviewOpportunity } from "./TrackerWorkspace";
import { isCampaignRunning } from "../dashboard/workspace-data";
import { postedLabel, swipeAction } from "../../lib/jobSwipe";
import styles from "./smash-pass.module.css";

type Props = {
  campaign: { status: string | null } | null;
  opportunities: ReviewOpportunity[];
  loading: boolean;
  busy: boolean;
  error: string;
  feedback: string;
  feedMessage: string;
  onDecide: (item: ReviewOpportunity, decision: "approved" | "skipped") => Promise<void>;
  onReload: () => void;
};
const keyOf = (item: ReviewOpportunity) => `${item.opportunity_type}:${item.review_id}`;

function JobCard({ item }: { item: ReviewOpportunity }) {
  const [logoFailed, setLogoFailed] = useState(false);
  const description = (item.description || item.ai_reason || "No description provided.").replace(/<[^>]*>/g, " ").trim();
  const paragraphs = description.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const initials = (item.company || "Company").split(/\s+/).slice(0, 3).map((word) => word[0]).join("");
  return <>
    <div className={styles.cardHeading}>
      <div className={styles.companyMark} aria-hidden="true">{item.company_logo && !logoFailed ? <img src={item.company_logo} alt="" onError={() => setLogoFailed(true)} /> : initials}</div>
      <div><h2>{item.title || "Direct company outreach"}</h2><p>{item.company || "Company not listed"}</p></div>
      <span className={styles.badge}>New</span>
    </div>
    <div className={styles.metadata}>
      <span><CircleDollarSign />{item.salary || "Salary not listed"}</span>
      <span><MapPin />{item.location || "Location not listed"}</span>
      <span><BriefcaseBusiness />{item.job_type || (item.opportunity_type === "direct_company" ? "Direct outreach" : "Type not listed")}</span>
    </div>
    <div className={styles.description} tabIndex={0} aria-label="Job description">
      <h3>Summary</h3>
      {paragraphs.map((paragraph, index) => /^(key responsibilities|responsibilities|requirements|qualifications|benefits|about the role):?$/i.test(paragraph) ? <h3 key={index}>{paragraph.replace(/:$/, "")}</h3> : <p key={index}>{paragraph.replace(/^[•\-*]\s*/, "")}</p>)}
      {item.ai_reason && item.description && <><h3>Why this match</h3><p>{item.ai_reason}</p></>}
      <div className={styles.source}>Posted {postedLabel(item.posted_at)} · {item.source || "Source not listed"}{item.apply_url && /^https?:\/\//i.test(item.apply_url) && <a href={item.apply_url} target="_blank" rel="noreferrer">Open original job</a>}</div>
    </div>
  </>;
}

export default function JobSwipeDeck({ campaign, opportunities, loading, busy, error, feedback, feedMessage, onDecide, onReload }: Props) {
  const [recommended, setRecommended] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const reducedMotion = useReducedMotion();
  const pending = useMemo(() => opportunities.filter((item) => !item.status || item.status === "pending_review"), [opportunities]);
  const queue = useMemo(() => recommended ? pending.filter((item) => Number.isFinite(item.ai_role_relevance_score)).sort((a, b) => b.ai_role_relevance_score! - a.ai_role_relevance_score!) : pending, [pending, recommended]);
  const selectedIndex = Math.max(0, queue.findIndex((item) => keyOf(item) === selectedKey));
  const current = queue[selectedIndex];
  const reviewed = opportunities.filter((item) => item.status === "approved" || item.status === "skipped").length;
  const total = opportunities.length;
  const running = isCampaignRunning(campaign?.status);
  const canDecide = campaign?.status === "active" && !busy && !loading;
  const status = !campaign ? "No campaign selected" : running ? "Campaign running" : campaign.status === "paused" ? "Campaign paused" : campaign.status === "completed" ? "Campaign completed" : "Campaign ready";
  const visible = queue.map((item, index) => {
    let offset = (index - selectedIndex + queue.length) % queue.length;
    if (offset > queue.length / 2) offset -= queue.length;
    return { item, offset };
  }).filter(({ offset }) => Math.abs(offset) <= 2);
  function move(direction: number) {
    const next = queue[(selectedIndex + direction + queue.length) % queue.length];
    if (next && !busy) setSelectedKey(keyOf(next));
  }
  const nav = (direction: number, outer = false) => <button type="button" className={outer ? styles.outerArrow : styles.arrow} aria-label={direction < 0 ? "Previous job" : "Next job"} disabled={busy || queue.length < 2} onClick={() => move(direction)}>{direction < 0 ? <ChevronLeft /> : <ChevronRight />}</button>;
  return <div className={styles.review}>
    <div className={styles.banner}>
      <div className={styles.introduction}><p className={styles.eyebrow}>{status}</p><h1><span>Smash</span> or Pass</h1><p>Review matched jobs and choose Pass or Smash.</p></div>
      <div className={styles.progress}>
        <div className={styles.ring} role="img" aria-label={`${reviewed} of ${total} jobs reviewed`}>
          <svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="50" /><circle cx="60" cy="60" r="50" strokeDasharray={`${total ? reviewed / total * 314.16 : 0} 314.16`} /></svg>
          <span><strong>{reviewed}</strong>/{total}</span>
        </div>
        <div><h2>Review Progress</h2><p>{reviewed} loaded jobs reviewed</p><div className={styles.campaignNote}><CircleCheck size={21} /><span>{running ? "Campaign started. You can review jobs in Smash / Pass." : campaign ? "Start or resume your campaign to review jobs." : "Set up a campaign to find matched jobs."}</span></div></div>
      </div>
    </div>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {feedMessage && <p className={styles.feedMessage} role="status">{feedMessage}</p>}
    <div className={styles.controls}>
      <div className={styles.segmented} aria-label="Review queue"><button type="button" aria-pressed={!recommended} disabled={busy} onClick={() => { setRecommended(false); setSelectedKey(null); }}>Smash or Pass</button><button type="button" aria-pressed={recommended} disabled={busy} onClick={() => { setRecommended(true); setSelectedKey(null); }}>Recommended</button></div>
      <div className={styles.navigation}><span aria-live="polite">{queue.length ? selectedIndex + 1 : 0} of {queue.length}</span>{nav(-1)}{nav(1)}</div>
    </div>
    {current && !loading ? <>
      <div className={styles.deck} aria-label="Matched jobs" aria-roledescription="carousel">
        {visible.map(({ item, offset }) => <motion.article key={keyOf(item)} className={styles.card} aria-hidden={offset !== 0} inert={offset !== 0} drag={offset === 0 && canDecide ? "x" : false} dragConstraints={{ left: 0, right: 0 }} dragElastic={.25} onDragEnd={(_, info) => { if (offset !== 0 || !canDecide) return; const action = swipeAction(info.offset.x, info.offset.y); if (action === "approved" || action === "skipped") void onDecide(item, action); }} animate={{ x: `${offset * 20}%`, scale: 1 - Math.abs(offset) * .12, opacity: offset === 0 ? 1 : Math.abs(offset) === 1 ? .65 : .3, filter: offset === 0 ? "blur(0px)" : "blur(1px)" }} transition={{ duration: reducedMotion ? 0 : .3, ease: [.22, 1, .36, 1] }} style={{ zIndex: 5 - Math.abs(offset), pointerEvents: offset === 0 ? "auto" : "none", touchAction: "pan-y" }}><JobCard item={item} /></motion.article>)}
        <div className={styles.deckPrevious}>{nav(-1, true)}</div><div className={styles.deckNext}>{nav(1, true)}</div>
      </div>
      <div className={styles.decisions} aria-busy={busy}><button type="button" disabled={!canDecide} onClick={() => void onDecide(current, "skipped")}><span><X /></span>Pass</button><button type="button" disabled={!canDecide} onClick={() => void onDecide(current, "approved")}><span><Check /></span>Smash</button></div>
      {busy && <p className={styles.saving} role="status">Saving your decision…</p>}
      {!busy && feedback && <p className={styles.saving} role="status">{feedback}</p>}
    </> : <div className={styles.empty} aria-live="polite"><h2>{loading ? "Loading your matches…" : error ? "Could not load your matches" : !campaign ? "Choose a care agent" : campaign.status !== "active" ? "Start or resume your campaign" : recommended && pending.length ? "No scored matches yet" : total ? "You’re all caught up" : "Your matches will appear here"}</h2><p>{recommended && pending.length ? "You can still review every job in Smash or Pass." : "Review each match and decide which opportunities to pursue."}</p>{!loading && !error && (!campaign || campaign.status !== "active") ? <Link href={campaign ? "/dashboard?panel=campaign" : "/dashboard?panel=templates"}>{campaign ? "Set up campaign" : "Browse agents"}</Link> : <button type="button" disabled={loading} onClick={onReload}>Refresh matches</button>}</div>}
  </div>;
}
