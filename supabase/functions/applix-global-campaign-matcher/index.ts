import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type Row = Record<string, any>;

const URL = Deno.env.get("SUPABASE_URL") || "";
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("APPLIX_SERVICE_ROLE_KEY") || "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
const INTERNAL_SECRET = Deno.env.get("APPLIX_INTERNAL_SECRET") || "";

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body, null, 2), {
  status,
  headers: { "content-type": "application/json" },
});

const text = (value: unknown) => value == null ? "" : String(value).trim();

function authorised(req: Request) {
  const bearer = text(req.headers.get("authorization")).replace(/^Bearer\s+/i, "");
  const supplied = text(req.headers.get("x-applix-cron-secret"));
  return Boolean(KEY && bearer === KEY) || Boolean(CRON_SECRET && (bearer === CRON_SECRET || supplied === CRON_SECRET));
}

function sydneyDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

async function callFunction(name: string, body: Row) {
  const response = await fetch(`${URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${KEY}`,
      apikey: KEY,
      "x-applix-internal-secret": INTERNAL_SECRET,
    },
    body: JSON.stringify(body),
  });

  const raw = await response.text().catch(() => "");
  let payload: Row = {};
  try { payload = raw ? JSON.parse(raw) : {}; } catch { payload = { raw }; }

  if (!response.ok || payload.ok === false) {
    throw new Error(`${name} failed: ${JSON.stringify(payload).slice(0, 1600)}`);
  }

  return payload;
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return reply({ ok: false, error: "Use POST" }, 405);
    if (!URL || !KEY || !CRON_SECRET || !INTERNAL_SECRET) return reply({ ok: false, error: "Missing configuration" }, 500);
    if (!authorised(req)) return reply({ ok: false, error: "Unauthorized" }, 401);

    const input = await req.json().catch(() => ({})) as Row;
    const runDate = text(input.run_date) || sydneyDate();
    const batchSize = Math.max(1, Math.min(100, Number(input.batch_size || 25)));
    const db = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

    const batchKey = `global_daily_100:${runDate}`;
    const dailyFetch = await db
      .from("job_fetch_runs")
      .select("id,status,jobs_found,jobs_inserted,jobs_updated,finished_at")
      .eq("batch_key", batchKey)
      .maybeSingle();
    if (dailyFetch.error) throw new Error(dailyFetch.error.message);

    if (!dailyFetch.data || dailyFetch.data.status !== "completed") {
      return reply({
        ok: true,
        skipped: true,
        function: "applix-global-campaign-matcher",
        reason: "daily_global_fetch_not_completed",
        run_date: runDate,
        batch_key: batchKey,
      });
    }

    const catalogue = await db
      .from("jobs")
      .select("id")
      .is("user_id", null)
      .is("campaign_id", null)
      .eq("catalogue_status", "active")
      .eq("fetch_run_id", dailyFetch.data.id)
      .order("fetched_at", { ascending: false })
      .limit(100);
    if (catalogue.error) throw new Error(catalogue.error.message);

    const jobIds = (catalogue.data || []).map((row: Row) => row.id);
    if (!jobIds.length && Number(dailyFetch.data.jobs_found || 0) > 0) {
      return reply({
        ok: false,
        function: "applix-global-campaign-matcher",
        error: "Daily fetch completed but no catalogue jobs are linked to its fetch_run_id",
        run_date: runDate,
        fetch_run_id: dailyFetch.data.id,
      }, 409);
    }

    const claimed = await db.rpc("claim_global_daily_campaign_batch", {
      p_run_date: runDate,
      p_batch_size: batchSize,
    });
    if (claimed.error) throw new Error(claimed.error.message);

    const runs = (claimed.data || []) as Row[];
    if (!runs.length) {
      return reply({
        ok: true,
        function: "applix-global-campaign-matcher",
        version: "shared_catalogue_batch_v2",
        claimed: 0,
        catalogue_jobs: jobIds.length,
        complete_for_now: true,
      });
    }

    const results: Row[] = [];

    for (const run of runs) {
      const runId = text(run.run_id);
      const campaignId = text(run.campaign_id);

      try {
        const campaign = await db.from("campaigns").select("search,outreach").eq("id", campaignId).single();
        if (campaign.error) throw new Error(campaign.error.message);

        const search = campaign.data.search || {};
        const outreach = campaign.data.outreach || {};
        const target = Math.max(1, Math.min(24, Number(search.daily_job_limit || outreach.daily_job_limit || 24)));

        const compiled = await callFunction("compile-campaign-search-plan", {
          campaign_id: campaignId,
          daily_target: target,
          catalogue_age_days: 30,
          minimum_match_score: Number(input.minimum_match_score || 70),
        });

        const matched = jobIds.length
          ? await callFunction("match-campaign-jobs", {
              campaign_id: campaignId,
              orchestrator_run_id: runId,
              search_plan: compiled.plan,
              job_ids: jobIds,
              limit: jobIds.length,
            })
          : { eligible_job_ids: [], eligible: 0, rejected: 0 };

        const eligibleIds = Array.isArray(matched.eligible_job_ids) ? matched.eligible_job_ids : [];
        if (eligibleIds.length) {
          const marked = await db
            .from("campaign_job_matches")
            .update({
              ai_status: "completed",
              ai_verdict: "pass",
              ai_model: "deterministic_global_v2",
              ai_prompt_version: "none",
              ai_confidence: 1,
              ai_reason: "Passed deterministic campaign filters in the shared daily catalogue",
              ai_judged_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("campaign_id", campaignId)
            .in("job_id", eligibleIds)
            .eq("filter_status", "eligible");
          if (marked.error) throw new Error(marked.error.message);
        }

        const selected = await callFunction("select-daily-job-batch", {
          campaign_id: campaignId,
          orchestrator_run_id: runId,
          daily_target: target,
        });

        const fresh = Number(selected.selected_count || 0);
        const fallback = Number(selected.selected_pool_contact_count || 0);
        const total = Math.min(target, fresh + fallback);
        const now = new Date().toISOString();

        const finished = await db.from("orchestrator_runs").update({
          status: total > 0 ? "ready_for_review" : "needs_attention",
          current_stage: total > 0 ? "ready_for_review" : "failed",
          search_plan: compiled.plan,
          counters: {
            daily_target: target,
            fetch_run_id: dailyFetch.data.id,
            catalogue_jobs_considered: jobIds.length,
            deterministic_eligible: Number(matched.eligible || 0),
            selected_jobs: fresh,
            selected_pool_contacts: fallback,
            combined_selected: total,
            shortage_after_fallback: Math.max(0, target - total),
            fallback_used: fallback > 0,
          },
          stage_results: {
            mode: "shared_global_catalogue",
            daily_fetch: dailyFetch.data,
            matching: matched,
            final_selection: selected,
          },
          completed_at: now,
          heartbeat_at: now,
          last_error: total > 0 ? null : "No suitable fresh jobs or unused verified fallback contacts",
          updated_at: now,
        }).eq("id", runId);
        if (finished.error) throw new Error(finished.error.message);

        results.push({ campaign_id: campaignId, run_id: runId, ok: true, fresh, fallback, total });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const now = new Date().toISOString();
        await db.from("orchestrator_runs").update({
          status: "needs_attention",
          current_stage: "failed",
          completed_at: now,
          heartbeat_at: now,
          last_error: message.slice(0, 4000),
          updated_at: now,
        }).eq("id", runId);
        results.push({ campaign_id: campaignId, run_id: runId, ok: false, error: message });
      }
    }

    const allOk = results.every((result) => result.ok);
    return reply({
      ok: allOk,
      function: "applix-global-campaign-matcher",
      version: "shared_catalogue_batch_v2",
      run_date: runDate,
      fetch_run_id: dailyFetch.data.id,
      claimed: runs.length,
      catalogue_jobs: jobIds.length,
      results,
    }, allOk ? 200 : 207);
  } catch (error) {
    return reply({
      ok: false,
      function: "applix-global-campaign-matcher",
      version: "shared_catalogue_batch_v2",
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});
