import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type Row = Record<string, any>;

const PROJECT_URL = "https://bnshgtrqbfuphhhdgccs.supabase.co";
const TEST_RECIPIENT_EMAIL = "hostsajan@gmail.com";
const DEFAULT_AGENT_DAYS = 10;
const DEFAULT_HOURLY_LIMIT = 4;
const DEFAULT_DAILY_LIMIT = 100;
const GMAIL_SEND_FUNCTION_NAME = Deno.env.get("GMAIL_SEND_FUNCTION_NAME") || "gmail-send-test";

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

function pickSubject(row: Row) {
  return txt(row.subject || row.email_subject || row.draft_subject || row.title, "Applix test email");
}

function pickBody(row: Row) {
  return txt(
    row.email_body || row.body || row.draft_body || row.message || row.content,
    "Hi,\n\nThis is a test email from your Applix launched agent.\n\nRegards,\nApplix"
  );
}

async function callGmailSendTest(payload: Row) {
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
    if (req.method !== "POST" && req.method !== "GET") {
      return reply({ ok: false, error: "Use GET or POST" }, 405);
    }

    if (!isAuthorized(req)) {
      return reply({ ok: false, error: "Unauthorized scheduler request." }, 401);
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return reply({ ok: false, error: "Missing Supabase service configuration." }, 500);
    }

    const input = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const now = new Date();
    const campaignId = txt(input.campaign_id);
    const testRecipient = txt(input.test_recipient_email, TEST_RECIPIENT_EMAIL);
    const agentDays = num(input.agent_days, DEFAULT_AGENT_DAYS, 1, 30);
    const dailyLimit = num(input.daily_limit, DEFAULT_DAILY_LIMIT, 1, 100);
    const hourlyLimit = num(input.hourly_limit, Math.floor(dailyLimit / 24) || DEFAULT_HOURLY_LIMIT, 1, 4);
    const dryRun = Boolean(input.dry_run ?? false);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    let campaignQuery = supabase
      .from("campaigns")
      .select("id,user_id,status,outreach,created_at,updated_at")
      .in("status", ["active", "scheduled", "launched"])
      .order("created_at", { ascending: true })
      .limit(25);

    if (campaignId) campaignQuery = campaignQuery.eq("id", campaignId);

    const campaignResult = await campaignQuery;
    if (campaignResult.error) {
      return reply({ ok: false, error: campaignResult.error.message }, 500);
    }

    const campaigns = campaignResult.data || [];
    const activeCampaigns = campaigns.filter((campaign: Row) => {
      const outreach = campaign.outreach || {};
      const launchedAt = new Date(txt(outreach.launched_at || outreach.starts_at || campaign.created_at, now.toISOString()));
      if (Number.isNaN(launchedAt.getTime())) return false;
      if (now.getTime() > addDays(launchedAt, agentDays).getTime()) return false;
      if (outreach.enabled === false) return false;
      return true;
    });

    const results: Row[] = [];
    let sentCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    for (const campaign of activeCampaigns) {
      if (sentCount >= hourlyLimit) break;

      const remaining = hourlyLimit - sentCount;
      const queueResult = await supabase
        .from("outreach_queue")
        .select("*")
        .eq("campaign_id", campaign.id)
        .in("status", ["ready_to_send_test", "queued_test", "queued", "pending", "ready"])
        .order("created_at", { ascending: true })
        .limit(remaining);

      if (queueResult.error) {
        results.push({ campaign_id: campaign.id, ok: false, error: queueResult.error.message });
        failedCount += 1;
        continue;
      }

      const rows = queueResult.data || [];
      if (!rows.length) {
        results.push({ campaign_id: campaign.id, ok: true, sent: 0, message: "No queued rows found." });
        continue;
      }

      for (const row of rows) {
        const subject = pickSubject(row);
        const body = pickBody(row);
        const attemptCount = Number(row.attempt_count || 0) + 1;

        await supabase
          .from("outreach_queue")
          .update({
            recipient_email: testRecipient,
            status: dryRun ? "ready_to_send_test" : "sending_test",
            review_status: "ready_for_test_send",
            updated_at: now.toISOString(),
            attempt_count: attemptCount,
            ai_notes: {
              ...(row.ai_notes || {}),
              test_mode: true,
              forced_test_recipient_email: testRecipient,
              gmail_send_function_name: GMAIL_SEND_FUNCTION_NAME,
              agent_scheduler: "applix-agent-email-scheduler",
              send_window_days: agentDays,
              hourly_limit: hourlyLimit,
              daily_limit: dailyLimit,
            },
          })
          .eq("id", row.id);

        if (dryRun) {
          skippedCount += 1;
          results.push({ campaign_id: campaign.id, queue_id: row.id, ok: true, dry_run: true, recipient: testRecipient, subject });
          continue;
        }

        const gmailResult = await callGmailSendTest({
          queue_id: row.id,
          campaign_id: campaign.id,
          user_identifier: campaign.user_id,
          user_id: campaign.user_id,
          to: testRecipient,
          recipient_email: testRecipient,
          subject,
          body,
          text: body,
          test_mode: true,
          source: "applix-agent-email-scheduler",
        });

        if (gmailResult.ok) {
          sentCount += 1;
          await supabase
            .from("outreach_queue")
            .update({
              recipient_email: testRecipient,
              status: "sent_test",
              review_status: "sent_test",
              sent_at: now.toISOString(),
              updated_at: now.toISOString(),
              ai_notes: {
                ...(row.ai_notes || {}),
                test_mode: true,
                forced_test_recipient_email: testRecipient,
                gmail_send_function_name: GMAIL_SEND_FUNCTION_NAME,
                gmail_result: gmailResult.data,
                agent_scheduler: "applix-agent-email-scheduler",
              },
            })
            .eq("id", row.id);
        } else {
          failedCount += 1;
          await supabase
            .from("outreach_queue")
            .update({
              recipient_email: testRecipient,
              status: "send_failed_test",
              review_status: "send_failed_test",
              updated_at: now.toISOString(),
              ai_notes: {
                ...(row.ai_notes || {}),
                test_mode: true,
                forced_test_recipient_email: testRecipient,
                gmail_send_function_name: GMAIL_SEND_FUNCTION_NAME,
                gmail_error: gmailResult.data,
                gmail_status: gmailResult.status,
                agent_scheduler: "applix-agent-email-scheduler",
              },
            })
            .eq("id", row.id);
        }

        results.push({
          campaign_id: campaign.id,
          queue_id: row.id,
          ok: gmailResult.ok,
          recipient: testRecipient,
          subject,
          gmail_function: GMAIL_SEND_FUNCTION_NAME,
          gmail_status: gmailResult.status,
          gmail_result: gmailResult.data,
        });
      }

      const outreach = campaign.outreach || {};
      await supabase
        .from("campaigns")
        .update({
          outreach: {
            ...outreach,
            agent_days: agentDays,
            agent_email_hourly_limit: hourlyLimit,
            agent_email_daily_limit: dailyLimit,
            last_email_scheduler_run_at: now.toISOString(),
            last_email_scheduler_result: {
              sent_count: sentCount,
              failed_count: failedCount,
              skipped_count: skippedCount,
              gmail_send_function_name: GMAIL_SEND_FUNCTION_NAME,
              test_recipient_email: testRecipient,
            },
          },
        })
        .eq("id", campaign.id);
    }

    return reply({
      ok: true,
      function: "applix-agent-email-scheduler",
      mode: dryRun ? "dry_run" : "gmail_send_test_batch",
      gmail_send_function_name: GMAIL_SEND_FUNCTION_NAME,
      test_recipient_email: testRecipient,
      agent_days: agentDays,
      hourly_limit: hourlyLimit,
      daily_limit: dailyLimit,
      checked_campaigns: campaigns.length,
      active_campaigns: activeCampaigns.length,
      sent_count: sentCount,
      failed_count: failedCount,
      skipped_count: skippedCount,
      ran_at: now.toISOString(),
      results,
    });
  } catch (error) {
    return reply({
      ok: false,
      function: "applix-agent-email-scheduler",
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : null,
    }, 500);
  }
});
