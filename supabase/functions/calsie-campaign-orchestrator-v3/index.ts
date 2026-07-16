import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type Row = Record<string, any>;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("APPLIX_SERVICE_ROLE_KEY") || "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
const ACTIVE_STATUSES = new Set(["active", "launched", "scheduled"]);
const ATTEMPTS = [
  { number: 1, calls: [100] },
  { number: 2, calls: [150, 150] },
  { number: 3, calls: [175, 175, 175, 175] },
];

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
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.floor(parsed))) : fallback;
}

function authorized(req: Request) {
  const bearer = req.headers.get("authorization") || "";
  const secret = req.headers.get("x-applix-cron-secret") || "";
  return Boolean(CRON_SECRET) && (bearer === `Bearer ${CRON_SECRET}` || secret === CRON_SECRET);
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
  try { payload = raw ? JSON.parse(raw) : {}; } catch { payload = { raw }; }
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
    })
    .select("*")
    .maybeSingle();
  if (inserted.error || !inserted.data?.id) throw new Error(inserted.error?.message || "Unable to create orchestrator run");
  return inserted.data as Row;
}

function queryPlan(plan: Row, callIndex: number) {
  const queries = Array.isArray(plan.queries) ? plan.queries.map(text).filter(Boolean) : [];
  if (!queries.length) return plan;
  return { ...plan, queries: [queries[callIndex % queries.length]] };
}

async function selectJobs(campaignId: string, runId: string, dailyTarget: number) {
  const selector = await callFunction("select-daily-job-batch", {
    campaign_id: campaignId,
    orchestrator_run_id: runId,
    daily_target: dailyTarget,
  });
  if (!selector.ok) throw new Error(`select-daily-job-batch failed: ${JSON.stringify(selector.payload).slice(0, 1200)}`);
  return selector.payload;
}

