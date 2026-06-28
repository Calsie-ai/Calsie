"use client";

import { useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

type JobCard = {
  id: string;
  campaign_id: string | null;
  title: string | null;
  company: string | null;
  location: string | null;
  source: string | null;
  apply_url: string | null;
  extracted_email: string | null;
  description: string | null;
  status: string | null;
  created_at: string | null;
};

type Props = {
  initialJobs: JobCard[];
};

export default function JobSwipeDeck({ initialJobs }: Props) {
  const supabase = createClientComponentClient();
  const [jobs, setJobs] = useState<JobCard[]>(initialJobs || []);
  const [dragStartX, setDragStartX] = useState<number | null>(null);
  const [dragX, setDragX] = useState(0);
  const [busy, setBusy] = useState(false);
  const [lastAction, setLastAction] = useState<string | null>(null);

  const current = jobs[0];
  const remaining = Math.max(jobs.length - 1, 0);

  const emailLabel = useMemo(() => {
    if (!current) return "";
    return current.extracted_email ? "Email found" : "No email yet";
  }, [current]);

  const swipeHint = dragX > 40 ? "Approve" : dragX < -40 ? "Skip" : "Review";
  const rotate = Math.max(-8, Math.min(8, dragX / 18));

  async function decide(job: JobCard, decision: "approved" | "skipped") {
    if (!job || busy) return;
    setBusy(true);

    const { error } = await supabase
      .from("jobs")
      .update({
        status: decision,
        state: decision,
        user_decision: decision,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    setBusy(false);
    setDragX(0);
    setDragStartX(null);

    if (error) {
      alert(error.message);
      return;
    }

    setLastAction(decision === "approved" ? "Approved for apply queue" : "Skipped");
    setJobs((previous) => previous.filter((item) => item.id !== job.id));
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (busy) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragStartX(event.clientX);
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (busy || dragStartX === null) return;
    setDragX(event.clientX - dragStartX);
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (!current || dragStartX === null) return;
    const distance = event.clientX - dragStartX;
    setDragStartX(null);

    if (distance > 90) return decide(current, "approved");
    if (distance < -90) return decide(current, "skipped");
    setDragX(0);
  }

  if (!current) {
    return (
      <div className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-8 text-center text-white shadow-2xl">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-emerald-400/15 text-2xl">✓</div>
        <h2 className="text-2xl font-black">No jobs left to review</h2>
        <p className="mt-2 text-sm text-white/70">Applix will add more cards when the agent finds new Indeed jobs.</p>
        {lastAction && <p className="mt-4 text-xs uppercase tracking-[0.25em] text-pink-300">Last action: {lastAction}</p>}
      </div>
    );
  }

  return (
    <section className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <div className="flex items-center justify-between rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs text-white/60">
        <span>{remaining} more waiting</span>
        <span className={dragX > 40 ? "text-emerald-300" : dragX < -40 ? "text-rose-300" : "text-white/60"}>{swipeHint}</span>
      </div>

      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{ transform: `translateX(${dragX}px) rotate(${rotate}deg)` }}
        className="touch-pan-y select-none rounded-[2rem] border border-white/10 bg-gradient-to-b from-slate-950 to-slate-900 p-6 text-white shadow-2xl transition-transform duration-150"
      >
        <div className="mb-4 flex items-center justify-between gap-3 text-xs uppercase tracking-[0.25em] text-white/50">
          <span>{current.source || "Indeed"}</span>
          <span className={current.extracted_email ? "text-emerald-300" : "text-amber-300"}>{emailLabel}</span>
        </div>

        <h1 className="text-3xl font-black leading-tight">{current.title || "Untitled job"}</h1>
        <p className="mt-3 text-xl font-semibold text-pink-300">{current.company || "Unknown company"}</p>
        <p className="mt-1 text-white/70">{current.location || "Location not listed"}</p>

        <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
            <p className="text-white/40">Decision</p>
            <p className="font-bold">Needs review</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
            <p className="text-white/40">Apply route</p>
            <p className="font-bold">{current.extracted_email ? "Email" : "Job URL"}</p>
          </div>
        </div>

        <p className="mt-5 line-clamp-6 text-sm leading-6 text-white/70">
          {current.description || "No description was saved for this job."}
        </p>

        {current.apply_url && (
          <a
            href={current.apply_url}
            target="_blank"
            rel="noreferrer"
            className="mt-5 block rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-center text-sm font-semibold text-white"
          >
            Open Indeed job post
          </a>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          disabled={busy}
          onClick={() => decide(current, "skipped")}
          className="rounded-2xl border border-white/10 bg-white/10 px-5 py-4 text-lg font-black text-white disabled:opacity-50"
        >
          ← Skip
        </button>
        <button
          disabled={busy}
          onClick={() => decide(current, "approved")}
          className="rounded-2xl bg-pink-500 px-5 py-4 text-lg font-black text-white shadow-lg shadow-pink-500/20 disabled:opacity-50"
        >
          Approve →
        </button>
      </div>

      <p className="text-center text-xs text-white/50">Swipe right to approve for apply queue. Swipe left to skip.</p>
    </section>
  );
}
