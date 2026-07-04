import { serve } from "std/http/server.ts";
import { createClient } from "supabase";

type Row = Record<string, any>;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

function text(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const clean = String(value).trim();
  return clean ? clean : null;
}

function cleanEmail(value: unknown): string | null {
  const email = text(value)?.toLowerCase() || null;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;

  const blocked = [
    "hostsajan",
    "example.com",
    "test.com",
    "noreply",
    "no-reply",
    "indeed.com",
    "linkedin.com",
    "seek.com",
    "google.com",
  ];

  return blocked.some((part) => email.includes(part)) ? null : email;
}

function draftSubject(job: Row): string {
  return `Application for ${text(job.title) || "your open role"}`;
}

function draftBody(job: Row): string {
  const company = text(job.company) || "your team";
  const title = text(job.title) || "the open role";

  return [
    `Hello ${company} team,`,
    "",
    `I am interested in the ${title} role at ${company}. I would welcome the opportunity to discuss how my support-focused IT experience, reliability, and willingness to learn could help your team.`,
    "",
    "Thank you for your time and consideration.",
    "",
    "Kind regards,",
    "Sajan",
  ].join("\n");
}

async function existingDraftJobIds(
  supabase: ReturnType<typeof createClient>,
  jobIds: string[],
) {
  if (jobIds.length === 0) return new Set<string>();

  const { data, error } = await supabase
    .from("outreach_queue")
    .select("job_id")
    .in("job_id", jobIds);

  if (error) throw new Error(error.message);
  return new Set((data || []).map((row: Row) => row.job_id).filter(Boolean));
}

async function existingCampaignIds(
  supabase: ReturnType<typeof createClient>,
  campaignIds: string[],
) {
  const uniqueIds = [...new Set(campaignIds.filter(Boolean))];
  if (uniqueIds.length === 0) return new Set<string>();

  const { data, error } = await supabase
    .from("campaigns")
    .select("id")
    .in("id", uniqueIds);

  if (error) throw new Error(error.message);
  return new Set((data || []).map((row: Row) => row.id).filter(Boolean));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "POST") return json({ ok: false, error: "Use POST" }, 405);
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return json({ ok: false, error: "Missing Supabase service role configuration" }, 500);
    }

    const input = await req.json().catch(() => ({}));
    const limit = Math.max(1, Math.min(24, Number(input.limit || 1)));
    const campaignId = text(input.campaign_id);
    const userId = text(input.user_id);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    let query = supabase
      .from("jobs")
      .select("id,campaign_id,email_contact_id,extracted_email,company,title,user_id,apply_method,email_extraction_status")
      .not("extracted_email", "is", null)
      .eq("apply_method", "email")
      .eq("email_extraction_status", "found")
      .not("company", "is", null)
      .not("title", "is", null)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (campaignId) query = query.eq("campaign_id", campaignId);
    if (userId) query = query.eq("user_id", userId);

    const { data: jobs, error } = await query;
    if (error) throw new Error(error.message);

    const candidates = jobs || [];
    const duplicateJobIds = await existingDraftJobIds(
      supabase,
      candidates.map((job: Row) => job.id).filter(Boolean),
    );
    const validCampaignIds = await existingCampaignIds(
      supabase,
      candidates.map((job: Row) => text(job.campaign_id)).filter(Boolean) as string[],
    );

    let eligibleCount = 0;
    let draftCreatedCount = 0;
    let skippedCount = 0;
    let duplicateCount = 0;

    for (const job of candidates) {
      if (duplicateJobIds.has(job.id)) {
        duplicateCount += 1;
        continue;
      }

      const recipientEmail = cleanEmail(job.extracted_email);
      const company = text(job.company);
      const title = text(job.title);
      const campaignIdForDraft = text(job.campaign_id);

      if (
        !recipientEmail ||
        !company ||
        !title ||
        !campaignIdForDraft ||
        !validCampaignIds.has(campaignIdForDraft)
      ) {
        skippedCount += 1;
        continue;
      }

      eligibleCount += 1;

      const insert = await supabase
        .from("outreach_queue")
        .insert({
          campaign_id: campaignIdForDraft,
          job_id: job.id,
          contact_email_id: job.email_contact_id || null,
          recipient_email: recipientEmail,
          recipient_company: company,
          subject: draftSubject(job),
          email_body: draftBody(job),
          status: "draft",
          review_status: "ready_for_review",
          send_window: "manual_review",
          user_identifier: text(job.user_id),
        });

      if (insert.error) {
        if (insert.error.code === "23505") {
          duplicateCount += 1;
          continue;
        }

        throw new Error(insert.error.message);
      }

      draftCreatedCount += 1;
    }

    return json({
      ok: true,
      function: "generate-job-outreach-drafts",
      limit,
      eligible_count: eligibleCount,
      draft_created_count: draftCreatedCount,
      skipped_count: skippedCount,
      duplicate_count: duplicateCount,
    });
  } catch (error) {
    return json({
      ok: false,
      function: "generate-job-outreach-drafts",
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});
