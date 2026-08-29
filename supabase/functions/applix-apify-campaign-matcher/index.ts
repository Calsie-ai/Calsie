import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type Row = Record<string, any>;

const VERSION = "apify_template_catalogue_v1";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  Deno.env.get("APPLIX_SERVICE_ROLE_KEY") || "";
const CRON_SECRET = Deno.env.get("APPLIX_CRON_SECRET") ||
  Deno.env.get("CRON_SECRET") || "";
const INTERNAL_SECRET = Deno.env.get("APPLIX_INTERNAL_SECRET") || "";

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function text(value: unknown) {
  return value == null ? "" : String(value).trim();
}

function integer(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.max(min, Math.min(max, Math.floor(parsed)))
    : fallback;
}

function authorized(req: Request) {
  const bearer = req.headers.get("authorization") || "";
  const cron = req.headers.get("x-applix-cron-secret") || "";
  return bearer === `Bearer ${SERVICE_KEY}` &&
    (!CRON_SECRET || cron === CRON_SECRET);
}

async function callFunction(name: string, body: Row) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    authorization: `Bearer ${SERVICE_KEY}`,
    apikey: SERVICE_KEY,
  };
  if (INTERNAL_SECRET) headers["x-applix-internal-secret"] = INTERNAL_SECRET;

  const response = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const raw = await response.text();
  let payload: Row = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = { raw };
  }
  if (!response.ok || payload.ok === false) {
    throw new Error(`${name} failed (${response.status}): ${JSON.stringify(payload).slice(0, 1600)}`);
  }
  return payload;
}

Deno.serve(async (req) => {
  let runId = "";
  try {
    if (req.method !== "POST") return reply({ ok: false, error: "Use POST" }, 405);
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return reply({ ok: false, error: "Missing Supabase service configuration" }, 500);
    }
    if (!authorized(req)) return reply({ ok: false, error: "Unauthorized" }, 401);

    const input = await req.json().catch(() => ({})) as Row;
    const runDate = text(input.run_date) || new Intl.DateTimeFormat("en-CA", {
      timeZone: "Australia/Sydney",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const db = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const claim = await db.rpc("claim_apify_template_campaign", {
      p_run_date: runDate,
    });
    if (claim.error) throw new Error(claim.error.message);
    const claimed = (claim.data || [])[0] as Row | undefined;
    if (!claimed) {
      return reply({
        ok: true,
        function: "applix-apify-campaign-matcher",
        version: VERSION,
        run_date: runDate,
        claimed: 0,
        complete_for_today: true,
      });
    }

    runId = text(claimed.run_id);
    const campaignId = text(claimed.campaign_id);
    const poolKey = text(claimed.pool_key);

    const campaignResult = await db
      .from("campaigns")
      .select("id,search,outreach,status")
      .eq("id", campaignId)
      .single();
    if (campaignResult.error) throw new Error(campaignResult.error.message);
    const campaign = campaignResult.data as Row;
    const search = campaign.search || {};
    const outreach = campaign.outreach || {};
    const dailyTarget = integer(
      input.daily_target || search.daily_job_limit || outreach.daily_job_limit,
      24,
      1,
      24,
    );

    const compiled = await callFunction("compile-campaign-search-plan", {
      campaign_id: campaignId,
      daily_target: dailyTarget,
      catalogue_age_days: integer(input.catalogue_age_days, 30, 1, 30),
      minimum_match_score: integer(input.minimum_match_score, 70, 0, 100),
    });

    const matched = await callFunction("match-campaign-jobs", {
      campaign_id: campaignId,
      orchestrator_run_id: runId,
      search_plan: compiled.plan,
      limit: integer(input.catalogue_scan_limit, 500, 1, 500),
    });

    const eligibleIds = Array.isArray(matched.eligible_job_ids)
      ? matched.eligible_job_ids
      : [];
    if (eligibleIds.length) {
      const now = new Date().toISOString();
      const marked = await db
        .from("campaign_job_matches")
        .update({
          ai_status: "completed",
          ai_verdict: "pass",
          ai_model: "deterministic_apify_template_v1",
          ai_prompt_version: "none",
          ai_confidence: 1,
          ai_reason: "Passed deterministic campaign filters in its mapped Apify template catalogue",
          ai_judged_at: now,
          updated_at: now,
        })
        .eq("campaign_id", campaignId)
        .eq("job_pool", poolKey)
        .in("job_id", eligibleIds)
        .eq("filter_status", "eligible");
      if (marked.error) throw new Error(marked.error.message);
    }

    const selected = await callFunction("select-daily-job-batch", {
      campaign_id: campaignId,
      orchestrator_run_id: runId,
      daily_target: dailyTarget,
      include_company_fallback: true,
    });
    const selectedJobs = Number(selected.selected_job_count || 0);
    const selectedCompanies = Number(selected.selected_company_count || 0);
    const selectedTotal = Math.min(
      dailyTarget,
      Number(selected.selected_count || selectedJobs + selectedCompanies),
    );
    const now = new Date().toISOString();
    const completed = await db
      .from("orchestrator_runs")
      .update({
        status: selectedTotal > 0 ? "ready_for_review" : "needs_attention",
        current_stage: selectedTotal > 0 ? "ready_for_review" : "failed",
        search_plan: compiled.plan,
        counters: {
          daily_target: dailyTarget,
          job_pool: poolKey,
          catalogue_checked: Number(matched.catalogue_checked || 0),
          deterministic_eligible: Number(matched.eligible || 0),
          selected_jobs: selectedJobs,
          selected_company_opportunities: selectedCompanies,
          combined_selected: selectedTotal,
          shortage_after_fallback: Math.max(0, dailyTarget - selectedTotal),
        },
        stage_results: {
          mode: VERSION,
          catalogue_matching: matched,
          final_selection: selected,
        },
        completed_at: now,
        heartbeat_at: now,
        last_error: selectedTotal > 0
          ? null
          : `No suitable ${poolKey} jobs or unused company contacts were available`,
        updated_at: now,
      })
      .eq("id", runId);
    if (completed.error) throw new Error(completed.error.message);

    return reply({
      ok: selectedTotal > 0,
      function: "applix-apify-campaign-matcher",
      version: VERSION,
      campaign_id: campaignId,
      run_id: runId,
      job_pool: poolKey,
      catalogue_checked: Number(matched.catalogue_checked || 0),
      eligible: Number(matched.eligible || 0),
      selected_jobs: selectedJobs,
      selected_company_opportunities: selectedCompanies,
      selected_total: selectedTotal,
      sends_emails_now: false,
    }, selectedTotal > 0 ? 200 : 422);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (runId && SUPABASE_URL && SERVICE_KEY) {
      const db = createClient(SUPABASE_URL, SERVICE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const now = new Date().toISOString();
      await db.from("orchestrator_runs").update({
        status: "needs_attention",
        current_stage: "failed",
        completed_at: now,
        heartbeat_at: now,
        last_error: message.slice(0, 4000),
        updated_at: now,
      }).eq("id", runId);
    }
    return reply({
      ok: false,
      function: "applix-apify-campaign-matcher",
      version: VERSION,
      error: message,
    }, 500);
  }
});
