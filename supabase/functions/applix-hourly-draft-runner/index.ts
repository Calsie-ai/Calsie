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

async function saveHourlySummary(
  supabase: ReturnType<typeof createClient>,
  campaign: Row,
  summary: Row,
  markReleasedAt: boolean,
) {
  const outreach = parseJsonIfNeeded(campaign.outreach);
  const nextOutreach = {
    ...outreach,
    last_hourly_draft_result: summary,
    ...(markReleasedAt ? { last_hourly_draft_at: new Date().toISOString() } : {}),
  };

  const update = await supabase
    .from("campaigns")
    .update({ outreach: nextOutreach, updated_at: new Date().toISOString() })
    .eq("id", campaign.id);

  if (update.error) throw new Error(update.error.message);
}

async function releaseOneDraft(
  supabase: ReturnType<typeof createClient>,
  campaignId: string,
  nowIso: string,
) {
  const { data, error } = await supabase
    .from("outreach_queue")
    .select("id,campaign_id,job_id,recipient_email,subject,scheduled_send_at,status,review_status,send_window,created_at")
    .eq("campaign_id", campaignId)
    .eq("status", "draft")
    .eq("review_status", "ready_for_review")
    .lte("scheduled_send_at", nowIso)
    .order("scheduled_send_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) throw new Error(error.message);
  const draft = (data || [])[0];

  if (!draft) {
    return { released: false, reason: "no due draft found" };
  }

  const update = await supabase
    .from("outreach_queue")
    .update({
      status: "pending_user_approval",
      send_window: "released_for_review",
      updated_at: nowIso,
    })
    .eq("id", draft.id)
    .select("id,campaign_id,job_id,recipient_email,subject,status,review_status,send_window,scheduled_send_at")
    .single();

  if (update.error) throw new Error(update.error.message);

  return { released: true, draft: update.data };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "POST") return json({ ok: false, error: "Use POST" }, 405);
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !CRON_SECRET) {
      return json({ ok: false, error: "Missing hourly runner configuration" }, 500);
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
    const nowIso = now.toISOString();

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
        runner: "applix-hourly-draft-runner",
        campaign_id: campaign.id,
        scheduled_run: true,
      };

      if (!isScheduledAndActive(campaign)) continue;

      const minutesSinceLastRelease = minutesBetween(text(outreach.last_hourly_draft_at), now);
      if (!force && minutesSinceLastRelease < 55) {
        const summary = {
          ...baseSummary,
          ok: false,
          skipped: true,
          reason: "hourly draft release already ran less than 55 minutes ago",
          minutes_since_last_release: Math.floor(minutesSinceLastRelease),
        };
        await saveHourlySummary(supabase, campaign, summary, false);
        results.push(summary);
        continue;
      }

      const release = await releaseOneDraft(supabase, campaign.id, nowIso);
      const ok = Boolean(release.released);
      const summary = {
        ...baseSummary,
        ok,
        ...release,
      };

      await saveHourlySummary(supabase, campaign, summary, ok);
      results.push(summary);
    }

    return json({ ok: true, function: "applix-hourly-draft-runner", campaign_count: results.length, results });
  } catch (error) {
    return json({ ok: false, function: "applix-hourly-draft-runner", error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
