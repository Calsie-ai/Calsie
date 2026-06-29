import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

/**
 * Simple flexible object type.
 * Supabase rows can contain many different columns, so this lets us safely read dynamic fields.
 */
type Row = Record<string, any>;

/**
 * AuthContext tells the function who is calling it.
 *
 * mode: "cron"
 * - Backend scheduler / Supabase cron / n8n / admin backend is calling.
 * - This can process multiple campaigns.
 *
 * mode: "user"
 * - A signed-in Supabase user is calling from frontend.
 * - This can only process that user's own campaign.
 */
type AuthContext =
  | { mode: "cron"; user_id: null }
  | { mode: "user"; user_id: string };

/**
 * Fallback Supabase project URL.
 * Production should still use SUPABASE_URL from Edge Function secrets.
 */
const PROJECT_URL = "https://bnshgtrqbfuphhhdgccs.supabase.co";

/**
 * How many days a launched Applix campaign is allowed to keep running.
 * Example: 10 means the campaign can send emails for up to 10 days after launch.
 */
const DEFAULT_AGENT_DAYS = 10;

/**
 * Default number of emails the scheduler can send in one run/hour.
 * Example: 4 means it sends maximum 4 emails per scheduler run by default.
 */
const DEFAULT_HOURLY_LIMIT = 4;

/**
 * Default number of emails allowed per campaign per day.
 * Example: 100 means one campaign should not send more than 100 emails in a day.
 */
const DEFAULT_DAILY_LIMIT = 100;

/**
 * Maximum number of times one queue row/email can be retried after failure.
 * Example: 3 means if sending fails 3 times, the scheduler stops retrying that email.
 */
const DEFAULT_MAX_ATTEMPTS = 3;

/**
 * Maximum hourly limit when a normal signed-in user manually triggers the scheduler.
 * This protects the app from a user clicking a button and sending too many emails at once.
 */
const USER_MAX_HOURLY_LIMIT = 4;

/**
 * Maximum daily limit when a normal signed-in user triggers sending for their own campaign.
 * Even if the frontend asks for more, the backend will cap it at 100.
 */
const USER_MAX_DAILY_LIMIT = 100;

/**
 * Maximum hourly limit when the backend cron job runs the scheduler.
 * Cron can process more than a manual user click because it is controlled by the backend.
 */
const CRON_MAX_HOURLY_LIMIT = 10;

/**
 * Maximum daily limit when the backend cron job runs the scheduler.
 * Keeps cron from sending more than 100 emails per campaign per day.
 */
const CRON_MAX_DAILY_LIMIT = 100;

/**
 * Read an environment variable from Supabase Edge Function secrets.
 */
function env(name: string) {
  return Deno.env.get(name) ?? "";
}

/**
 * Finds the Supabase service role key.
 *
 * Supports multiple names because your project has used different names before:
 * - SUPABASE_SERVICE_ROLE_KEY
 * - SERVICE_ROLE_KEY
 * - APPLIX_SERVICE_ROLE_KEY
 * - SUPABASE_SECRET_KEYS
 *
 * Important:
 * Service role key must only exist in backend/Edge Function secrets.
 * Never expose it in frontend.
 */
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

/**
 * Supabase URL used by this function.
 * Uses Edge Function secret first, then fallback PROJECT_URL.
 */
const SUPABASE_URL = env("SUPABASE_URL") || PROJECT_URL;

/**
 * Service role key used for backend database updates.
 * This allows the function to update campaigns/outreach_queue safely after checking auth.
 */
const SUPABASE_SERVICE_ROLE_KEY = firstSecretKey();

/**
 * Secret used by backend cron/scheduler.
 *
 * This is NOT for signed users.
 * This is for Supabase cron, n8n, Vercel cron, or backend services.
 */
const CRON_SECRET = env("CRON_SECRET") || env("APPLIX_CRON_SECRET");

/**
 * Gmail sending function name.
 *
 * For safe testing:
 * GMAIL_SEND_FUNCTION_NAME=gmail-send-test
 *
 * For real production later:
 * GMAIL_SEND_FUNCTION_NAME=gmail-send
 */
const GMAIL_SEND_FUNCTION_NAME =
  env("GMAIL_SEND_FUNCTION_NAME") || "gmail-send-test";

/**
 * Test email used when test_mode=true.
 * In test mode, all emails go here instead of real company emails.
 */
