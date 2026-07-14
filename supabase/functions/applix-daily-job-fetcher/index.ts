import { serve } from "std/http/server.ts";
import { createClient } from "supabase";

type Row = Record<string, any>;

const FUNCTION_NAME = "applix-daily-job-fetcher";
const BLOCKED_STATUSES = [
  "paused",
  "inactive",
  "archived",
  "disabled",
  "completed",
];
const ELIGIBLE_STATUSES = ["launched", "scheduled", "active"];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret, x-applix-cron-secret, cron-secret",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

function bearerToken(req: Request) {
  return (req.headers.get("authorization") || "")
    .replace(/^Bearer\s+/i, "")
    .trim();
}

function isInternalAuthorized(req: Request) {
  const token = bearerToken(req);
  const cronSecret = req.headers.get("x-cron-secret") ||
    req.headers.get("x-applix-cron-secret") ||
    req.headers.get("cron-secret") ||
    "";

  if (
    SUPABASE_SERVICE_ROLE_KEY &&
    token === SUPABASE_SERVICE_ROLE_KEY
  ) {
    return true;
  }

  return Boolean(
    CRON_SECRET &&
      (token === CRON_SECRET || cronSecret === CRON_SECRET)
  );
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
  const startedAt = text(outreach.started_at);
  return {
    value: startedAt || text(campaign.created_at),
    source: startedAt
      ? "outreach.started_at"
      : "campaign.created_at_legacy_fallback",
  };
}

function isScheduledAndActive(campaign: Row) {
  const outreach = parseJsonIfNeeded(campaign.outreach);
  const campaignStatus = text(campaign.status)?.toLowerCase() || "";
  const outreachStatus = text(outreach.status)?.toLowerCase() || "";
  const lifecycleEligible = ELIGIBLE_STATUSES.includes(campaignStatus);
  const blockedStatus = BLOCKED_STATUSES.includes(campaignStatus) ||
    BLOCKED_STATUSES.includes(outreachStatus);
  const scheduled = bool(outreach.scheduled, false) ||
    bool(outreach.cron_enabled, false) ||
    bool(outreach.schedule_enabled, false) ||
    outreachStatus === "scheduled" ||
    campaignStatus === "scheduled";
  const active = bool(outreach.active, lifecycleEligible) && !blockedStatus;

  let reason = "eligible";
  if (blockedStatus) reason = "campaign_status_blocks_scheduling";
  else if (!lifecycleEligible) reason = "campaign_lifecycle_not_eligible";
  else if (!scheduled) reason = "campaign_not_scheduled";
  else if (!active) reason = "campaign_not_active";

  return {
    eligible: lifecycleEligible && scheduled && active && !blockedStatus,
    reason,
    campaign_status: campaignStatus || null,
    outreach_status: outreachStatus || null,
    outreach_active: bool(outreach.active, lifecycleEligible),
    outreach_scheduled: scheduled,
  };
}

