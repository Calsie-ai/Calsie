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

  return {
    ok: response.ok && payload.ok !== false,
    status: response.status,
    payload,
  };
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

  const inserted = await supabase
    .from("orchestrator_runs")
    .insert({
      campaign_id: campaignId,
      run_date: runDate,
      run_type: runType,
      trigger,
      status: "queued",
      current_stage: "queued",
      counters: {},
      stage_results: {},
      last_error: null,
    })
    .select("*")
    .maybeSingle();

  if (inserted.error) {
    if (inserted.error.code === "23505") {
      const raced = await supabase
        .from("orchestrator_runs")
        .select("*")
        .eq("campaign_id", campaignId)
        .eq("run_date", runDate)
        .eq("run_type", runType)
        .maybeSingle();
      if (raced.error) throw new Error(raced.error.message);
      if (raced.data?.id) return raced.data as Row;
    }
    throw new Error(inserted.error.message);
  }

  if (!inserted.data?.id) throw new Error("Unable to create or load orchestrator run");
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
      return reply({
        ok: false,
        error: "Non-dry-run execution requires allowed_campaign_id to exactly equal campaign_id",
      }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const campaignResult = await supabase
      .from("campaigns")
      .select("id,user_id,name,location,target_business_type,search,filters,outreach,status,created_at")
      .eq("id", campaignId)
      .maybeSingle();

    if (campaignResult.error) return reply({ ok: false, error: campaignResult.error.message }, 500);
    if (!campaignResult.data) return reply({ ok: false, error: "Campaign not found" }, 404);

    const run = await loadOrCreateRun(supabase, campaignId, input);
    const runId = run.id as string;
    const existingStage = text(run.current_stage) || "queued";
    const terminal = ["completed", "ready_for_review"].includes(existingStage);
    if (terminal && input.force_restart !== true) {
      return reply({
        ok: true,
        resumed: false,
        skipped: true,
        reason: `Run is already at terminal stage ${existingStage}`,
        run,
      });
    }

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

    if (!compiler.ok) {
      await updateRun(supabase, runId, {
        status: "needs_attention",
        current_stage: "failed",
        last_error: JSON.stringify(compiler.payload).slice(0, 2000),
        stage_results: { ...(run.stage_results || {}), compile_search_plan: compiler },
      });
      return reply({ ok: false, stage: "compiling_search_plan", run_id: runId, result: compiler }, 500);
    }

    const plan = compiler.payload.plan as Row;
    await updateRun(supabase, runId, {
      current_stage: "checking_catalogue",
      search_plan: plan,
      stage_results: { ...(run.stage_results || {}), compile_search_plan: compiler.payload },
      heartbeat_at: new Date().toISOString(),
    });

    const matcher = await callFunction("match-campaign-jobs", {
      campaign_id: campaignId,
      orchestrator_run_id: runId,
      search_plan: plan,
      limit: safeInteger(input.catalogue_scan_limit, 300, 1, 500),
    });

    if (!matcher.ok) {
      await updateRun(supabase, runId, {
        status: "needs_attention",
        current_stage: "failed",
        last_error: JSON.stringify(matcher.payload).slice(0, 2000),
        stage_results: {
          ...(run.stage_results || {}),
          compile_search_plan: compiler.payload,
          catalogue_match: matcher,
        },
      });
      return reply({ ok: false, stage: "checking_catalogue", run_id: runId, result: matcher }, 500);
    }

    const reusable = Number(matcher.payload.eligible || 0);
    const dailyTarget = Number(plan.daily_target || 24);
    const shortage = Math.max(0, dailyTarget - reusable);
    const fetchPool = Math.min(200, Math.max(100, shortage * 5));

    await updateRun(supabase, runId, {
      current_stage: "calculating_shortage",
      counters: {
        catalogue_checked: Number(matcher.payload.catalogue_checked || 0),
        catalogue_eligible: reusable,
        catalogue_rejected: Number(matcher.payload.rejected || 0),
        daily_target: dailyTarget,
        shortage,
        planned_fetch_pool: shortage > 0 ? fetchPool : 0,
      },
      stage_results: {
        compile_search_plan: compiler.payload,
        catalogue_match: matcher.payload,
      },
      heartbeat_at: new Date().toISOString(),
    });

    if (dryRun) {
      const dryRunState = shortage > 0 ? "fetching_jobs" : "selecting_jobs";
      const finalRun = await updateRun(supabase, runId, {
        status: "partially_completed",
        current_stage: dryRunState,
        completed_at: new Date().toISOString(),
        stage_results: {
          compile_search_plan: compiler.payload,
          catalogue_match: matcher.payload,
          shortage_decision: {
            dry_run: true,
            outscraper_required: shortage > 0,
            shortage,
            fetch_pool: shortage > 0 ? fetchPool : 0,
          },
        },
      });

      return reply({
        ok: true,
        function: "calsie-campaign-orchestrator-v2",
        version: "phase_1_dry_run",
        dry_run: true,
        production_pipeline_unchanged: true,
        run: finalRun,
      });
    }

    if (shortage > 0) {
      const waitingRun = await updateRun(supabase, runId, {
        status: "partially_completed",
        current_stage: "fetching_jobs",
        last_error: "Phase 1 stops before external fetching. Enable fetch-job-catalogue-v2 only after Darwin dry-run validation.",
        completed_at: new Date().toISOString(),
      });

      return reply({
        ok: true,
        function: "calsie-campaign-orchestrator-v2",
        version: "phase_1_guarded",
        dry_run: false,
        run: waitingRun,
        next_required_stage: "fetch-job-catalogue-v2",
      }, 202);
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

    if (!selector.ok) {
      await updateRun(supabase, runId, {
        status: "needs_attention",
        current_stage: "failed",
        last_error: JSON.stringify(selector.payload).slice(0, 2000),
      });
      return reply({ ok: false, stage: "selecting_jobs", run_id: runId, result: selector }, 500);
    }

    const selectedCount = Number(selector.payload.selected_count || 0);
    const finalRun = await updateRun(supabase, runId, {
      status: selectedCount > 0 ? "waiting_for_enrichment" : "needs_attention",
      current_stage: selectedCount > 0 ? "enrichment_queued" : "failed",
      completed_at: new Date().toISOString(),
      stage_results: {
        compile_search_plan: compiler.payload,
        catalogue_match: matcher.payload,
        selection: selector.payload,
      },
      counters: {
        catalogue_checked: Number(matcher.payload.catalogue_checked || 0),
        catalogue_eligible: reusable,
        catalogue_rejected: Number(matcher.payload.rejected || 0),
        daily_target: dailyTarget,
        shortage: 0,
        selected: selectedCount,
        held_for_later: Number(selector.payload.held_for_later_count || 0),
      },
    });

    return reply({
      ok: selectedCount > 0,
      function: "calsie-campaign-orchestrator-v2",
      version: "phase_1_guarded",
      dry_run: false,
      production_pipeline_unchanged: true,
      run: finalRun,
      selected_jobs: selector.payload.selected_jobs || [],
      next_required_stage: selectedCount > 0 ? "enqueue-company-enrichment" : null,
    }, selectedCount > 0 ? 200 : 422);
  } catch (error) {
    return reply({
      ok: false,
      function: "calsie-campaign-orchestrator-v2",
      version: "phase_1_guarded",
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});
