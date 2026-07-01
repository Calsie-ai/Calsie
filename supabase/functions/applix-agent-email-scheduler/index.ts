import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type Row = Record<string, any>;

type AuthContext =
  | { mode: "cron"; user_id: null }
  | { mode: "user"; user_id: string };

const PROJECT_URL = "https://bnshgtrqbfuphhhdgccs.supabase.co";
const DEFAULT_AGENT_DAYS = 10;
const DEFAULT_HOURLY_LIMIT = 4;
const DEFAULT_DAILY_LIMIT = 100;
const DEFAULT_MAX_ATTEMPTS = 3;
const USER_MAX_HOURLY_LIMIT = 4;
const USER_MAX_DAILY_LIMIT = 100;
const CRON_MAX_HOURLY_LIMIT = 10;
const CRON_MAX_DAILY_LIMIT = 100;

function env(name: string) {
  return Deno.env.get(name) ?? "";
}

function firstSecretKey() {
  const direct =
    env("SUPABASE_SERVICE_ROLE_KEY") ||
    env("SERVICE_ROLE_KEY") ||
    env("APPLIX_SERVICE_ROLE_KEY");

  if (direct) return direct;

  const modern = env("SUPABASE_SECRET_KEYS");
  if (!modern) return "";

  try {
    const parsed = JSON.parse(modern);
    if (Array.isArray(parsed)) {
      return parsed[0]?.secret_key || parsed[0]?.key || parsed[0] || "";
    }
    if (typeof parsed === "object" && parsed !== null) {
      return parsed.secret_key || parsed.key || String(Object.values(parsed)[0] || "");
    }
  } catch {
    return modern;
  }

  return "";
}

const SUPABASE_URL = env("SUPABASE_URL") || PROJECT_URL;
const SUPABASE_SERVICE_ROLE_KEY = firstSecretKey();
const CRON_SECRET = env("CRON_SECRET") || env("APPLIX_CRON_SECRET");
const GMAIL_SEND_FUNCTION_NAME = env("GMAIL_SEND_FUNCTION_NAME") || "gmail-send-test";
const TEST_RECIPIENT_EMAIL = env("TEST_RECIPIENT_EMAIL") || "hostsajan@gmail.com";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers":
    "authorization, x-client-info, apikey, content-type, x-applix-cron-secret",
};

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      ...corsHeaders,
      "content-type": "application/json",
    },
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

function bool(value: unknown, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (value === true || value === "true" || value === "1" || value === 1) return true;
  if (value === false || value === "false" || value === "0" || value === 0) return false;
  return fallback;
}

function bearerToken(req: Request) {
  const authHeader = req.headers.get("authorization") || "";
  return authHeader.replace(/^Bearer\s+/i, "").trim();
}

