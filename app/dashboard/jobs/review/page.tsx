import JobSwipeDeck from "@/components/JobSwipeDeck";
import { getReviewJobs } from "@/lib/getReviewJobs";

type PageProps = {
  searchParams?: {
    campaignId?: string;
  };
};

export default async function ReviewJobsPage({ searchParams }: PageProps) {
  const campaignId = searchParams?.campaignId;
  const jobs = await getReviewJobs(campaignId);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#3b1769_0%,#071024_45%,#050816_100%)] px-4 py-8 text-white">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between gap-3">
          <a href="/dashboard" className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm font-bold text-white/80">
            ← Dashboard
          </a>
          <span className="rounded-full border border-pink-300/20 bg-pink-300/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.25em] text-pink-200">
            Applix Agent Review
          </span>
        </div>

        <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 text-center shadow-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.35em] text-pink-300">Decide before Applix applies</p>
          <h1 className="mt-3 text-4xl font-black md:text-6xl">Review job cards</h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-white/65">
            Applix found these jobs in the background. Swipe right to approve a job for the apply queue, or swipe left to skip it.
          </p>

          <div className="mt-5 grid gap-3 text-sm md:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
              <p className="text-white/40">Waiting</p>
              <p className="mt-1 text-3xl font-black">{jobs.length}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
              <p className="text-white/40">Approve</p>
              <p className="mt-1 text-lg font-black text-emerald-300">Swipe right</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
              <p className="text-white/40">Skip</p>
              <p className="mt-1 text-lg font-black text-rose-300">Swipe left</p>
            </div>
          </div>
        </section>

        <div className="mt-8">
          <JobSwipeDeck initialJobs={jobs} />
        </div>
      </div>
    </main>
  );
}
