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
  const [busy, setBusy] = useState(false);

  const current = jobs[0];
  const remaining = Math.max(jobs.length - 1, 0);

  const emailLabel = useMemo(() => {
    if (!current) return "";
    return current.extracted_email ? "Email found" : "No email yet";
  }, [current]);

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

    if (error) {
      alert(error.message);
      return;
    }

    setJobs((previous) => previous.filter((item) => item.id !== job.id));
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    setDragStartX(event.clientX);
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (!current || dragStartX === null) return;
    const distance = event.clientX - dragStartX;
    setDragStartX(null);

    if (distance > 80) decide(current, "approved");
    if (distance < -80) decide(current, "skipped");
  }

  if (!current) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-center text-white">
        <h2 className="text-2xl font-bold">No jobs to review</h2>
        <p className="mt-2 text-sm text-white/70">Applix will add more cards when the agent finds new jobs.</p>
      </div>
    );
  }

  return (
    <section className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <div className="text-center text-sm text-white/60">{remaining} more jobs waiting</div>

      <div
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        className="touch-pan-y select-none rounded-[2rem] border border-white/10 bg-slate-950/90 p-6 text-white shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between gap-3 text-xs uppercase tracking-[0.25em] text-white/50">
          <span>{current.source || "Indeed"}</span>
          <span className={current.extracted_email ? "text-emerald-300" : "text-amber-300"}>{emailLabel}</span>
        </div>

        <h1 className="text-3xl font-black leading-tight">{current.title || "Untitled job"}</h1>
        <p className="mt-3 text-xl font-semibold text-pink-300">{current.company || "Unknown company"}</p>
        <p className="mt-1 text-white/70">{current.location || "Location not listed"}</p>

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
            Open job post
          </a>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          disabled={busy}
          onClick={() => decide(current, "skipped")}
          className="rounded-2xl bg-white/10 px-5 py-4 text-lg font-bold text-white disabled:opacity-50"
        >
          ← Skip
        </button>
        <button
          disabled={busy}
          onClick={() => decide(current, "approved")}
          className="rounded-2xl bg-pink-500 px-5 py-4 text-lg font-bold text-white disabled:opacity-50"
        >
          Approve →
        </button>
      </div>

      <p className="text-center text-xs text-white/50">Swipe right to approve. Swipe left to skip.</p>
    </section>
  );
}
