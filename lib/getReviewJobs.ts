import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function getReviewJobs(campaignId?: string) {
  const supabase = createServerComponentClient({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data, error } = await supabase.rpc("get_review_jobs", {
    p_campaign_id: campaignId || null,
    p_limit: 100,
  });

  if (error) {
    console.error("Could not load AI-approved review jobs", error.message);
    return [];
  }

  return data || [];
}
