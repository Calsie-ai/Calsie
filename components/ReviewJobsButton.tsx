type Props = {
  campaignId?: string | null;
  className?: string;
};

export default function ReviewJobsButton({ campaignId, className = "" }: Props) {
  const href = campaignId ? `/dashboard/jobs/review?campaignId=${campaignId}` : "/dashboard/jobs/review";

  return (
    <a
      href={href}
      className={`inline-flex items-center justify-center rounded-full bg-pink-500 px-4 py-2 text-sm font-black text-white shadow-lg shadow-pink-500/20 ${className}`}
    >
      Review Jobs
    </a>
  );
}
