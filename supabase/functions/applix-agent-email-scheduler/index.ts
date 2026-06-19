import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type Row = Record<string, any>;

const PROJECT_URL = "https://bnshgtrqbfuphhhdgccs.supabase.co";
const TEST_RECIPIENT_EMAIL = "hostsajan@gmail.com";
const DEFAULT_AGENT_DAYS = 10;
const DEFAULT_HOURLY_LIMIT = 4;
const DEFAULT_DAILY_LIMIT = 100;

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
    let preparedCount = 0;

    for (const campaign of activeCampaigns) {
      if (preparedCount >= hourlyLimit) break;

      const remaining = hourlyLimit - preparedCount;
      const queueResult = await supabase
        .from("outreach_queue")
        .select("id,campaign_id,recipient_email,status,review_status,attempt_count,created_at,ai_notes")
        .eq("campaign_id", campaign.id)
        .in("status", ["queued_test", "queued", "pending", "ready"])
        .order("created_at", { ascending: true })
        .limit(remaining);

      if (queueResult.error) {
        results.push({ campaign_id: campaign.id, ok: false, error: queueResult.error.message });
        continue;
      }

      const rows = queueResult.data || [];
      if (!rows.length) {
        results.push({ campaign_id: campaign.id, ok: true, prepared: 0, message: "No queued rows found." });
        continue;
      }

      for (const row of rows) {
        const updateResult = await supabase
          .from("outreach_queue")
          .update({
            recipient_email: testRecipient,
            status: "ready_to_send_test",
            review_status: "ready_for_test_send",
            updated_at: now.toISOString(),
            ai_notes: {
              ...(row.ai_notes || {}),
              test_mode: true,
              forced_test_recipient_email: testRecipient,
              agent_scheduler: "applix-agent-email-scheduler",
              send_window_days: agentDays,
              hourly_limit: hourlyLimit,
              daily_limit: dailyLimit,
              safety_note: "This function schedules the next test batch only. It does not perform the final email provider send.",
            },
          })
          .eq("id", row.id)
          .select("id,campaign_id,recipient_email,status,review_status")
          .maybeSingle();

        if (updateResult.error) {
          results.push({ campaign_id: campaign.id, queue_id: row.id, ok: false, error: updateResult.error.message });
          continue;
        }

        preparedCount += 1;
        results.push({ campaign_id: campaign.id, queue_id: row.id, ok: true, prepared_for: testRecipient, row: updateResult.data });
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
            last_email_scheduler_prepared_count: preparedCount,
          },
        })
        .eq("id", campaign.id);
    }

    return reply({
      ok: true,
      function: "applix-agent-email-scheduler",
      mode: "prepare_next_test_batch",
      test_recipient_email: testRecipient,
      agent_days: agentDays,
      hourly_limit: hourlyLimit,
      daily_limit: dailyLimit,
      checked_campaigns: campaigns.length,
      active_campaigns: activeCampaigns.length,
      prepared_count: preparedCount,
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