async function judgeAndSelect(campaignId: string, runId: string, jobIds: string[], dailyTarget: number) {
  const uniqueIds = [...new Set(jobIds)];
  const summary = { considered: 0, judged: 0, cached: 0, passed: 0, reviewed: 0, rejected: 0, failed: 0, batches: [] as Row[] };
  let selection: Row = await selectJobs(campaignId, runId, dailyTarget);
  for (let index = 0; index < uniqueIds.length && Number(selection.selected_count || 0) < dailyTarget; index += 50) {
    const batch = uniqueIds.slice(index, index + 50);
    const judge = await callFunction("judge-campaign-jobs", {
      campaign_id: campaignId,
      orchestrator_run_id: runId,
      job_ids: batch,
      limit: batch.length,
    });
    if (!judge.ok && Number(judge.payload.failed || 0) > 0) {
      throw new Error(`judge-campaign-jobs failed: ${JSON.stringify(judge.payload).slice(0, 1600)}`);
    }
    for (const key of ["considered", "judged", "cached", "passed", "reviewed", "rejected", "failed"]) {
      summary[key as keyof typeof summary] = Number(summary[key as keyof typeof summary] || 0) + Number(judge.payload[key] || 0) as never;
    }
    summary.batches.push(judge.payload);
    selection = await selectJobs(campaignId, runId, dailyTarget);
  }
  return { summary, selection };
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
    if (!dryRun && text(input.allowed_campaign_id) !== campaignId) {
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

    const campaignStatus = text(campaignResult.data.status).toLowerCase();
    const outreach = campaignResult.data.outreach && typeof campaignResult.data.outreach === "object" ? campaignResult.data.outreach : {};
    if (!ACTIVE_STATUSES.has(campaignStatus) || outreach.active === false) {
      return reply({ ok: false, skipped: true, reason: "campaign_not_active", campaign_id: campaignId, campaign_status: campaignStatus }, 409);
    }

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

    const dailyTarget = integer(input.daily_target, 24, 1, 24);
    const compiler = await callFunction("compile-campaign-search-plan", {
      campaign_id: campaignId,
      daily_target: dailyTarget,
      catalogue_age_days: integer(input.catalogue_age_days, 30, 1, 30),
      minimum_match_score: integer(input.minimum_match_score, 70, 0, 100),
    });
    if (!compiler.ok) throw new Error(`compile-campaign-search-plan failed: ${JSON.stringify(compiler.payload).slice(0, 1200)}`);
    const plan = compiler.payload.plan as Row;

    const initialMatch = await callFunction("match-campaign-jobs", {
      campaign_id: campaignId,
      orchestrator_run_id: runId,
      search_plan: plan,
      limit: integer(input.catalogue_scan_limit, 500, 1, 500),
    });
    if (!initialMatch.ok) throw new Error(`Initial catalogue match failed: ${JSON.stringify(initialMatch.payload).slice(0, 1200)}`);

    if (dryRun) {
      const finalRun = await updateRun(supabase, runId, {
        status: "partially_completed",
        current_stage: "fetching_jobs",
        completed_at: new Date().toISOString(),
        search_plan: plan,
        counters: { daily_target: dailyTarget, attempt_limits: [100, 300, 700], catalogue_checked: Number(initialMatch.payload.catalogue_checked || 0) },
        stage_results: { compile_search_plan: compiler.payload, catalogue_match_before_fetch: initialMatch.payload, retry_plan: ATTEMPTS },
      });
      return reply({ ok: true, function: "calsie-campaign-orchestrator-v3", dry_run: true, run: finalRun });
    }

    const attemptResults: Row[] = [];
    const totals = {
      raw_requested: 0, raw_fetched: 0, normalized: 0, new_jobs_stored: 0,
      existing_jobs_updated: 0, duplicates_skipped: 0, deterministic_eligible: 0,
      ai_considered: 0, ai_judged: 0, ai_cached: 0, ai_passed: 0,
      ai_reviewed: 0, ai_rejected: 0, ai_failed: 0,
    };
    let callIndex = 0;
    let selection: Row = await selectJobs(campaignId, runId, dailyTarget);

    const initialIds = Array.isArray(initialMatch.payload.eligible_job_ids) ? initialMatch.payload.eligible_job_ids : [];
    if (initialIds.length) {
      const initialJudge = await judgeAndSelect(campaignId, runId, initialIds, dailyTarget);
      selection = initialJudge.selection;
      for (const key of ["considered", "judged", "cached", "passed", "reviewed", "rejected", "failed"]) {
        const targetKey = `ai_${key}` as keyof typeof totals;
        totals[targetKey] = Number(totals[targetKey] || 0) + Number(initialJudge.summary[key as keyof typeof initialJudge.summary] || 0);
      }
    }

    let stopReason = Number(selection.selected_count || 0) >= dailyTarget ? "target_reached_from_catalogue" : "maximum_attempts_reached";

    for (const attempt of ATTEMPTS) {
      if (Number(selection.selected_count || 0) >= dailyTarget) break;
      await updateRun(supabase, runId, { current_stage: `fetch_attempt_${attempt.number}`, heartbeat_at: new Date().toISOString() });

      const fetchedIds: string[] = [];
      const fetchCalls: Row[] = [];
      let attemptFetched = 0;
      let attemptNewUnique = 0;

      for (const limit of attempt.calls) {
        const fetchPlan = queryPlan(plan, callIndex++);
        const fetched = await callFunction("fetch-job-catalogue-v2", {
          campaign_id: campaignId,
          orchestrator_run_id: runId,
          search_plan: fetchPlan,
          fetch_pool_limit: limit,
        });
        if (!fetched.ok) throw new Error(`fetch-job-catalogue-v2 failed: ${JSON.stringify(fetched.payload).slice(0, 1600)}`);
        fetchCalls.push(fetched.payload);
        totals.raw_requested += limit;
        totals.raw_fetched += Number(fetched.payload.fetched_count || 0);
        totals.normalized += Number(fetched.payload.normalized_count || 0);
        totals.new_jobs_stored += Number(fetched.payload.new_jobs_stored || 0);
        totals.existing_jobs_updated += Number(fetched.payload.existing_jobs_updated || 0);
        totals.duplicates_skipped += Number(fetched.payload.duplicates_skipped || 0);
        attemptFetched += Number(fetched.payload.fetched_count || 0);
        attemptNewUnique += Number(fetched.payload.new_jobs_stored || 0);
        fetchedIds.push(...(Array.isArray(fetched.payload.catalogue_job_ids) ? fetched.payload.catalogue_job_ids : []));
      }

      if (attemptFetched === 0) {
        stopReason = "provider_returned_no_results";
        attemptResults.push({ attempt: attempt.number, requested: attempt.calls.reduce((a, b) => a + b, 0), fetch_calls: fetchCalls, stop_reason: stopReason });
        break;
      }
      if (attemptNewUnique === 0 && fetchedIds.length === 0) {
        stopReason = "no_new_unique_jobs";
        attemptResults.push({ attempt: attempt.number, requested: attempt.calls.reduce((a, b) => a + b, 0), fetch_calls: fetchCalls, stop_reason: stopReason });
        break;
      }

      const matched = await callFunction("match-campaign-jobs", {
        campaign_id: campaignId,
        orchestrator_run_id: runId,
        search_plan: plan,
        job_ids: [...new Set(fetchedIds)],
        limit: Math.max(1, fetchedIds.length),
      });
      if (!matched.ok) throw new Error(`Post-fetch match failed: ${JSON.stringify(matched.payload).slice(0, 1200)}`);
      totals.deterministic_eligible += Number(matched.payload.eligible || 0);

      const eligibleIds = Array.isArray(matched.payload.eligible_job_ids) ? matched.payload.eligible_job_ids : [];
      let judgment: Row = { considered: 0, judged: 0, cached: 0, passed: 0, reviewed: 0, rejected: 0, failed: 0, batches: [] };
      if (eligibleIds.length) {
        const judged = await judgeAndSelect(campaignId, runId, eligibleIds, dailyTarget);
        judgment = judged.summary;
        selection = judged.selection;
        totals.ai_considered += Number(judgment.considered || 0);
        totals.ai_judged += Number(judgment.judged || 0);
        totals.ai_cached += Number(judgment.cached || 0);
        totals.ai_passed += Number(judgment.passed || 0);
        totals.ai_reviewed += Number(judgment.reviewed || 0);
        totals.ai_rejected += Number(judgment.rejected || 0);
        totals.ai_failed += Number(judgment.failed || 0);
      }

      attemptResults.push({
        attempt: attempt.number,
        requested: attempt.calls.reduce((a, b) => a + b, 0),
        fetched: attemptFetched,
        new_unique_jobs: attemptNewUnique,
        fetch_calls: fetchCalls,
        match: matched.payload,
        ai_judgment: judgment,
        selection,
      });

      if (Number(selection.selected_count || 0) >= dailyTarget) {
        stopReason = "target_reached";
        break;
      }
    }

    const selectedCount = Number(selection.selected_count || 0);
    const finalRun = await updateRun(supabase, runId, {
      status: selectedCount > 0 ? "ready_for_review" : "needs_attention",
      current_stage: selectedCount > 0 ? "ready_for_review" : "failed",
      completed_at: new Date().toISOString(),
      search_plan: plan,
      counters: {
        daily_target: dailyTarget,
        attempts_completed: attemptResults.length,
        attempt_limits: [100, 300, 700],
        ...totals,
        selected: selectedCount,
        held_for_later: Number(selection.held_for_later_count || 0),
        shortage_after_attempts: Math.max(0, dailyTarget - selectedCount),
        target_reached: selectedCount >= dailyTarget,
      },
      stage_results: {
        compile_search_plan: compiler.payload,
        catalogue_match_before_fetch: initialMatch.payload,
        attempts: attemptResults,
        final_selection: selection,
        stop_reason: stopReason,
      },
      last_error: selectedCount > 0 ? null : `No AI-approved jobs were selected; ${stopReason}`,
    });

    return reply({
      ok: selectedCount > 0,
      function: "calsie-campaign-orchestrator-v3",
      version: "three_stage_100_300_700_v1",
      dry_run: false,
      run: finalRun,
      selected_jobs: selection.selected_jobs || [],
      stop_reason: stopReason,
      sends_emails_now: false,
      next_required_stage: selectedCount > 0 ? "user_review" : null,
    }, selectedCount > 0 ? 200 : 422);
  } catch (error) {
    return reply({
      ok: false,
      function: "calsie-campaign-orchestrator-v3",
      version: "three_stage_100_300_700_v1",
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});