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
    <main className="min-h-screen bg-[#111827] px-4 py-6 text-white sm:px-6">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6 flex items-center justify-between">
          <a href="/dashboard" className="text-3xl font-black tracking-tight text-white">
            Calsie<span className="ml-1 text-[#ff5a1f]">✦</span>
          </a>

          <div className="flex items-center gap-3">
            <button aria-label="Notifications" className="grid h-12 w-12 place-items-center rounded-full border border-white/15 bg-white/[0.04] text-xl text-white/90">
              ♢
            </button>
            <a aria-label="Profile" href="/dashboard" className="grid h-12 w-12 place-items-center rounded-full border border-white/15 bg-white/[0.04] text-xl text-white/90">
              ◯
            </a>
          </div>
        </header>

        <div className="mb-7 grid grid-cols-2 rounded-full border border-white/15 bg-white/[0.04] p-1">
          <button className="rounded-full bg-white px-4 py-3 text-sm font-black text-slate-900 shadow-sm sm:text-base">
            Smash or Pass
          </button>
          <button className="rounded-full px-4 py-3 text-sm font-semibold text-white/55 sm:text-base">
            Recommended
          </button>
        </div>

        <JobSwipeDeck initialJobs={jobs} />
      </div>
    </main>
  );
}
