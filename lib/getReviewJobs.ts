import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function getReviewJobs(campaignId?: string) {
  const supabase = createServerComponentClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  let query = supabase
    .from("jobs")
    .select("id,campaign_id,title,company,location,source,apply_url,extracted_email,description,status,created_at")
    .eq("user_id", user.id)
    .in("status", ["new", "review", "pending_review"])
    .order("created_at", { ascending: false })
    .limit(100);

  if (campaignId) query = query.eq("campaign_id", campaignId);

  const { data, error } = await query;

  if (error) {
    console.error("Could not load review jobs", error.message);
    return [];
  }

  return data || [];
}