const TEST_RECIPIENT_EMAIL =
  env("TEST_RECIPIENT_EMAIL") || "hostsajan@gmail.com";

/**
 * CORS headers allow browser/frontend requests.
 *
 * This is needed if your signed-in user clicks a button in the frontend
 * and calls this Edge Function directly.
 */
const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers":
    "authorization, x-client-info, apikey, content-type, x-applix-cron-secret",
};

/**
 * Standard JSON response helper.
 */
function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      ...corsHeaders,
      "content-type": "application/json",
    },
  });
}

/**
 * Converts any value to clean text.
 * If empty, returns fallback.
 */
function txt(value: unknown, fallback = "") {
  if (value === undefined || value === null) return fallback;

  const text = String(value).trim();

  return text || fallback;
}

/**
 * Converts input to a safe number within min/max.
 *
 * Example:
 * num(input.hourly_limit, 4, 1, 10)
 * means:
 * - use input.hourly_limit if valid
 * - otherwise use 4
 * - never below 1
 * - never above 10
 */
function num(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value ?? fallback);

  if (!Number.isFinite(parsed)) return fallback;

  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

/**
 * Converts true/false input safely.
 *
 * This fixes URL/query problems like:
 * dry_run=false
 *
 * Without this, "false" can behave like true because it is a non-empty string.
 */
function bool(value: unknown, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;

  if (value === true || value === "true" || value === "1" || value === 1) {
    return true;
  }

  if (value === false || value === "false" || value === "0" || value === 0) {
    return false;
  }

  return fallback;
}

/**
 * Extract Bearer token from Authorization header.
 *
 * Example:
 * Authorization: Bearer abc123
 *
 * Returns:
 * abc123
 */
function bearerToken(req: Request) {
  const authHeader = req.headers.get("authorization") || "";

  return authHeader.replace(/^Bearer\s+/i, "").trim();
}

/**
 * Checks who is calling the function.
 *
 * There are two allowed ways:
 *
 * 1. Cron/backend:
 *    Authorization: Bearer CRON_SECRET
 *    or x-applix-cron-secret: CRON_SECRET
 *
 * 2. Signed user:
 *    Authorization: Bearer USER_SUPABASE_ACCESS_TOKEN
 *
 * Signed user can only run their own campaign.
 * Cron can process multiple campaigns.
 */
async function getAuthContext(
  req: Request,
  supabase: ReturnType<typeof createClient>
): Promise<AuthContext | null> {
  const token = bearerToken(req);
  const cronHeader = req.headers.get("x-applix-cron-secret") || "";

  /**
   * Backend cron mode.
   */
  if (CRON_SECRET && (token === CRON_SECRET || cronHeader === CRON_SECRET)) {
    return {
      mode: "cron",
      user_id: null,
    };
  }

  /**
   * No token means unauthorized.
   */
  if (!token) return null;

  /**
   * Signed user mode.
   * Supabase validates the user's JWT and gives us the user id.
   */
  const userResult = await supabase.auth.getUser(token);

  if (userResult.error || !userResult.data?.user?.id) {
    return null;
  }

  return {
    mode: "user",
    user_id: userResult.data.user.id,
  };
}

/**
 * Adds days to a date.
 * Used to stop campaign after agentDays.
 */
function addDays(date: Date, days: number) {
  const next = new Date(date);

  next.setUTCDate(next.getUTCDate() + days);

  return next;
}

/**
 * Returns today's start time in UTC.
 * Used to count how many emails were already sent today.
 */
function startOfUtcDay(date: Date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
}

/**
 * Picks email subject from outreach_queue row.
 * Supports multiple possible column names.
 */
function pickSubject(row: Row) {
  return txt(
    row.subject ||
      row.email_subject ||
      row.draft_subject ||
      row.title,
    "Applix email"
  );
}

/**
 * Picks email body from outreach_queue row.
 * Supports multiple possible column names.
 */
function pickBody(row: Row) {
  return txt(
    row.email_body ||
      row.body ||
      row.draft_body ||
      row.message ||
      row.content,
    "Hi,\n\nThis email was prepared by Applix.\n\nRegards,\nApplix"
  );
}

/**
 * Picks the real recipient email from outreach_queue row.
 *
 * Used only when test_mode=false.
 */
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

/**
 * Decides whether campaign is still allowed to run.
 *
 * Conditions:
 * - outreach.enabled must not be false
 * - campaign must be inside allowed agent days
 * - launched_at/starts_at/created_at must be valid
 */
