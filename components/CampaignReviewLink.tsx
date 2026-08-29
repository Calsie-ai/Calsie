type Props = { campaignId: string };

export default function CampaignReviewLink({ campaignId }: Props) {
  return (
    <a
      href={'/dashboard/jobs/review?campaignId=' + campaignId}
      className="rounded-full bg-pink-500 px-4 py-2 text-sm font-bold text-white"
    >
      Review Jobs
    </a>
  );
}
