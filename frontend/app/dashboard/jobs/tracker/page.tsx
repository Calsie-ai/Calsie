import ApplixSafeTracker from "../../../../components/ApplixSafeTracker";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: {
    campaignId?: string;
  };
};

export default function TrackerPage({ searchParams }: PageProps) {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#3b1769_0%,#071024_45%,#050816_100%)] px-4 py-8 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.35em] text-pink-300">Track Applix log</p>
            <h1 className="mt-2 text-4xl font-black md:text-6xl">Jobs Applix touched</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">
              Dynamic workbook view for the campaign. Users can track jobs, approve, skip, and inspect descriptions without seeing employer contact details.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href="/dashboard" className="rounded-full bg-white/10 px-4 py-2 text-sm font-bold">Dashboard</a>
            <a href={`/dashboard/jobs/review${searchParams?.campaignId ? `?campaignId=${searchParams.campaignId}` : ""}`} className="rounded-full bg-pink-500 px-4 py-2 text-sm font-bold">Swipe Review</a>
          </div>
        </div>

        <ApplixSafeTracker campaignId={searchParams?.campaignId} />
      </div>
    </main>
  );
}