function shouldCampaignRun(campaign: Row, now: Date, agentDays: number) {
  const outreach = campaign.outreach || {};

  if (outreach.enabled === false) return false;

  const launchedAtRaw = txt(
    outreach.launched_at ||
      outreach.starts_at ||
      campaign.launched_at ||
      campaign.created_at,
    now.toISOString()
  );

  const launchedAt = new Date(launchedAtRaw);

  if (Number.isNaN(launchedAt.getTime())) return false;

  if (now.getTime() > addDays(launchedAt, agentDays).getTime()) {
    return false;
  }

  return true;
}

/**
 * Which outreach_queue statuses are allowed to be picked.
 *
 * testMode=true:
 * - only test queue statuses are processed
 *
 * testMode=false:
 * - production statuses are processed
 */
function queueStatusesForMode(testMode: boolean) {
  if (testMode) {
    return [
      "ready_to_send_test",
      "queued_test",
      "ready_for_test_send",
    ];
  }

  return [
    "approved",
    "ready_to_send",
    "queued",
    "pending",
    "ready",
  ];
}

/**
 * Status used while sending.
 */
function sendingStatus(testMode: boolean) {
  return testMode ? "sending_test" : "sending";
}

/**
 * Status used after successful send.
 */
function sentStatus(testMode: boolean) {
  return testMode ? "sent_test" : "sent";
}

/**
 * Status used after failed send.
 */
function failedStatus(testMode: boolean) {
  return testMode ? "send_failed_test" : "send_failed";
}

/**
 * Calls the Gmail send function.
 *
 * This function does not directly send email.
 * It forwards the prepared email to:
 * - gmail-send-test
 * - or gmail-send
 *
 * depending on GMAIL_SEND_FUNCTION_NAME.
 */
async function callGmailSend(payload: Row) {
  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/${GMAIL_SEND_FUNCTION_NAME}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: SUPABASE_SERVICE_ROLE_KEY,
      },
      body: JSON.stringify(payload),
    }
  );

  const data = await response.json().catch(() => ({}));

  return {
    ok: response.ok && data?.ok !== false,
    status: response.status,
    data,
  };
}

/**
 * Main Supabase Edge Function.
 */
