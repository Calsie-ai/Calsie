import { NextResponse } from "next/server";

export const runtime = "nodejs";

const MAIN_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://bnshgtrqbfuphhhdgccs.supabase.co";
const MAIN_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const MAIN_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const JOBS_FEED_URL = "https://ibgmpamvkvjzdxirzxzr.supabase.co/functions/v1/calsie-category-job-feed";
const TABLES = new Set(["disability_jobs_apify", "agecare_jobs_apify", "childcare_jobs_apify"]);

function failure(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status, headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return failure("Please sign in again.", 401);
  const parsed = await req.json().catch(() => ({}));
  const body = parsed && typeof parsed === "object" ? parsed : {};
  const campaignId = typeof body.campaign_id === "string" ? body.campaign_id : "";
  const jobId = Number(body.source_job_id);
  const decision = body.decision;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(campaignId)
      || !Number.isSafeInteger(jobId) || jobId <= 0 || !["approved", "skipped"].includes(decision)) {
    return failure("Invalid agent decision.", 400);
  }
  if (!MAIN_ANON_KEY || !MAIN_SERVICE_KEY) return failure("Calsie decision service is not configured.", 503);

  try {
    const authResponse = await fetch(`${MAIN_URL}/auth/v1/user`, {
      headers: { authorization: `Bearer ${token}`, apikey: MAIN_ANON_KEY }, cache: "no-store",
    });
    if (!authResponse.ok) return failure("Your Calsie session is not valid.", 401);
    const user = await authResponse.json();
    if (typeof user?.id !== "string") return failure("Your Calsie session is not valid.", 401);

    // The Jobs service verifies campaign ownership and category, then checks
    // that the referenced job exists in that category's actual catalogue.
    const validateResponse = await fetch(JOBS_FEED_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ action: "validate", campaign_id: campaignId, source_job_id: jobId }),
      cache: "no-store",
    });
    const validated = await validateResponse.json().catch(() => ({}));
    if (!validateResponse.ok || validated.ok !== true) {
      return failure(validated.error || "Could not validate this job for your agent.", validateResponse.status >= 400 && validateResponse.status < 500 ? validateResponse.status : 502);
    }
    if (validated.campaign_id !== campaignId || validated.source_job_id !== jobId || !TABLES.has(validated.source_table)) {
      return failure("The job category could not be verified.", 502);
    }

    const saveResponse = await fetch(`${MAIN_URL}/rest/v1/calsie_agent_job_decisions?on_conflict=campaign_id,source_table,source_job_id`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${MAIN_SERVICE_KEY}`,
        apikey: MAIN_SERVICE_KEY,
        "content-type": "application/json",
        prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify({
        user_id: user.id, campaign_id: campaignId, source_table: validated.source_table,
        source_job_id: jobId, decision, job_snapshot: validated.snapshot || {},
        reviewed_at: new Date().toISOString(),
      }),
      cache: "no-store",
    });
    if (!saveResponse.ok) return failure("Could not save your decision.", 502);
    const rows = await saveResponse.json().catch(() => []);
    if (!Array.isArray(rows) || rows[0]?.user_id !== user.id || rows[0]?.campaign_id !== campaignId) {
      return failure("Could not confirm your saved decision.", 502);
    }
    return NextResponse.json({ ok: true, decision, campaign_id: campaignId, source_job_id: jobId }, { headers: { "cache-control": "no-store" } });
  } catch {
    return failure("Decision service is temporarily unavailable.", 502);
  }
}
