import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type Row = Record<string, any>;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("APPLIX_SERVICE_ROLE_KEY") || "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function text(value: unknown) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function safeInteger(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function authorized(req: Request) {
  if (!CRON_SECRET) return false;
  const bearer = req.headers.get("authorization") || "";
  const secret = req.headers.get("x-applix-cron-secret") || "";
  return bearer === `Bearer ${CRON_SECRET}` || secret === CRON_SECRET;
}

async function callFunction(name: string, body: Row) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
    },
    body: JSON.stringify(body),
  });
  const raw = await response.text().catch(() => "");
  let payload: Row = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = { raw };
  }
  return { ok: response.ok && payload.ok !== false, status: response.status, payload };
}

async function updateRun(supabase: ReturnType<typeof createClient>, runId: string, patch: Row) {
  const result = await supabase
    .from("orchestrator_runs")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", runId)
    .select("*")
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return result.data as Row;
}

async function loadOrCreateRun(supabase: ReturnType<typeof createClient>, campaignId: string, input: Row) {
  const runDate = text(input.run_date) || new Date().toISOString().slice(0, 10);
  const runType = text(input.run_type) || "daily_catalogue";
  const trigger = text(input.trigger) || "manual_test";
  const existing = await supabase
    .from("orchestrator_runs")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("run_date", runDate)
    .eq("run_type", runType)
    .maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data?.id) return existing.data as Row;

  const inserted = await supabase.from("orchestrator_runs").insert({
    campaign_id: campaignId,
    run_date: runDate,
    run_type: runType,
    trigger,
    status: "queued",
    current_stage: "queued",
    counters: {},
    stage_results: {},
  }).select("*").maybeSingle();
  if (inserted.error) throw new Error(inserted.error.message);
  if (!inserted.data?.id) throw new Error("Unable to create orchestrator run");
  return inserted.data as Row;
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return reply({ ok: false, error: "Use POST" }, 405);
    if (!authorized(req)) return reply({ ok: false, error: "Unauthorized orchestrator request" }, 401);
    if (!SUPABASE_URL || !SERVICE_KEY) return reply({ ok: false, error: "Missing Supabase service configuration" }, 500);

    const input = await req.json().catch(() => ({})) as Row;
    const campaignId = text(input.campaign_id);
    if (!campaignId) return reply({ ok: false, error: "campaign_id is required" }, 400);

    const dryRun = input.dry_run !== false;
    const allowedCampaignId = text(input.allowed_campaign_id);
    if (!dryRun && allowedCampaignId !== campaignId) {
      return reply({ ok: false, error: "Non-dry-run execution requires allowed_campaign_id to exactly equal campaign_id" }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const campaignResult = await supabase
      .from("campaigns")
      .select("id,user_id,name,location,target_business_type,search,filters,outreach,status,created_at")
      .eq("id", campaignId)
      .maybeSingle();
    if (campaignResult.error) throw new Error(campaignResult.error.message);
    if (!campaignResult.data) return reply({ ok: false, error: "Campaign not found" }, 404);

    const run = await loadOrCreateRun(supabase, campaignId, input);
    const runId = run.id as string;
    await updateRun(supabase, runId, {
      status: "running",
      current_stage: "compiling_search_plan",
      started_at: run.started_at || new Date().toISOString(),
      completed_at: null,
      heartbeat_at: new Date().toISOString(),
      last_error: null,
    });

    const compiler = await callFunction("compile-campaign-search-plan", {
      campaign_id: campaignId,
      daily_target: safeInteger(input.daily_target, 24, 1, 24),
      catalogue_age_days: safeInteger(input.catalogue_age_days, 30, 1, 30),
      minimum_match_score: safeInteger(input.minimum_match_score, 70, 0, 100),
    });
    if (!compiler.ok) throw new Error(`compile-campaign-search-plan failed: ${JSON.stringify(compiler.payload).slice(0, 1200)}`);
    const plan = compiler.payload.plan as Row;

    await updateRun(supabase, runId, {
      current_stage: "checking_catalogue",
      search_plan: plan,
      stage_results: { compile_search_plan: compiler.payload },
      heartbeat_at: new Date().toISOString(),
    });

    const firstMatch = await callFunction("match-campaign-jobs", {
      campaign_id: campaignId,
      orchestrator_run_id: runId,
      search_plan: plan,
      limit: safeInteger(input.catalogue_scan_limit, 500, 1, 500),
    });
    if (!firstMatch.ok) throw new Error(`Initial catalogue match failed: ${JSON.stringify(firstMatch.payload).slice(0, 1200)}`);

    const dailyTarget = Number(plan.daily_target || 24);
    const reusableBeforeFetch = Number(firstMatch.payload.eligible || 0);
    const shortageBeforeFetch = Math.max(0, dailyTarget - reusableBeforeFetch);
    const fetchPool = shortageBeforeFetch > 0 ? Math.min(200, Math.max(100, shortageBeforeFetch * 5)) : 0;

    if (dryRun) {
      const finalRun = await updateRun(supabase, runId, {
        status: "partially_completed",
        current_stage: shortageBeforeFetch > 0 ? "fetching_jobs" : "selecting_jobs",
        completed_at: new Date().toISOString(),
        counters: {
          daily_target: dailyTarget,
          catalogue_checked: Number(firstMatch.payload.catalogue_checked || 0),
          catalogue_eligible: reusableBeforeFetch,
          catalogue_rejected: Number(firstMatch.payload.rejected || 0),
          shortage: shortageBeforeFetch,
          planned_fetch_pool: fetchPool,
        },
        stage_results: {
          compile_search_plan: compiler.payload,
          catalogue_match_before_fetch: firstMatch.payload,
          shortage_decision: {
            dry_run: true,
            outscraper_required: shortageBeforeFetch > 0,
            shortage: shortageBeforeFetch,
            fetch_pool: fetchPool,
          },
        },
      });
      return reply({
        ok: true,
        function: "calsie-campaign-orchestrator-v2",
        version: "phase_2_dry_run",
        dry_run: true,
        production_pipeline_unchanged: true,
        run: finalRun,
      });
    }

    let fetchResult: Row | null = null;
    let finalMatch = firstMatch;
    if (shortageBeforeFetch > 0) {
      await updateRun(supabase, runId, {
        current_stage: "fetching_jobs",
        heartbeat_at: new Date().toISOString(),
      });
      const fetched = await callFunction("fetch-job-catalogue-v2", {
        campaign_id: campaignId,
        orchestrator_run_id: runId,
        search_plan: plan,
        fetch_pool_limit: fetchPool,
      });
      if (!fetched.ok) throw new Error(`fetch-job-catalogue-v2 failed: ${JSON.stringify(fetched.payload).slice(0, 1600)}`);
      fetchResult = fetched.payload;

      await updateRun(supabase, runId, {
        current_stage: "matching_jobs",
        heartbeat_at: new Date().toISOString(),
      });
      finalMatch = await callFunction("match-campaign-jobs", {
        campaign_id: campaignId,
        orchestrator_run_id: runId,
        search_plan: plan,
        limit: safeInteger(input.catalogue_scan_limit, 500, 1, 500),
      });
      if (!finalMatch.ok) throw new Error(`Post-fetch catalogue match failed: ${JSON.stringify(finalMatch.payload).slice(0, 1200)}`);
    }

    await updateRun(supabase, runId, {
      current_stage: "selecting_jobs",
      heartbeat_at: new Date().toISOString(),
    });
    const selector = await callFunction("select-daily-job-batch", {
      campaign_id: campaignId,
      orchestrator_run_id: runId,
      daily_target: dailyTarget,
    });
    if (!selector.ok) throw new Error(`select-daily-job-batch failed: ${JSON.stringify(selector.payload).slice(0, 1200)}`);

    const eligibleAfterFetch = Number(finalMatch.payload.eligible || 0);
    const selectedCount = Number(selector.payload.selected_count || 0);
    const shortageAfterFetch = Math.max(0, dailyTarget - selectedCount);
    const finalRun = await updateRun(supabase, runId, {
      status: selectedCount > 0 ? "waiting_for_enrichment" : "needs_attention",
      current_stage: selectedCount > 0 ? "enrichment_queued" : "failed",
      completed_at: new Date().toISOString(),
      counters: {
        daily_target: dailyTarget,
        catalogue_checked_before_fetch: Number(firstMatch.payload.catalogue_checked || 0),
        catalogue_reused: reusableBeforeFetch,
        shortage_before_fetch: shortageBeforeFetch,
        planned_fetch_pool: fetchPool,
        fetched: Number(fetchResult?.fetched_count || 0),
        normalized: Number(fetchResult?.normalized_count || 0),
        new_jobs_stored: Number(fetchResult?.new_jobs_stored || 0),
        existing_jobs_updated: Number(fetchResult?.existing_jobs_updated || 0),
        duplicates_skipped: Number(fetchResult?.duplicates_skipped || 0),
        eligible_after_fetch: eligibleAfterFetch,
        selected: selectedCount,
        held_for_later: Number(selector.payload.held_for_later_count || 0),
        shortage_after_fetch: shortageAfterFetch,
      },
      stage_results: {
        compile_search_plan: compiler.payload,
        catalogue_match_before_fetch: firstMatch.payload,
        fetch_catalogue: fetchResult,
        catalogue_match_after_fetch: finalMatch.payload,
        selection: selector.payload,
      },
      last_error: selectedCount > 0 ? null : "No eligible jobs were selected after catalogue fetch and matching",
    });

    return reply({
      ok: selectedCount > 0,
      function: "calsie-campaign-orchestrator-v2",
      version: "phase_2_store_match_select",
      dry_run: false,
      production_pipeline_unchanged: true,
      enrichment_not_started: true,
      run: finalRun,
      selected_jobs: selector.payload.selected_jobs || [],
      next_required_stage: selectedCount > 0 ? "enqueue-company-enrichment" : null,
    }, selectedCount > 0 ? 200 : 422);
  } catch (error) {
    return reply({
      ok: false,
      function: "calsie-campaign-orchestrator-v2",
      version: "phase_2_store_match_select",
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});
