import { serve } from "std/http/server.ts";
import { createClient } from "supabase";

type Row = Record<string, any>;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";

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

function bool(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (["true", "1", "yes"].includes(value.toLowerCase())) return true;
    if (["false", "0", "no"].includes(value.toLowerCase())) return false;
  }
  return fallback;
}

function numberValue(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseJsonIfNeeded(value: unknown): Row {
  if (!value) return {};
  if (typeof value === "object") return value as Row;
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed ? parsed as Row : {};
  } catch {
    return {};
  }
}

function minutesBetween(dateIso: string | null, now = new Date()) {
  if (!dateIso) return Number.POSITIVE_INFINITY;
  const parsed = new Date(dateIso);
  if (Number.isNaN(parsed.getTime())) return Number.POSITIVE_INFINITY;
  return (now.getTime() - parsed.getTime()) / (60 * 1000);
}

function campaignStartedAt(campaign: Row) {
  const outreach = parseJsonIfNeeded(campaign.outreach);
  return text(outreach.started_at) || text(outreach.created_at) || text(campaign.created_at);
}

function isScheduledAndActive(campaign: Row) {
  const outreach = parseJsonIfNeeded(campaign.outreach);
  const campaignStatus = text(campaign.status)?.toLowerCase() || "";
  const outreachStatus = text(outreach.status)?.toLowerCase() || "";

  const scheduled = bool(outreach.scheduled, false) ||
    bool(outreach.cron_enabled, false) ||
    bool(outreach.schedule_enabled, false) ||
    outreachStatus === "scheduled" ||
    campaignStatus === "scheduled";

  const active = bool(outreach.active, true) &&
    !["paused", "inactive", "archived", "disabled", "completed"].includes(campaignStatus) &&
    !["paused", "inactive", "archived", "disabled", "completed"].includes(outreachStatus);

  return scheduled && active;
}

async function callFunction(functionName: string, payload: Row) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  const rawText = await response.text().catch(() => "");
  let body: unknown = rawText;
  try {
    body = rawText ? JSON.parse(rawText) : {};
  } catch {
    body = { raw: rawText };
  }

  return { ok: response.ok, status: response.status, payload: body };
}

async function saveRunSummary(
  supabase: ReturnType<typeof createClient>,
  campaign: Row,
  summary: Row,
  markFetchedAt: boolean,
) {
  const outreach = parseJsonIfNeeded(campaign.outreach);
  const nextOutreach = {
    ...outreach,
    last_daily_fetch_result: summary,
    ...(markFetchedAt ? { last_daily_fetch_at: new Date().toISOString() } : {}),
  };

  const update = await supabase
    .from("campaigns")
    .update({ outreach: nextOutreach, updated_at: new Date().toISOString() })
    .eq("id", campaign.id);

  if (update.error) throw new Error(update.error.message);
}