Deno.serve(async (req) => {
  try {
    /**
     * Browser preflight request.
     * Needed for frontend calls.
     */
    if (req.method === "OPTIONS") {
      return new Response("ok", {
        status: 200,
        headers: corsHeaders,
      });
    }

    /**
     * Only GET and POST are allowed.
     */
    if (req.method !== "POST" && req.method !== "GET") {
      return reply(
        {
          ok: false,
          error: "Use GET or POST.",
        },
        405
      );
    }

    /**
     * Make sure backend secrets exist.
     */
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return reply(
        {
          ok: false,
          error: "Missing Supabase service configuration.",
        },
        500
      );
    }

    /**
     * Create Supabase admin client.
     * This uses service role key, so auth checks must happen before user-specific work.
     */
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
      },
    });

    /**
     * Check whether caller is:
     * - cron/backend
     * - signed user
     * - unauthorized
     */
    const auth = await getAuthContext(req, supabase);

    if (!auth) {
      return reply(
        {
          ok: false,
          error: "Unauthorized. Use signed user token or CRON_SECRET.",
        },
        401
      );
    }

    /**
     * Read input.
     *
     * POST:
     * body JSON
     *
     * GET:
     * URL params like ?dry_run=true&campaign_id=...
     */
    const input =
      req.method === "POST"
        ? await req.json().catch(() => ({}))
        : Object.fromEntries(new URL(req.url).searchParams.entries());

    const now = new Date();

    /**
     * campaign_id:
     * - Required for signed user.
     * - Optional for cron, because cron can process multiple campaigns.
     */
    const campaignId = txt(input.campaign_id);

    if (auth.mode === "user" && !campaignId) {
      return reply(
        {
          ok: false,
          error: "campaign_id is required when a signed user runs the scheduler.",
        },
        400
      );
    }

    /**
     * test_mode=true:
     * - send to TEST_RECIPIENT_EMAIL only
     *
     * test_mode=false:
     * - send to real company/recipient email
     */
    const requestedTestMode = bool(input.test_mode, true);

    /**
     * dry_run=true:
     * - check queue
     * - claim/check rows
     * - do not call Gmail send
     */
    const dryRun = bool(input.dry_run, false);

    /**
     * How many days this campaign can run after launch/start.
     */
    const agentDays = num(input.agent_days, DEFAULT_AGENT_DAYS, 1, 30);

    /**
     * User and cron have different maximum limits.
     *
     * Signed user:
     * - safer smaller manual send
     *
     * Cron:
     * - controlled backend batch
     */
    const maxHourlyLimit =
      auth.mode === "cron" ? CRON_MAX_HOURLY_LIMIT : USER_MAX_HOURLY_LIMIT;

    const maxDailyLimit =
      auth.mode === "cron" ? CRON_MAX_DAILY_LIMIT : USER_MAX_DAILY_LIMIT;

    /**
     * Daily limit, capped by auth mode.
     */
    const dailyLimit = num(
      input.daily_limit,
      DEFAULT_DAILY_LIMIT,
      1,
      maxDailyLimit
    );

    /**
     * Hourly/run limit, capped by auth mode.
     */
    const hourlyLimit = num(
      input.hourly_limit,
      Math.floor(dailyLimit / 24) || DEFAULT_HOURLY_LIMIT,
      1,
      maxHourlyLimit
    );

    /**
     * Maximum retries for failed queue row.
     */
    const maxAttempts = num(
      input.max_attempts,
      DEFAULT_MAX_ATTEMPTS,
      1,
      10
    );

    /**
     * Where test emails go when test_mode=true.
     */
    const testRecipient = txt(
      input.test_recipient_email,
      TEST_RECIPIENT_EMAIL
    );

    /**
     * Load campaigns.
     *
     * Cron:
     * - can load up to 25 active/scheduled/launched campaigns.
     *
     * Signed user:
     * - can load only one campaign
     * - campaign must belong to that user
     */
    let campaignQuery = supabase
      .from("campaigns")
      .select("id,user_id,status,outreach,created_at,updated_at")
      .in("status", ["active", "scheduled", "launched"])
      .order("created_at", {
        ascending: true,
      })
      .limit(auth.mode === "cron" ? 25 : 1);

    /**
     * If campaign_id is provided, only process that campaign.
     */
    if (campaignId) {
      campaignQuery = campaignQuery.eq("id", campaignId);
    }

    /**
     * Signed user can only process their own campaign.
     */
    if (auth.mode === "user") {
      campaignQuery = campaignQuery.eq("user_id", auth.user_id);
    }

    const campaignResult = await campaignQuery;

    if (campaignResult.error) {
      return reply(
        {
          ok: false,
          error: "Failed to load campaigns.",
          details: campaignResult.error.message,
        },
        500
      );
    }

    const campaigns = campaignResult.data || [];

    /**
     * If signed user asked for campaign but it does not belong to them,
     * return 404 instead of processing anything.
     */
    if (auth.mode === "user" && campaignId && campaigns.length === 0) {
      return reply(
        {
          ok: false,
          error: "Campaign not found or does not belong to signed user.",
        },
        404
      );
    }

    /**
     * Filter campaigns that are actually allowed to run now.
     */
    const activeCampaigns = campaigns.filter((campaign: Row) =>
      shouldCampaignRun(campaign, now, agentDays)
    );

    /**
     * Final test mode value.
     */
    const testMode = requestedTestMode;

    /**
     * Decide which queue statuses are allowed for this mode.
     */
    const allowedQueueStatuses = queueStatusesForMode(testMode);

    /**
     * Results returned to frontend/cron.
     */
    const results: Row[] = [];

    /**
     * Counters for this scheduler run.
     */
    let sentCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    let claimedCount = 0;

    /**
     * Process each active campaign.
     */
    for (const campaign of activeCampaigns) {
      /**
       * Stop if this run already hit hourly limit.
       */
      if (sentCount >= hourlyLimit) break;

      const outreach = campaign.outreach || {};

      /**
       * Gmail sender identifier.
       *
       * This should connect the campaign/user to the Gmail account/token.
       */
      const senderUserIdentifier = txt(
        input.sender_user_identifier ||
          outreach.sender_user_identifier ||
          outreach.gmail_user_identifier ||
          campaign.user_id
      );

      if (!senderUserIdentifier) {
        failedCount += 1;

        results.push({
          campaign_id: campaign.id,
          ok: false,
          error: "Missing sender_user_identifier.",
        });

        continue;
      }

      /**
       * Count how many emails were already sent today for this campaign.
       */
      const sentTodayResult = await supabase
        .from("outreach_queue")
        .select("id", {
          count: "exact",
          head: true,
        })
        .eq("campaign_id", campaign.id)
        .eq("status", sentStatus(testMode))
        .gte("sent_at", startOfUtcDay(now).toISOString());

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

      /**
       * Remaining sends allowed today.
       */
      const remainingDaily = Math.max(0, dailyLimit - alreadySentToday);

      /**
       * Remaining sends allowed this run.
       */
      const remainingHourly = Math.max(0, hourlyLimit - sentCount);

      /**
       * Final remaining amount for this campaign in this run.
       */
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

      /**
       * Load queue rows ready to send.
       *
       * attempt_count must be below maxAttempts.
       * This prevents retrying broken rows forever.
       */
      const queueResult = await supabase
        .from("outreach_queue")
        .select("*")
        .eq("campaign_id", campaign.id)
        .in("status", allowedQueueStatuses)
        .lt("attempt_count", maxAttempts)
        .order("created_at", {
          ascending: true,
        })
        .limit(remaining);

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
        results.push({
          campaign_id: campaign.id,
          ok: true,
          sent: 0,
          message: "No queued rows found.",
        });

        continue;
      }

      /**
       * Process queue rows one by one.
       */
      for (const row of rows) {
        if (sentCount >= hourlyLimit) break;

        const subject = pickSubject(row);
        const body = pickBody(row);

        /**
         * In test mode, force recipient to test email.
         * In production mode, use real recipient from row.
         */
        const realRecipient = pickRealRecipient(row);
        const recipient = testMode ? testRecipient : realRecipient;

        /**
         * Increase attempt count.
         */
        const attemptCount = Number(row.attempt_count || 0) + 1;

        /**
         * If no recipient exists, mark row as failed.
         */
        if (!recipient) {
          skippedCount += 1;

          await supabase
            .from("outreach_queue")
            .update({
              status: failedStatus(testMode),
              review_status: failedStatus(testMode),
              updated_at: now.toISOString(),
              attempt_count: attemptCount,
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

        /**
         * Claim the row.
         *
         * Important:
         * This prevents duplicate sending.
         *
         * It only updates the row if the status is still allowed.
         * If another scheduler already took the row, this update returns nothing.
         */
        const claimResult = await supabase
          .from("outreach_queue")
          .update({
            recipient_email: recipient,
            status: dryRun ? row.status : sendingStatus(testMode),
            review_status: dryRun ? "dry_run_checked" : sendingStatus(testMode),
            updated_at: now.toISOString(),
            attempt_count: attemptCount,
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
          .in("status", allowedQueueStatuses)
          .select("id")
          .maybeSingle();

        if (claimResult.error || !claimResult.data) {
          skippedCount += 1;

          results.push({
            campaign_id: campaign.id,
            queue_id: row.id,
            ok: true,
            skipped: true,
            reason: "Row was already claimed or status changed.",
          });

          continue;
        }

        claimedCount += 1;

        /**
         * dry_run means:
         * - row was checked
         * - but no Gmail send happened
         */
        if (dryRun) {
          skippedCount += 1;

          results.push({
            campaign_id: campaign.id,
            queue_id: row.id,
            ok: true,
            dry_run: true,
            auth_mode: auth.mode,
            test_mode: testMode,
            recipient,
            subject,
          });

          continue;
        }

        /**
         * Actually call Gmail sending function.
         */
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

        /**
         * If Gmail send succeeded, mark row as sent.
         */
        if (gmailResult.ok) {
          sentCount += 1;

          await supabase
            .from("outreach_queue")
            .update({
              recipient_email: recipient,
              status: sentStatus(testMode),
              review_status: sentStatus(testMode),
              sent_at: now.toISOString(),
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
          /**
           * If Gmail send failed, mark row as failed and store error.
           */
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

        /**
         * Add row result to response.
         */
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

      /**
       * Save scheduler summary back into campaign.outreach.
       *
       * This is useful for dashboard/debugging.
       */
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
              mode: dryRun
                ? "dry_run"
                : testMode
                  ? "test_send"
                  : "production_send",
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

    /**
     * Final response.
     */
    return reply({
      ok: true,
      function: "applix-agent-email-scheduler",
      mode: dryRun
        ? "dry_run"
        : testMode
          ? "test_send"
          : "production_send",
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
    /**
     * Catch unexpected errors.
     */
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
