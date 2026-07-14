import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type Row = Record<string, any>;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ||
  "https://bnshgtrqbfuphhhdgccs.supabase.co";

function env(name: string) {
  return Deno.env.get(name) || "";
}

function firstSecretKey() {
  const direct = env("SUPABASE_SERVICE_ROLE_KEY") || env("SERVICE_ROLE_KEY") ||
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
      return parsed.secret_key || parsed.key ||
        String(Object.values(parsed)[0] || "");
    }
  } catch {
    return modern;
  }

  return "";
}

const SUPABASE_SERVICE_ROLE_KEY = firstSecretKey();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

function txt(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const clean = String(value).trim();
  return clean ? clean : null;
}

function safeLimit(value: unknown, fallback = 100) {
  const n = Number(value ?? fallback);
  return Math.max(1, Math.min(100, Number.isFinite(n) ? n : fallback));
}

function bearer(req: Request) {
  return (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "")
    .trim();
}

async function resolveCaller(req: Request, body: Row) {
  const token = bearer(req);

  if (SUPABASE_SERVICE_ROLE_KEY && token === SUPABASE_SERVICE_ROLE_KEY) {
    return { userId: txt(body.user_id), internal: true };
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    global: {
      headers: { Authorization: req.headers.get("authorization") || "" },
    },
    auth: { persistSession: false },
  });

  const { data, error } = await userClient.auth.getUser();
  if (error || !data?.user?.id) return { userId: null, internal: false };
  return { userId: data.user.id, internal: false };
}

