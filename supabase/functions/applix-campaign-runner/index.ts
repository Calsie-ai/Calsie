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

function startOfUtcDayIso(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

function hoursAgoIso(hours: number, now = new Date()) {
  return new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();
}

async function countDrafts(
  supabase: ReturnType<typeof createClient>,
  campaignId: string,
  createdAfter?: string,
) {
  let query = supabase
    .from("outreach_queue")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId);

  if (createdAfter) query = query.gte("created_at", createdAfter);

  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return Number(count || 0);
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

  return {
    ok: response.ok,
    status: response.status,
    payload: body,
  };
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

function campaignStartedAt(campaign: Row) {
  const outreach = parseJsonIfNeeded(campaign.outreach);
  return text(outreach.started_at) ||
    text(outreach.created_at) ||
    text(outreach.schedule_started_at) ||
    text(campaign.created_at);
}

async function saveRunSummary(
  supabase: ReturnType<typeof createClient>,
  campaign: Row,
  summary: Row,
  markRanAt: boolean,
) {
  const outreach = parseJsonIfNeeded(campaign.outreach);
  const nextOutreach = {
    ...outreach,
    last_run_result: summary,
    ...(markRanAt ? { last_run_at: new Date().toISOString() } : {}),
  };

  const update = await supabase
    .from("campaigns")
    .update({ outreach: nextOutreach })
    .eq("id", campaign.id);

  if (update.error) throw new Error(update.error.message);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "POST") return json({ ok: false, error: "Use POST" }, 405);
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !CRON_SECRET) {
      return json({ ok: false, error: "Missing runner configuration" }, 500);
    }

    const authHeader = req.headers.get("authorization") || "";
    const cronHeader = req.headers.get("x-cron-secret") || "";
    const bearerSecret = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (cronHeader !== CRON_SECRET && bearerSecret !== CRON_SECRET) {
      return json({ ok: false, error: "Unauthorized" }, 401);
    }

    const input = await req.json().catch(() => ({}));
    const onlyCampaignId = text(input.campaign_id);
    const now = new Date();
    const oneHourAgo = hoursAgoIso(1, now);
    const startOfDay = startOfUtcDayIso(now);

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
        runner: "applix-campaign-runner",
        campaign_id: campaign.id,
        scheduled_run: true,
      };

      if (!isScheduledAndActive(campaign)) {
        continue;
      }

      const startedAt = campaignStartedAt(campaign);
      const ageMinutes = minutesBetween(startedAt, now);
      if (!Number.isFinite(ageMinutes) || ageMinutes > 30 * 24 * 60) {
        const summary = {
          ...baseSummary,
          ok: false,
          skipped: true,
          reason: "campaign exceeded 30 day duration",
        };
        await saveRunSummary(supabase, campaign, summary, false);
        results.push(summary);
        continue;
      }

      const minutesSinceLastRun = minutesBetween(text(outreach.last_run_at), now);
      if (minutesSinceLastRun < 55) {
        const summary = {
          ...baseSummary,
          ok: false,
          skipped: true,
          reason: "last run was less than 55 minutes ago",
          minutes_since_last_run: Math.floor(minutesSinceLastRun),
        };
        await saveRunSummary(supabase, campaign, summary, false);
        results.push(summary);
        continue;
      }

      const hourlyDraftCount = await countDrafts(supabase, campaign.id, oneHourAgo);
      if (hourlyDraftCount >= 1) {
        const summary = {
          ...baseSummary,
          ok: false,
          skipped: true,
          reason: "1 draft per hour limit reached",
          hourly_draft_count: hourlyDraftCount,
        };
        await saveRunSummary(supabase, campaign, summary, false);
        results.push(summary);
        continue;
      }

      const dailyDraftCount = await countDrafts(supabase, campaign.id, startOfDay);
      if (dailyDraftCount >= 24) {
        const summary = {
          ...baseSummary,
          ok: false,
          skipped: true,
          reason: "24 drafts per day limit reached",
          daily_draft_count: dailyDraftCount,
        };
        await saveRunSummary(supabase, campaign, summary, false);
        results.push(summary);
        continue;
      }

      const totalDraftCount = await countDrafts(supabase, campaign.id);
      if (totalDraftCount >= 720) {
        const summary = {
          ...baseSummary,
          ok: false,
          skipped: true,
          reason: "720 total drafts limit reached",
          total_draft_count: totalDraftCount,
        };
        await saveRunSummary(supabase, campaign, summary, false);
        results.push(summary);
        continue;
      }

      const outscraperResult = await callFunction("outscraper-jobs", {
        campaign_id: campaign.id,
        user_id: campaign.user_id,
        scheduled_run: true,
        force_refresh: true,
        posted_within_hours: 24,
        results_limit: 100,
      });

      const enrichResult = outscraperResult.ok
        ? await callFunction("enrich-job-emails", {
          campaign_id: campaign.id,
          user_id: campaign.user_id,
          limit: 1,
        })
        : {
          ok: false,
          status: 424,
          payload: { ok: false, skipped: true, reason: "outscraper-jobs failed" },
        };

      const draftResult = outscraperResult.ok && enrichResult.ok
        ? await callFunction("generate-job-outreach-drafts", {
          campaign_id: campaign.id,
          user_id: campaign.user_id,
          limit: 1,
        })
        : {
          ok: false,
          status: 424,
          payload: { ok: false, skipped: true, reason: "previous pipeline step failed" },
        };

      const summary = {
        ...baseSummary,
        ok: outscraperResult.ok && enrichResult.ok && draftResult.ok,
        outscraper_jobs: outscraperResult,
        enrich_job_emails: enrichResult,
        generate_job_outreach_drafts: draftResult,
        hourly_draft_count_before_run: hourlyDraftCount,
        daily_draft_count_before_run: dailyDraftCount,
        total_draft_count_before_run: totalDraftCount,
      };

      await saveRunSummary(supabase, campaign, summary, true);
      results.push(summary);
    }

    return json({
      ok: true,
      function: "applix-campaign-runner",
      campaign_count: results.length,
      results,
    });
  } catch (error) {
    return json({
      ok: false,
      function: "applix-campaign-runner",
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});
