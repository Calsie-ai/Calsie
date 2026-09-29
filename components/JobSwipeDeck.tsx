"use client";

type JobCard = {
  match_id?: string;
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

function postedLabel(createdAt: string | null) {
  if (!createdAt) return "Recently";
  const created = new Date(createdAt).getTime();
  const days = Math.max(0, Math.floor((Date.now() - created) / 86400000));
  if (days === 0) return "Today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

export default function JobSwipeDeck({ initialJobs }: Props) {
  // UI mock only: intentionally no swipe decisions, RPC calls, or persistence yet.
  const current = initialJobs?.[0];

  if (!current) {
    return (
      <section className="rounded-[2rem] bg-white p-8 text-center text-slate-900 shadow-2xl">
        <h2 className="text-2xl font-black">No job card available</h2>
        <p className="mt-2 text-sm text-slate-500">A fetched job will appear here when one is available.</p>
      </section>
    );
  }

  const summary = current.description || "Job description will appear here from the existing fetched job data.";

  return (
    <section className="mx-auto w-full max-w-2xl pb-10">
      <article className="rounded-[2rem] bg-[#fbfbfc] p-5 text-slate-900 shadow-[0_22px_60px_rgba(0,0,0,0.28)] sm:p-7">
        <div className="flex items-start gap-4">
          <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-slate-100 text-center text-[10px] font-black leading-tight text-slate-600">
            {current.company ? current.company.slice(0, 2).toUpperCase() : "CO"}
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-black leading-tight sm:text-3xl">{current.title || "Untitled job"}</h1>
            <p className="mt-1 truncate text-lg text-slate-500 sm:text-xl">{current.company || "Company not listed"}</p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <div className="rounded-full bg-slate-100 px-4 py-3 text-center text-sm font-semibold text-slate-700">$ Salary</div>
          <div className="rounded-full bg-slate-100 px-4 py-3 text-center text-sm font-semibold text-slate-700">⌖ {current.location || "Location"}</div>
          <div className="col-span-2 rounded-full bg-slate-100 px-4 py-3 text-center text-sm font-semibold text-slate-700 sm:col-span-1">▣ Job type</div>
        </div>

        <div className="mt-5 rounded-3xl bg-slate-100/90 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Summary</p>
          <p className="mt-3 line-clamp-4 text-base leading-7 text-slate-700 sm:text-lg">{summary}</p>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="rounded-2xl bg-slate-100 p-3 text-center">
            <p className="text-xs text-slate-400">Posted at</p>
            <p className="mt-1 text-sm font-black text-slate-800">{postedLabel(current.created_at)}</p>
          </div>
          <div className="rounded-2xl bg-slate-100 p-3 text-center">
            <p className="text-xs text-slate-400">From</p>
            <p className="mt-1 truncate text-sm font-black capitalize text-slate-800">{current.source || "Job source"}</p>
          </div>
          <div className="rounded-2xl bg-slate-100 p-3 text-center">
            <p className="text-xs text-slate-400">Compatibility</p>
            <p className="mt-1 rounded-full bg-emerald-100 px-2 py-1 text-sm font-black text-emerald-900">9/10</p>
          </div>
        </div>
      </article>

      <div className="mt-5 text-center">
        <div className="text-2xl font-bold text-white">⌃</div>
        <div className="mx-auto mt-1 h-1.5 w-16 rounded-full bg-white/25" />
        <p className="mt-3 text-sm text-white/70">Swipe up for more job details</p>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-8 px-5 sm:px-16">
        <div className="text-center">
          <button aria-label="Smash" className="mx-auto grid h-28 w-28 place-items-center rounded-full border border-[#ff5a1f] bg-[#ff5a1f]/5 text-5xl text-[#ff5a1f] shadow-[0_0_32px_rgba(255,90,31,0.16)]">♥</button>
          <p className="mt-4 text-xl font-black">Smash</p>
          <p className="mt-1 text-sm text-white/45">Swipe left</p>
        </div>
        <div className="text-center">
          <button aria-label="Pass" className="mx-auto grid h-28 w-28 place-items-center rounded-full border border-white/25 bg-white/[0.02] text-5xl font-light text-white/75">×</button>
          <p className="mt-4 text-xl font-black">Pass</p>
          <p className="mt-1 text-sm text-white/45">Swipe right</p>
        </div>
      </div>
    </section>
  );
}
