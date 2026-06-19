import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type Row = Record<string, any>;

const PROJECT_URL = "https://bnshgtrqbfuphhhdgccs.supabase.co";
const TEST_RECIPIENT_EMAIL = "hostsajan@gmail.com";
const DEFAULT_AGENT_DAYS = 10;
const DEFAULT_DAILY_JOB_LIMIT = 100;
const DEFAULT_DAILY_EMAIL_LIMIT = 100;
const DEFAULT_HOURLY_EMAIL_LIMIT = 4;

function env(name: string) {
  return Deno.env.get(name) ?? "";
}

function firstSecretKey() {
  const direct = env("SUPABASE_SERVICE_ROLE_KEY") || env("SERVICE_ROLE_KEY") || env("APPLIX_SERVICE_ROLE_KEY");
  if (direct) return direct;

  const modern = env("SUPABASE_SECRET_KEYS");
  if (!modern) return "";

  try {
    const parsed = JSON.parse(modern);
    if (Array.isArray(parsed)) return parsed[0]?.secret_key || parsed[0]?.key || parsed[0] || "";
    if (typeof parsed === "object" && parsed !== null) return parsed.secret_key || parsed.key || String(Object.values(parsed)[0] || "");
  } catch {
    return modern;
  }

  return "";
}

const SUPABASE_URL = env("SUPABASE_URL") || PROJECT_URL;
const SUPABASE_SERVICE_ROLE_KEY = firstSecretKey();
const CRON_SECRET = env("CRON_SECRET");

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function txt(value: unknown, fallback = "") {
  if (value === undefined || value === null) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function num(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function isAuthorized(req: Request) {
  if (!CRON_SECRET) return true;
  const authHeader = req.headers.get("authorization") || "";
  return authHeader === `Bearer ${CRON_SECRET}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function withinAgentWindow(campaign: Row, now: Date, agentDays: number) {
  const outreach = campaign.outreach || {};
  const launchedAt = new Date(txt(outreach.launched_at || outreach.starts_at || campaign.launched_at || campaign.created_at, now.toISOString()));
  if (Number.isNaN(launchedAt.getTime())) return false;
  if (now.getTime() > addDays(launchedAt, agentDays).getTime()) return false;
  if (outreach.enabled === false) return false;
  return true;
}

async function callFunction(name: string, body: Row) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: SUPABASE_SERVICE_ROLE_KEY,
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  return {
    ok: response.ok && payload?.ok !== false,
    status: response.status,
    payload,
  };
}

async function countRows(supabase: ReturnType<typeof createClient>, table: string, filters: (query: any) => any) {
  const query = filters(supabase.from(table).select("id", { count: "exact", head: true }));
  const result = await query;
  return { count: result.count || 0, error: result.error?.message || null };
}

async function patchCampaignRun(supabase: ReturnType<typeof createClient>, campaign: Row, patch: Row) {
  const outreach = campaign.outreach || {};
  await supabase
    .from("campaigns")
    .update({
      status: campaign.status === "scheduled" ? "launched" : campaign.status,
      outreach: {
        ...outreach,
        ...patch,
      },
    })
    .eq("id", campaign.id);
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST" && req.method !== "GET") return reply({ ok: false, error: "Use GET or POST" }, 405);
    if (!isAuthorized(req)) return reply({ ok: false, error: "Unauthorized orchestrator request." }, 401);
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return reply({ ok: false, error: "Missing Supabase service configuration." }, 500);

    const input = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const now = new Date();
    const today = startOfUtcDay(now);
    const campaignId = txt(input.campaign_id);
    const testMode = input.test_mode !== false;
    const testRecipient = txt(input.test_recipient_email, TEST_RECIPIENT_EMAIL);
    const agentDays = num(input.agent_days, DEFAULT_AGENT_DAYS, 1, 30);
    const dailyJobLimit = num(input.daily_job_limit, DEFAULT_DAILY_JOB_LIMIT, 1, 100);
    const dailyEmailLimit = num(input.daily_email_limit, DEFAULT_DAILY_EMAIL_LIMIT, 1, 100);
    const hourlyEmailLimit = num(input.hourly_email_limit, DEFAULT_HOURLY_EMAIL_LIMIT, 1, 4);
    const maxCampaigns = num(input.max_campaigns, 10, 1, 50);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    let campaignQuery = supabase
      .from("campaigns")
      .select("*")
      .in("status", ["active", "scheduled", "launched"])
      .order("created_at", { ascending: true })
      .limit(maxCampaigns);

    if (campaignId) campaignQuery = campaignQuery.eq("id", campaignId);

    const campaignResult = await campaignQuery;
    if (campaignResult.error) return reply({ ok: false, error: campaignResult.error.message }, 500);

    const campaigns = (campaignResult.data || []).filter((campaign: Row) => withinAgentWindow(campaign, now, agentDays));
    const results: Row[] = [];

    for (const campaign of campaigns) {
      const userIdentifier = txt(campaign.user_id || campaign.user_identifier || campaign.email);
      const campaignResultSummary: Row = {
        campaign_id: campaign.id,
        user_identifier: userIdentifier,
        started_at: now.toISOString(),
        test_mode: testMode,
        steps: [],
      };

      await patchCampaignRun(supabase, campaign, {
        launched_at: campaign.outreach?.launched_at || now.toISOString(),
        agent_days: agentDays,
        agent_status: "running",
        last_agent_run_started_at: now.toISOString(),
      });

      const savedJobs = await countRows(supabase, "jobs", (query) => query.eq("campaign_id", campaign.id));
      const jobsToday = await countRows(supabase, "jobs", (query) => query.eq("campaign_id", campaign.id).gte("created_at", today.toISOString()));

      campaignResultSummary.saved_jobs_count = savedJobs.count;
      campaignResultSummary.jobs_today_count = jobsToday.count;

      if (jobsToday.count < dailyJobLimit && savedJobs.count < dailyJobLimit) {
        const fetchLimit = Math.max(1, Math.min(dailyJobLimit - jobsToday.count, dailyJobLimit));
        const fetchResult = await callFunction("outscraper-jobs", {
          campaign_id: campaign.id,
          user_id: campaign.user_id,
          limit: fetchLimit,
          daily_limit: dailyJobLimit,
          test_mode: testMode,
          force_refresh: false,
        });
        campaignResultSummary.steps.push({ step: "fetch_jobs", ...fetchResult });
      } else {
        campaignResultSummary.steps.push({ step: "fetch_jobs", skipped: true, reason: "Saved jobs already exist or daily job limit reached." });
      }

      const leadResult = await callFunction("run-outscraper-campaigns", {
        campaign_id: campaign.id,
        results_limit: dailyJobLimit,
        dry_run: false,
        exact_private_company_only: false,
        test_mode: testMode,
      });
      campaignResultSummary.steps.push({ step: "qualify_or_enrich_emails", ...leadResult });

      const draftResult = await callFunction("generate-outreach-drafts", {
        campaign_id: campaign.id,
        limit: dailyEmailLimit,
        dry_run: false,
        min_lead_score: Number(input.min_lead_score ?? 0),
        test_mode: testMode,
      });
      campaignResultSummary.steps.push({ step: "draft_resume_and_email", ...draftResult });

      if (testMode) {
        await supabase
          .from("outreach_queue")
          .update({
            recipient_email: testRecipient,
            status: "queued_test",
            review_status: "ready_for_test_send",
            updated_at: now.toISOString(),
          })
          .eq("campaign_id", campaign.id)
          .in("status", ["queued", "pending", "ready", "drafted", "review_ready"]);
      }

      const sentToday = await countRows(supabase, "outreach_queue", (query) =>
        query.eq("campaign_id", campaign.id).in("status", ["sent", "sent_test"]).gte("sent_at", today.toISOString())
      );

      const remainingDailyEmails = Math.max(0, dailyEmailLimit - sentToday.count);
      const sendBatch = Math.min(hourlyEmailLimit, remainingDailyEmails);

      if (sendBatch > 0) {
        const sendResult = await callFunction("applix-agent-email-scheduler", {
          campaign_id: campaign.id,
          test_recipient_email: testRecipient,
          agent_days: agentDays,
          daily_limit: dailyEmailLimit,
          hourly_limit: sendBatch,
          dry_run: false,
        });
        campaignResultSummary.steps.push({ step: "send_hourly_gmail_batch", ...sendResult });
      } else {
        campaignResultSummary.steps.push({ step: "send_hourly_gmail_batch", skipped: true, reason: "Daily email limit reached." });
      }

      const finalJobs = await countRows(supabase, "jobs", (query) => query.eq("campaign_id", campaign.id));
      const finalQueue = await countRows(supabase, "outreach_queue", (query) => query.eq("campaign_id", campaign.id));
      const finalSent = await countRows(supabase, "outreach_queue", (query) => query.eq("campaign_id", campaign.id).in("status", ["sent", "sent_test"]));

      campaignResultSummary.final_jobs_count = finalJobs.count;
      campaignResultSummary.final_queue_count = finalQueue.count;
      campaignResultSummary.final_sent_count = finalSent.count;
      campaignResultSummary.finished_at = new Date().toISOString();

      await patchCampaignRun(supabase, campaign, {
        agent_status: "running",
        last_agent_run_finished_at: campaignResultSummary.finished_at,
        last_agent_run_result: campaignResultSummary,
        agent_daily_job_limit: dailyJobLimit,
        agent_daily_email_limit: dailyEmailLimit,
        agent_hourly_email_limit: hourlyEmailLimit,
        test_mode: testMode,
        test_recipient_email: testRecipient,
      });

      results.push(campaignResultSummary);
    }

    return reply({
      ok: true,
      function: "applix-agent-orchestrator",
      mode: testMode ? "test" : "production",
      checked_campaigns: campaignResult.data?.length || 0,
      active_agent_campaigns: campaigns.length,
      agent_days: agentDays,
      daily_job_limit: dailyJobLimit,
      daily_email_limit: dailyEmailLimit,
      hourly_email_limit: hourlyEmailLimit,
      test_recipient_email: testMode ? testRecipient : null,
      ran_at: now.toISOString(),
      results,
    });
  } catch (error) {
    return reply({
      ok: false,
      function: "applix-agent-orchestrator",
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : null,
    }, 500);
  }
});