async function callFunction(name: string, body: Row) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: SUPABASE_SERVICE_ROLE_KEY,
    },
    body: JSON.stringify(body),
  });

  const text = await response.text().catch(() => "");
  let payload: any = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }

  return {
    ok: response.ok && !payload?.error,
    status: response.status,
    payload,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return reply({ ok: false, error: "Use POST" }, 405);
    }
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return reply({
        ok: false,
        error:
          "Missing Supabase service role configuration. Add SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEYS in Edge Function secrets.",
      }, 500);
    }

    const input = (await req.json().catch(() => ({}))) as Row;
    const campaignId = txt(input.campaign_id);
    if (!campaignId) {
      return reply({ ok: false, error: "campaign_id is required" }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const caller = await resolveCaller(req, input);
    if (!caller.userId && !caller.internal) {
      return reply({ ok: false, error: "Please sign in again." }, 401);
    }

    let campaignQuery = supabase.from("campaigns").select("*").eq(
      "id",
      campaignId,
    );
    if (!caller.internal && caller.userId) {
      campaignQuery = campaignQuery.eq("user_id", caller.userId);
    }

    const campaignResult = await campaignQuery.maybeSingle();
    if (!campaignResult) {
      return reply(
        { ok: false, error: "Campaign query returned undefined" },
        500,
      );
    }
    if (campaignResult.error) {
      return reply({ ok: false, error: campaignResult.error.message }, 500);
    }

    const campaign = campaignResult.data;
    if (!campaign?.id) {
      return reply({
        ok: false,
        error: "Campaign not found for this user",
        campaign_id: campaignId,
      }, 404);
    }

    const userIdentifier = txt(campaign.user_id) || txt(caller.userId) ||
      txt(input.user_id);
    if (!userIdentifier) {
      return reply({
        ok: false,
        error: "Campaign has no user_id. Production requires a real user.",
      }, 400);
    }

    const resultsLimit = safeLimit(input.results_limit, 100);
    const queueLimit = safeLimit(
      input.queue_limit || input.target_email_count ||
        campaign.outreach?.target_email_count || campaign.outreach?.daily_cap ||
        campaign.outreach?.daily_email_limit || 100,
      100,
    );
    const minLeadScore = Number(input.min_lead_score ?? 70);

    const scraper = await callFunction("run-outscraper-campaigns", {
      campaign_id: campaignId,
      results_limit: resultsLimit,
      dry_run: false,
      save_to_database: true,
      exact_private_company_only: input.exact_private_company_only !== false,
    });

    const leadCounts = await supabase
      .from("campaign_leads")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId);

    const leadsWithEmail = await supabase
      .from("campaign_leads")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .not("found_email", "is", null);

    const generator = await callFunction("generate-outreach-drafts", {
      campaign_id: campaignId,
      limit: queueLimit,
      dry_run: false,
      min_lead_score: minLeadScore,
    });

    const queueResult = await supabase
      .from("outreach_queue")
      .select(
        "id,campaign_lead_id,status,review_status,recipient_company,subject,created_at",
      )
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: false })
      .limit(queueLimit);

    if (!queueResult) {
      return reply({ ok: false, error: "Queue query returned undefined" }, 500);
    }
    if (queueResult.error) {
      return reply({ ok: false, error: queueResult.error.message }, 500);
    }

    const queueRows = queueResult.data || [];
    const queueIds = queueRows.map((row: Row) => row.id).filter(Boolean);

    let readyForReviewCount = 0;
    let queuePatchError: string | null = null;

    if (queueIds.length > 0) {
      const patchResult = await supabase
        .from("outreach_queue")
        .update({
          status: "pending_user_approval",
          review_status: "ready_for_review",
          send_window: "manual_review",
          updated_at: new Date().toISOString(),
        })
        .in("id", queueIds)
        .neq("review_status", "approved")
        .select("id");

      if (patchResult.error) queuePatchError = patchResult.error.message;
      else readyForReviewCount = patchResult.data?.length || 0;
    }

    const finalReady = await supabase
      .from("outreach_queue")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .eq("review_status", "ready_for_review");

    const now = new Date().toISOString();
    const campaignUpdate = await supabase
      .from("campaigns")
      .update({
        status: "active",
        updated_at: now,
        outreach: {
          ...(campaign.outreach || {}),
          active: true,
          scheduled: true,
          started_at: campaign.outreach?.started_at || now,
          mode: "production",
          test_mode: false,
          agent_status: "ready_for_review",
          last_production_launch: {
            launched_at: now,
            function: "launch-applix-campaign",
            version: "production_launcher_v3_active_lifecycle",
            scraper_ok: scraper.ok,
            scraper_status: scraper.status,
            generator_ok: generator.ok,
            generator_status: generator.status,
            results_limit: resultsLimit,
            queue_limit: queueLimit,
            min_lead_score: minLeadScore,
            campaign_leads_count: leadCounts.count || 0,
            leads_with_email_count: leadsWithEmail.count || 0,
            ready_for_review_count: finalReady.count || 0,
          },
        },
      })
      .eq("id", campaignId)
      .select("id,status,outreach")
      .maybeSingle();

    const lifecycleError = campaignUpdate.error?.message ||
      (!campaignUpdate.data?.id
        ? "Campaign lifecycle update returned no row"
        : null);
    const stageErrors = [
      ...(scraper.ok ? [] : [
        `run-outscraper-campaigns failed: ${
          JSON.stringify(scraper.payload).slice(0, 800)
        }`,
      ]),
      ...(generator.ok ? [] : [
        `generate-outreach-drafts failed: ${
          JSON.stringify(generator.payload).slice(0, 800)
        }`,
      ]),
      ...(queuePatchError ? [`Queue patch failed: ${queuePatchError}`] : []),
    ];
    const errors = [
      ...stageErrors,
      ...(lifecycleError ? [`Campaign update failed: ${lifecycleError}`] : []),
    ];
    const lifecycleOk = !lifecycleError;

    return reply({
      ok: lifecycleOk,
      lifecycle_ok: lifecycleOk,
      pipeline_ok: stageErrors.length === 0,
      function: "launch-applix-campaign",
      version: "production_launcher_v3_active_lifecycle",
      production_mode: true,
      test_mode: false,
      sends_emails_now: false,
      campaign_id: campaignId,
      campaign_status: campaignUpdate.data?.status || campaign.status,
      outreach_started_at: campaignUpdate.data?.outreach?.started_at ||
        campaign.outreach?.started_at || null,
      user_identifier: userIdentifier,
      scraper_ok: scraper.ok,
      scraper_status: scraper.status,
      generator_ok: generator.ok,
      generator_status: generator.status,
      counts: {
        campaign_leads_count: leadCounts.count || 0,
        leads_with_email_count: leadsWithEmail.count || 0,
        queue_rows_checked: queueRows.length,
        queue_rows_set_ready_for_review: readyForReviewCount,
        final_ready_for_review_count: finalReady.count || 0,
      },
      sample_queue: queueRows.slice(0, 5).map((row: Row) => ({
        id: row.id,
        company: row.recipient_company,
        subject: row.subject,
        status: row.status,
        review_status: row.review_status,
      })),
      privacy: {
        employer_email_user_visible: false,
        employer_email_storage: "private tables only",
        next_step: "User reviews and approves drafts before sending.",
      },
      errors,
    }, lifecycleError ? 500 : stageErrors.length ? 207 : 200);
  } catch (error) {
    return reply({
      ok: false,
      function: "launch-applix-campaign",
      version: "production_launcher_v3_active_lifecycle",
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : null,
    }, 500);
  }
});