async function callFunction(functionName: string, payload: Row) {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/${functionName}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify(payload),
      },
    );

    const rawText = await response.text().catch(() => "");
    let body: unknown = rawText;
    try {
      body = rawText ? JSON.parse(rawText) : {};
    } catch {
      body = { raw: rawText };
    }

    const stageBody = parseJsonIfNeeded(body);
    return {
      ok: response.ok && stageBody.ok !== false && !stageBody.error,
      status: response.status,
      payload: body,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      payload: {
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

async function saveRunSummary(
  supabase: any,
  campaign: Row,
  summary: Row,
  fetchedAt: string | null,
) {
  const outreach = parseJsonIfNeeded(campaign.outreach);
  const nextOutreach = {
    ...outreach,
    last_daily_fetch_result: summary,
    ...(fetchedAt ? { last_daily_fetch_at: fetchedAt } : {}),
  };

  const update = await supabase
    .from("campaigns")
    .update({ outreach: nextOutreach, updated_at: new Date().toISOString() })
    .eq("id", campaign.id);

  if (update.error) throw new Error(update.error.message);
  campaign.outreach = nextOutreach;
}

async function scheduleDraftsHourly(
  supabase: any,
  campaignId: string,
  limit: number,
  hourlyCap: number,
) {
  const { data, error } = await supabase
    .from("outreach_queue")
    .select("id,scheduled_send_at,created_at")
    .eq("campaign_id", campaignId)
    .eq("status", "queued")
    .eq("review_status", "approved")
    .is("scheduled_send_at", null)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw new Error(error.message);

  const drafts = (data || []) as Row[];
  const now = new Date();
  let scheduledCount = 0;

  for (let i = 0; i < drafts.length; i += 1) {
    const hourSlot = Math.floor(i / hourlyCap);
    const scheduledSendAt = new Date(now.getTime() + hourSlot * 60 * 60 * 1000)
      .toISOString();
    const update = await supabase
      .from("outreach_queue")
      .update({
        scheduled_send_at: scheduledSendAt,
        send_window: "hourly_approved",
        updated_at: new Date().toISOString(),
      })
      .eq("id", drafts[i].id)
      .eq("review_status", "approved");

    if (update.error) throw new Error(update.error.message);
    scheduledCount += 1;
  }

  return {
    ok: true,
    scheduled_count: scheduledCount,
    hourly_cap: hourlyCap,
    approval_required: true,
    first_due_at: scheduledCount ? now.toISOString() : null,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return json({ ok: false, error: "Use POST" }, 405);
    }
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return json(
        { ok: false, error: "Missing daily fetcher configuration" },
        500,
      );
    }

    if (!isInternalAuthorized(req)) {
      return json({
        ok: false,
        function: FUNCTION_NAME,
        error: "Unauthorized internal scheduler request",
      }, 401);
    }

    const input = await req.json().catch(() => ({}));
    const onlyCampaignId = text(input.campaign_id);
    const force = bool(input.force, false);
    const inspectOnly = bool(input.inspect_only, false);
    const triggerSource = text(input.source) ||
      (onlyCampaignId ? "manual_campaign_request" : "scheduled_request");
    const now = new Date();

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    let query = supabase
      .from("campaigns")
      .select("id,user_id,status,outreach,search,created_at");

    if (onlyCampaignId) query = query.eq("id", onlyCampaignId);
    else query = query.in("status", ELIGIBLE_STATUSES);

    const { data: campaigns, error } = await query;
    if (error) throw new Error(error.message);

    const results: Row[] = [];
    let eligibleCount = 0;
    let executedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    let wouldExecuteCount = 0;

    for (const campaign of campaigns || []) {
      const outreach = parseJsonIfNeeded(campaign.outreach);
      const search = parseJsonIfNeeded(campaign.search);
      const eligibility = isScheduledAndActive(campaign);
      const baseSummary: Row = {
        runner: FUNCTION_NAME,
        campaign_id: campaign.id,
        scheduled_run: bool(input.scheduled_run, !onlyCampaignId),
        inspect_only: inspectOnly,
        trigger_source: triggerSource,
        campaign_status: eligibility.campaign_status,
        outreach_status: eligibility.outreach_status,
      };

      if (!eligibility.eligible) {
        const summary: Row = {
          ...baseSummary,
          ok: true,
          skipped: true,
          reason: "campaign_not_scheduled_or_active",
          eligibility,
        };
        if (!inspectOnly) {
          try {
            await saveRunSummary(supabase, campaign, summary, null);
          } catch (saveError) {
            summary.ok = false;
            summary.error = `Failed to store skip result: ${
              saveError instanceof Error ? saveError.message : String(saveError)
            }`;
            failedCount += 1;
          }
        }
        skippedCount += 1;
        results.push(summary);
        continue;
      }

      eligibleCount += 1;
      const startedAt = campaignStartedAt(campaign);
      const ageMinutes = minutesBetween(startedAt.value, now);
      const minutesSinceDailyFetch = minutesBetween(
        text(outreach.last_daily_fetch_at),
        now,
      );
      let timingReason: string | null = null;

      if (!Number.isFinite(ageMinutes) || ageMinutes > 30 * 24 * 60) {
        timingReason = "campaign_exceeded_30_day_duration";
      } else if (!force && minutesSinceDailyFetch < 20 * 60) {
        timingReason = "daily_fetch_already_ran_within_20_hours";
      }

      if (timingReason) {
        const summary: Row = {
          ...baseSummary,
          ok: true,
          skipped: true,
          reason: timingReason,
          eligibility,
          campaign_started_at: startedAt.value,
          campaign_started_at_source: startedAt.source,
          campaign_age_minutes: Number.isFinite(ageMinutes)
            ? Math.floor(ageMinutes)
            : null,
          minutes_since_daily_fetch: Number.isFinite(minutesSinceDailyFetch)
            ? Math.floor(minutesSinceDailyFetch)
            : null,
        };
        if (!inspectOnly) {
          try {
            await saveRunSummary(supabase, campaign, summary, null);
          } catch (saveError) {
            summary.ok = false;
            summary.error = `Failed to store skip result: ${
              saveError instanceof Error ? saveError.message : String(saveError)
            }`;
            failedCount += 1;
          }
        }
        skippedCount += 1;
        results.push(summary);
        continue;
      }

      const dailyJobLimit = Math.max(
        1,
        Math.min(
          24,
          numberValue(
            search.daily_job_limit || outreach.daily_job_limit ||
              outreach.daily_cap,
            24,
          ),
        ),
      );
      const postedWithinHours = Math.max(
        1,
        Math.min(
          168,
          numberValue(outreach.posted_within_hours, 24),
        ),
      );
      const hourlyCap = Math.max(
        1,
        Math.min(
          24,
          numberValue(outreach.hourly_cap || outreach.hourly_email_limit, 1),
        ),
      );
      const userId = text(campaign.user_id);

      if (inspectOnly) {
        wouldExecuteCount += 1;
        results.push({
          ...baseSummary,
          ok: true,
          inspected: true,
          skipped: false,
          would_run: true,
          reason: "eligible",
          eligibility,
          campaign_started_at: startedAt.value,
          campaign_started_at_source: startedAt.source,
          daily_job_limit: dailyJobLimit,
          posted_within_hours: postedWithinHours,
          hourly_cap: hourlyCap,
        });
        continue;
      }

      executedCount += 1;
      let fetchedAt: string | null = null;

      try {
        const fetchStage = await callFunction("outscraper-jobs", {
          campaign_id: campaign.id,
          user_id: userId,
          scheduled_run: true,
          force_refresh: true,
          results_limit: dailyJobLimit,
          posted_within_hours: postedWithinHours,
        });

        let enrichmentStage: Row = {
          ok: false,
          skipped: true,
          reason: "job_fetch_failed",
        };
        let draftGenerationStage: Row = {
          ok: false,
          skipped: true,
          reason: "job_fetch_failed",
        };
        let schedulingStage: Row = {
          ok: false,
          skipped: true,
          reason: "job_fetch_failed",
        };

        if (fetchStage.ok) {
          fetchedAt = new Date().toISOString();
          await saveRunSummary(supabase, campaign, {
            ...baseSummary,
            ok: true,
            in_progress: true,
            daily_job_limit: dailyJobLimit,
            last_daily_fetch_at: fetchedAt,
            fetch: fetchStage,
            enrichment: { ok: false, pending: true },
            draft_generation: { ok: false, pending: true },
            scheduling: { ok: false, pending: true },
          }, fetchedAt);

          enrichmentStage = await callFunction("enrich-job-emails", {
            campaign_id: campaign.id,
            user_id: userId,
            limit: dailyJobLimit,
          });

          if (enrichmentStage.ok) {
            draftGenerationStage = await callFunction(
              "generate-job-outreach-drafts",
              {
                campaign_id: campaign.id,
                user_id: userId,
                limit: dailyJobLimit,
              },
            );
          } else {
            draftGenerationStage = {
              ok: false,
              skipped: true,
              reason: "enrichment_failed",
            };
          }

          if (draftGenerationStage.ok) {
            try {
              schedulingStage = await scheduleDraftsHourly(
                supabase,
                campaign.id,
                dailyJobLimit,
                hourlyCap,
              );
            } catch (scheduleError) {
              schedulingStage = {
                ok: false,
                error: scheduleError instanceof Error
                  ? scheduleError.message
                  : String(scheduleError),
              };
            }
          } else {
            schedulingStage = {
              ok: false,
              skipped: true,
              reason: "draft_generation_failed",
            };
          }
        }

        const pipelineOk = fetchStage.ok && enrichmentStage.ok &&
          draftGenerationStage.ok && schedulingStage.ok;
        const summary = {
          ...baseSummary,
          ok: pipelineOk,
          fetch_completed: fetchStage.ok,
          pipeline_ok: pipelineOk,
          skipped: false,
          daily_job_limit: dailyJobLimit,
          posted_within_hours: postedWithinHours,
          hourly_cap: hourlyCap,
          last_daily_fetch_at: fetchedAt,
          fetch: fetchStage,
          enrichment: enrichmentStage,
          draft_generation: draftGenerationStage,
          scheduling: schedulingStage,
        };

        await saveRunSummary(supabase, campaign, summary, fetchedAt);
        if (!pipelineOk) failedCount += 1;
        results.push(summary);
      } catch (campaignError) {
        const summary: Row = {
          ...baseSummary,
          ok: false,
          skipped: false,
          last_daily_fetch_at: fetchedAt,
          error: campaignError instanceof Error
            ? campaignError.message
            : String(campaignError),
        };
        failedCount += 1;
        try {
          await saveRunSummary(supabase, campaign, summary, fetchedAt);
        } catch (saveError) {
          summary.summary_save_error = saveError instanceof Error
            ? saveError.message
            : String(saveError);
        }
        results.push(summary);
      }
    }

    return json({
      ok: true,
      function: FUNCTION_NAME,
      inspect_only: inspectOnly,
      trigger_source: triggerSource,
      campaigns_queried: campaigns?.length || 0,
      eligible_count: eligibleCount,
      executed_count: executedCount,
      would_execute_count: wouldExecuteCount,
      skipped_count: skippedCount,
      failed_count: failedCount,
      results,
    });
  } catch (error) {
    return json({
      ok: false,
      function: FUNCTION_NAME,
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});