async function scheduleDraftsHourly(
  supabase: ReturnType<typeof createClient>,
  campaignId: string,
  limit: number,
) {
  const { data, error } = await supabase
    .from("outreach_queue")
    .select("id,scheduled_send_at,created_at")
    .eq("campaign_id", campaignId)
    .eq("status", "draft")
    .eq("review_status", "ready_for_review")
    .is("scheduled_send_at", null)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw new Error(error.message);

  const drafts = data || [];
  const now = new Date();
  let scheduledCount = 0;

  for (let i = 0; i < drafts.length; i += 1) {
    const scheduledSendAt = new Date(now.getTime() + i * 60 * 60 * 1000).toISOString();
    const update = await supabase
      .from("outreach_queue")
      .update({
        scheduled_send_at: scheduledSendAt,
        send_window: "hourly_review",
        updated_at: new Date().toISOString(),
      })
      .eq("id", drafts[i].id);

    if (update.error) throw new Error(update.error.message);
    scheduledCount += 1;
  }

  return { scheduled_count: scheduledCount, first_due_at: scheduledCount ? now.toISOString() : null };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "POST") return json({ ok: false, error: "Use POST" }, 405);
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !CRON_SECRET) {
      return json({ ok: false, error: "Missing daily fetcher configuration" }, 500);
    }

    const authHeader = req.headers.get("authorization") || "";
    const cronHeader = req.headers.get("x-cron-secret") || "";
    const bearerSecret = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (cronHeader !== CRON_SECRET && bearerSecret !== CRON_SECRET) {
      return json({ ok: false, error: "Unauthorized" }, 401);
    }

    const input = await req.json().catch(() => ({}));
    const onlyCampaignId = text(input.campaign_id);
    const force = bool(input.force, false);
    const now = new Date();

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    let query = supabase
      .from("campaigns")
      .select("id,user_id,status,outreach,created_at")
      .in("status", ["scheduled", "active"]);

    if (onlyCampaignId) query = query.eq("id", onlyCampaignId);

    const { data: campaigns, error } = await query;
    if (error) throw new Error(error.message);

    const results: Row[] = [];

    for (const campaign of campaigns || []) {
      const outreach = parseJsonIfNeeded(campaign.outreach);
      const baseSummary: Row = {
        runner: "applix-daily-job-fetcher",
        campaign_id: campaign.id,
        scheduled_run: true,
      };

      if (!isScheduledAndActive(campaign)) continue;

      const startedAt = campaignStartedAt(campaign);
      const ageMinutes = minutesBetween(startedAt, now);
      if (!Number.isFinite(ageMinutes) || ageMinutes > 30 * 24 * 60) {
        const summary = { ...baseSummary, ok: false, skipped: true, reason: "campaign exceeded 30 day duration" };
        await saveRunSummary(supabase, campaign, summary, false);
        results.push(summary);
        continue;
      }

      const minutesSinceDailyFetch = minutesBetween(text(outreach.last_daily_fetch_at), now);
      if (!force && minutesSinceDailyFetch < 20 * 60) {
        const summary = {
          ...baseSummary,
          ok: false,
          skipped: true,
          reason: "daily fetch already ran in the last 20 hours",
          minutes_since_daily_fetch: Math.floor(minutesSinceDailyFetch),
        };
        await saveRunSummary(supabase, campaign, summary, false);
        results.push(summary);
        continue;
      }

      const dailyJobLimit = Math.max(1, Math.min(24, numberValue(outreach.daily_job_limit || outreach.daily_cap, 24)));
      const postedWithinHours = Math.max(1, Math.min(168, numberValue(outreach.posted_within_hours, 24)));
      const userId = text(campaign.user_id);

      const outscraperJobs = await callFunction("outscraper-jobs", {
        campaign_id: campaign.id,
        user_id: userId,
        scheduled_run: true,
        force_refresh: true,
        results_limit: dailyJobLimit,
        posted_within_hours: postedWithinHours,
      });

      let enrichJobEmails = { ok: false, status: 424, payload: { ok: false, skipped: true, reason: "outscraper-jobs failed" } };
      let generateJobOutreachDrafts = { ok: false, status: 424, payload: { ok: false, skipped: true, reason: "previous pipeline step failed" } };
      let draftSchedule = { scheduled_count: 0, first_due_at: null as string | null };

      if (outscraperJobs.ok) {
        enrichJobEmails = await callFunction("enrich-job-emails", {
          campaign_id: campaign.id,
          user_id: userId,
          limit: dailyJobLimit,
        });
      }

      if (outscraperJobs.ok && enrichJobEmails.ok) {
        generateJobOutreachDrafts = await callFunction("generate-job-outreach-drafts", {
          campaign_id: campaign.id,
          user_id: userId,
          limit: dailyJobLimit,
        });
      }

      if (outscraperJobs.ok && enrichJobEmails.ok && generateJobOutreachDrafts.ok) {
        draftSchedule = await scheduleDraftsHourly(supabase, campaign.id, dailyJobLimit);
      }

      const ok = outscraperJobs.ok && enrichJobEmails.ok && generateJobOutreachDrafts.ok;
      const summary = {
        ...baseSummary,
        ok,
        daily_job_limit: dailyJobLimit,
        posted_within_hours: postedWithinHours,
        outscraper_jobs: outscraperJobs,
        enrich_job_emails: enrichJobEmails,
        generate_job_outreach_drafts: generateJobOutreachDrafts,
        draft_schedule: draftSchedule,
      };

      await saveRunSummary(supabase, campaign, summary, ok);
      results.push(summary);
    }

    return json({ ok: true, function: "applix-daily-job-fetcher", campaign_count: results.length, results });
  } catch (error) {
    return json({ ok: false, function: "applix-daily-job-fetcher", error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