async function getAuthContext(
  req: Request,
  supabase: ReturnType<typeof createClient>
): Promise<AuthContext | null> {
  const token = bearerToken(req);
  const cronHeader = req.headers.get("x-applix-cron-secret") || "";

  if (CRON_SECRET && (token === CRON_SECRET || cronHeader === CRON_SECRET)) {
    return { mode: "cron", user_id: null };
  }

  if (!token) return null;

  const userResult = await supabase.auth.getUser(token);
  if (userResult.error || !userResult.data?.user?.id) return null;

  return { mode: "user", user_id: userResult.data.user.id };
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function pickSubject(row: Row) {
  return txt(row.subject || row.email_subject || row.draft_subject || row.title, "Applix email");
}

function pickBody(row: Row) {
  return txt(
    row.email_body || row.body || row.draft_body || row.message || row.content,
    "Hi,\n\nThis email was prepared by Applix.\n\nRegards,\nApplix"
  );
}

function pickRealRecipient(row: Row) {
  return txt(
    row.recipient_email ||
      row.to ||
      row.email ||
      row.contact_email ||
      row.company_email ||
      row.lead_email
  );
}

function shouldCampaignRun(campaign: Row, now: Date, agentDays: number) {
  const outreach = campaign.outreach || {};
  if (outreach.enabled === false) return false;

  const launchedAtRaw = txt(
    outreach.launched_at || outreach.starts_at || campaign.launched_at || campaign.created_at,
    now.toISOString()
  );

  const launchedAt = new Date(launchedAtRaw);
  if (Number.isNaN(launchedAt.getTime())) return false;
  return now.getTime() <= addDays(launchedAt, agentDays).getTime();
}

function queueStatusesForMode(testMode: boolean) {
  return testMode ? ["ready_to_send_test", "queued_test", "ready_for_test_send"] : ["approved", "queued"];
}

function sendingStatus(testMode: boolean) {
  return testMode ? "sending_test" : "sending";
}

function sentStatus(testMode: boolean) {
  return testMode ? "sent_test" : "sent";
}

function failedStatus(testMode: boolean) {
  return testMode ? "send_failed_test" : "send_failed";
}

async function callGmailSend(payload: Row) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${GMAIL_SEND_FUNCTION_NAME}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: SUPABASE_SERVICE_ROLE_KEY,
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));
  return { ok: response.ok && data?.ok !== false, status: response.status, data };
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response("ok", { status: 200, headers: corsHeaders });
    }

    if (req.method !== "POST" && req.method !== "GET") {
      return reply({ ok: false, error: "Use GET or POST." }, 405);
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return reply({ ok: false, error: "Missing Supabase service configuration." }, 500);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const auth = await getAuthContext(req, supabase);
    if (!auth) {
      return reply({ ok: false, error: "Unauthorized. Use signed user token or CRON_SECRET." }, 401);
    }

    const input =
      req.method === "POST"
        ? await req.json().catch(() => ({}))
        : Object.fromEntries(new URL(req.url).searchParams.entries());

    const now = new Date();
    const campaignId = txt(input.campaign_id);

    if (auth.mode === "user" && !campaignId) {
      return reply({ ok: false, error: "campaign_id is required when a signed user runs the scheduler." }, 400);
    }

    const requestedTestMode = bool(input.test_mode, true);
    const dryRun = bool(input.dry_run, false);
    const agentDays = num(input.agent_days, DEFAULT_AGENT_DAYS, 1, 30);
    const maxHourlyLimit = auth.mode === "cron" ? CRON_MAX_HOURLY_LIMIT : USER_MAX_HOURLY_LIMIT;
    const maxDailyLimit = auth.mode === "cron" ? CRON_MAX_DAILY_LIMIT : USER_MAX_DAILY_LIMIT;
    const dailyLimit = num(input.daily_limit, DEFAULT_DAILY_LIMIT, 1, maxDailyLimit);
    const hourlyLimit = num(
      input.hourly_limit,
      Math.floor(dailyLimit / 24) || DEFAULT_HOURLY_LIMIT,
      1,
      maxHourlyLimit
    );
    const maxAttempts = num(input.max_attempts, DEFAULT_MAX_ATTEMPTS, 1, 10);
    const testRecipient = txt(input.test_recipient_email, TEST_RECIPIENT_EMAIL);

    let campaignQuery = supabase
      .from("campaigns")
      .select("id,user_id,status,outreach,created_at,updated_at")
      .in("status", ["active", "scheduled", "launched"])
      .order("created_at", { ascending: true })
      .limit(auth.mode === "cron" ? 25 : 1);

    if (campaignId) campaignQuery = campaignQuery.eq("id", campaignId);
    if (auth.mode === "user") campaignQuery = campaignQuery.eq("user_id", auth.user_id);

    const campaignResult = await campaignQuery;
    if (campaignResult.error) {
      return reply({ ok: false, error: "Failed to load campaigns.", details: campaignResult.error.message }, 500);
    }

    const campaigns = campaignResult.data || [];
    if (auth.mode === "user" && campaignId && campaigns.length === 0) {
      return reply({ ok: false, error: "Campaign not found or does not belong to signed user." }, 404);
    }

    const activeCampaigns = campaigns.filter((campaign: Row) => shouldCampaignRun(campaign, now, agentDays));
    const testMode = requestedTestMode;
    const allowedQueueStatuses = queueStatusesForMode(testMode);
    const results: Row[] = [];

    let sentCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    let claimedCount = 0;

    for (const campaign of activeCampaigns) {
      if (sentCount >= hourlyLimit) break;

      const outreach = campaign.outreach || {};
      const senderUserIdentifier = txt(
        input.sender_user_identifier ||
          outreach.sender_user_identifier ||
          outreach.gmail_user_identifier ||
          campaign.user_id
      );

      if (!senderUserIdentifier) {
        failedCount += 1;
        results.push({ campaign_id: campaign.id, ok: false, error: "Missing sender_user_identifier." });
        continue;
      }

      const sentTodayResult = await supabase
        .from("outreach_queue")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campaign.id)
        .eq("status", sentStatus(testMode))
        .gte("updated_at", startOfUtcDay(now).toISOString());

      if (sentTodayResult.error) {
        failedCount += 1;
        results.push({
          campaign_id: campaign.id,
          ok: false,
          error: "Failed to count today's sent emails.",
          details: sentTodayResult.error.message,
        });
        continue;
      }

      const alreadySentToday = sentTodayResult.count || 0;
      const remainingDaily = Math.max(0, dailyLimit - alreadySentToday);
      const remainingHourly = Math.max(0, hourlyLimit - sentCount);
      const remaining = Math.min(remainingDaily, remainingHourly);

      if (remaining <= 0) {
        skippedCount += 1;
        results.push({
          campaign_id: campaign.id,
          ok: true,
          skipped: true,
          reason: "Daily or hourly limit reached.",
          already_sent_today: alreadySentToday,
          daily_limit: dailyLimit,
          hourly_limit: hourlyLimit,
        });
        continue;
      }

      let queueQuery = supabase
        .from("outreach_queue")
        .select("*")
        .eq("campaign_id", campaign.id)
        .in("status", allowedQueueStatuses)
        .lt("send_attempts", maxAttempts)
        .order("created_at", { ascending: true })
        .limit(remaining);

      if (!testMode) queueQuery = queueQuery.eq("review_status", "approved");

      const queueResult = await queueQuery;
      if (queueResult.error) {
        failedCount += 1;
        results.push({
          campaign_id: campaign.id,
          ok: false,
          error: "Failed to load outreach queue.",
          details: queueResult.error.message,
        });
        continue;
      }

      const rows = queueResult.data || [];
      if (!rows.length) {
        results.push({ campaign_id: campaign.id, ok: true, sent: 0, message: "No queued rows found." });
        continue;
      }

      for (const row of rows) {
        if (sentCount >= hourlyLimit) break;

        const subject = pickSubject(row);
        const body = pickBody(row);
        const realRecipient = pickRealRecipient(row);
        const recipient = testMode ? testRecipient : realRecipient;
        const sendAttempts = Number(row.send_attempts || 0) + 1;

        if (dryRun) {
          skippedCount += 1;
          results.push({
            campaign_id: campaign.id,
            queue_id: row.id,
            ok: true,
            dry_run: true,
            auth_mode: auth.mode,
            test_mode: testMode,
            would_send: Boolean(recipient),
            recipient,
            subject,
          });
          continue;
        }

        if (!recipient) {
          skippedCount += 1;
          await supabase
            .from("outreach_queue")
            .update({
              status: failedStatus(testMode),
              review_status: failedStatus(testMode),
              updated_at: now.toISOString(),
              send_attempts: sendAttempts,
              last_error: "Missing recipient email.",
              ai_notes: {
                ...(row.ai_notes || {}),
                scheduler: "applix-agent-email-scheduler",
                auth_mode: auth.mode,
                test_mode: testMode,
                dry_run: dryRun,
                error: "Missing recipient email.",
              },
            })
            .eq("id", row.id);

          results.push({
            campaign_id: campaign.id,
            queue_id: row.id,
            ok: false,
            skipped: true,
            error: "Missing recipient email.",
          });
          continue;
        }

        let claimQuery = supabase
          .from("outreach_queue")
          .update({
            recipient_email: recipient,
            status: sendingStatus(testMode),
            review_status: sendingStatus(testMode),
            updated_at: now.toISOString(),
            send_attempts: sendAttempts,
            ai_notes: {
              ...(row.ai_notes || {}),
              scheduler: "applix-agent-email-scheduler",
              auth_mode: auth.mode,
              triggered_by_user_id: auth.mode === "user" ? auth.user_id : null,
              test_mode: testMode,
              dry_run: dryRun,
              sender_user_identifier: senderUserIdentifier,
              gmail_send_function_name: GMAIL_SEND_FUNCTION_NAME,
              agent_days: agentDays,
              hourly_limit: hourlyLimit,
              daily_limit: dailyLimit,
              claimed_at: now.toISOString(),
            },
          })
          .eq("id", row.id)
          .in("status", allowedQueueStatuses);

        if (!testMode) claimQuery = claimQuery.eq("review_status", "approved");

        const claimResult = await claimQuery.select("id").maybeSingle();
        if (claimResult.error || !claimResult.data) {
          skippedCount += 1;
          results.push({
            campaign_id: campaign.id,
            queue_id: row.id,
            ok: true,
            skipped: true,
            reason: "Row was already claimed, approval changed, or status changed.",
          });
          continue;
        }

        claimedCount += 1;

        const gmailResult = await callGmailSend({
          queue_id: row.id,
          campaign_id: campaign.id,
          user_identifier: senderUserIdentifier,
          sender_user_identifier: senderUserIdentifier,
          to: recipient,
          recipient_email: recipient,
          subject,
          body,
          text: body,
          test_mode: testMode,
          source: "applix-agent-email-scheduler",
        });

        if (gmailResult.ok) {
          sentCount += 1;
          await supabase
            .from("outreach_queue")
            .update({
              recipient_email: recipient,
              status: sentStatus(testMode),
              review_status: sentStatus(testMode),
              updated_at: now.toISOString(),
              last_error: null,
              ai_notes: {
                ...(row.ai_notes || {}),
                scheduler: "applix-agent-email-scheduler",
                auth_mode: auth.mode,
                triggered_by_user_id: auth.mode === "user" ? auth.user_id : null,
                test_mode: testMode,
                sender_user_identifier: senderUserIdentifier,
                gmail_send_function_name: GMAIL_SEND_FUNCTION_NAME,
                gmail_result: gmailResult.data,
                sent_at: now.toISOString(),
              },
            })
            .eq("id", row.id);
        } else {
          failedCount += 1;
          await supabase
            .from("outreach_queue")
            .update({
              recipient_email: recipient,
              status: failedStatus(testMode),
              review_status: failedStatus(testMode),
              updated_at: now.toISOString(),
              last_error: JSON.stringify(gmailResult.data || {}),
              ai_notes: {
                ...(row.ai_notes || {}),
                scheduler: "applix-agent-email-scheduler",
                auth_mode: auth.mode,
                triggered_by_user_id: auth.mode === "user" ? auth.user_id : null,
                test_mode: testMode,
                sender_user_identifier: senderUserIdentifier,
                gmail_send_function_name: GMAIL_SEND_FUNCTION_NAME,
                gmail_error: gmailResult.data,
                gmail_status: gmailResult.status,
              },
            })
            .eq("id", row.id);
        }

        results.push({
          campaign_id: campaign.id,
          queue_id: row.id,
          ok: gmailResult.ok,
          auth_mode: auth.mode,
          test_mode: testMode,
          recipient,
          sender_user_identifier: senderUserIdentifier,
          subject,
          gmail_function: GMAIL_SEND_FUNCTION_NAME,
          gmail_status: gmailResult.status,
          gmail_result: gmailResult.data,
        });
      }

      await supabase
        .from("campaigns")
        .update({
          outreach: {
            ...outreach,
            sender_user_identifier: senderUserIdentifier,
            agent_days: agentDays,
            agent_email_hourly_limit: hourlyLimit,
            agent_email_daily_limit: dailyLimit,
            max_attempts: maxAttempts,
            last_email_scheduler_run_at: now.toISOString(),
            last_email_scheduler_result: {
              mode: dryRun ? "dry_run" : testMode ? "test_send" : "production_send",
              auth_mode: auth.mode,
              triggered_by_user_id: auth.mode === "user" ? auth.user_id : null,
              sent_count: sentCount,
              failed_count: failedCount,
              skipped_count: skippedCount,
              claimed_count: claimedCount,
              gmail_send_function_name: GMAIL_SEND_FUNCTION_NAME,
              test_recipient_email: testMode ? testRecipient : null,
              sender_user_identifier: senderUserIdentifier,
              ran_at: now.toISOString(),
            },
          },
          updated_at: now.toISOString(),
        })
        .eq("id", campaign.id);
    }

    return reply({
      ok: true,
      function: "applix-agent-email-scheduler",
      mode: dryRun ? "dry_run" : testMode ? "test_send" : "production_send",
      auth_mode: auth.mode,
      triggered_by_user_id: auth.mode === "user" ? auth.user_id : null,
      gmail_send_function_name: GMAIL_SEND_FUNCTION_NAME,
      test_mode: testMode,
      dry_run: dryRun,
      test_recipient_email: testMode ? testRecipient : null,
      agent_days: agentDays,
      hourly_limit: hourlyLimit,
      daily_limit: dailyLimit,
      max_attempts: maxAttempts,
      checked_campaigns: campaigns.length,
      active_campaigns: activeCampaigns.length,
      claimed_count: claimedCount,
      sent_count: sentCount,
      failed_count: failedCount,
      skipped_count: skippedCount,
      ran_at: now.toISOString(),
      results,
    });
  } catch (error) {
    return reply(
      {
        ok: false,
        function: "applix-agent-email-scheduler",
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : null,
      },
      500
    );
  }
});
