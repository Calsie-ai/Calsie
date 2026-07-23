import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type Row = Record<string, any>;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("APPLIX_SERVICE_ROLE_KEY") || "";

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function text(value: unknown) {
  return value == null ? "" : String(value).trim();
}

function normalized(value: unknown) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function list(value: unknown): string[] {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : [];
}

function containsPhrase(haystack: string, phrases: string[]) {
  return phrases.some((phrase) => haystack.includes(normalized(phrase)));
}

function freshDate(job: Row) {
  return job.posted_at || job.fetched_at || job.created_at || null;
}

function locationMatches(jobLocation: unknown, campaignLocation: unknown) {
  const location = normalized(jobLocation);
  const targetLocation = normalized(campaignLocation);
  if (!targetLocation) return true;
  if (!location) return false;
  if (location.includes(targetLocation) || targetLocation.includes(location)) return true;
  return targetLocation.includes("sydney") && targetLocation.includes("nsw") && location.includes("nsw");
}

function evaluate(job: Row, plan: Row) {
  const title = normalized(job.title);
  const description = normalized(job.description);
  const jobType = normalized(job.job_type);
  const includeTitles = list(plan.include_titles);
  const excludeTitles = list(plan.exclude_titles);
  const targetLocation = normalized(plan.location);
  const requiredJobTypes = list(plan.job_types).map(normalized);
  const rejectionReasons: string[] = [];
  const matchedRules: string[] = [];

  const freshnessSource = freshDate(job);
  if (!freshnessSource) rejectionReasons.push("missing_freshness_date");
  const freshness = freshnessSource ? new Date(freshnessSource) : null;
  if (freshness && Number.isNaN(freshness.getTime())) rejectionReasons.push("invalid_freshness_date");
  if (freshness && freshness.getTime() < Date.now() - Number(plan.catalogue_age_days || 30) * 86400000) {
    rejectionReasons.push("older_than_catalogue_window");
  }
  if (["expired", "closed", "invalid"].includes(text(job.catalogue_status).toLowerCase())) {
    rejectionReasons.push(`catalogue_${text(job.catalogue_status).toLowerCase()}`);
  }
  if (!locationMatches(job.location, plan.location)) rejectionReasons.push("location_mismatch");
  if (containsPhrase(title, excludeTitles)) rejectionReasons.push("excluded_title");

  const targetRole = normalized(plan.target_role);
  const includedTitle = containsPhrase(title, includeTitles) || Boolean(targetRole && title.includes(targetRole));
  if (!includedTitle) rejectionReasons.push("title_family_mismatch");

  if (rejectionReasons.length) {
    return {
      filter_status: "rejected",
      match_score: 0,
      title_score: 0,
      location_score: 0,
      experience_score: 0,
      description_score: 0,
      job_type_score: 0,
      matched_rules: matchedRules,
      rejection_reasons: rejectionReasons,
    };
  }

  const titleScore = containsPhrase(title, includeTitles) ? 40 : 32;
  matchedRules.push(containsPhrase(title, includeTitles) ? "included_title" : "target_role_title");
  const locationScore = targetLocation ? 20 : 10;
  if (targetLocation) matchedRules.push("location_match");
  const experienceScore = /senior|lead|principal|manager|director|head|chief|cfo|controller/.test(title) ? 0 : 15;
  if (experienceScore) matchedRules.push("entry_or_unspecified_seniority");

  const roleTokens = [...includeTitles, text(plan.target_role), ...list(plan.description_keywords)]
    .flatMap((value) => normalized(value).split(" "))
    .filter((value) => value.length >= 4);
  const descriptionHits = [...new Set(roleTokens)].filter((token) => description.includes(token)).length;
  const descriptionScore = descriptionHits ? Math.min(15, 5 + descriptionHits * 2) : 0;
  if (descriptionScore) matchedRules.push("description_relevance");

  let jobTypeScore = 10;
  if (requiredJobTypes.length) {
    jobTypeScore = requiredJobTypes.some((required) => jobType.includes(required)) ? 10 : 0;
    if (jobTypeScore) matchedRules.push("job_type_match");
  }

  const matchScore = titleScore + locationScore + experienceScore + descriptionScore + jobTypeScore;
  const eligible = matchScore >= Number(plan.minimum_match_score || 70);
  return {
    filter_status: eligible ? "eligible" : "rejected",
    match_score: matchScore,
    title_score: titleScore,
    location_score: locationScore,
    experience_score: experienceScore,
    description_score: descriptionScore,
    job_type_score: jobTypeScore,
    matched_rules: matchedRules,
    rejection_reasons: eligible ? [] : ["below_minimum_score"],
  };
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return reply({ ok: false, error: "Use POST" }, 405);
    if (!SUPABASE_URL || !SERVICE_KEY) return reply({ ok: false, error: "Missing Supabase service configuration" }, 500);
    if ((req.headers.get("authorization") || "") !== `Bearer ${SERVICE_KEY}`) {
      return reply({ ok: false, error: "Service-role authorization required" }, 401);
    }

    const input = (await req.json().catch(() => ({}))) as Row;
    const campaignId = text(input.campaign_id);
    const runId = text(input.orchestrator_run_id);
    const plan = input.search_plan as Row;
    if (!campaignId || !runId || !plan) {
      return reply({ ok: false, error: "campaign_id, orchestrator_run_id and search_plan are required" }, 400);
    }

    const requestedIds = list(input.job_ids);
    const limit = Math.max(1, Math.min(500, Number(input.limit || 300)));
    const ageDays = Math.max(1, Math.min(30, Number(plan.catalogue_age_days || 30)));
    const cutoff = new Date(Date.now() - ageDays * 86400000).toISOString();
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    let query = supabase
      .from("jobs")
      .select("id,title,company,location,description,job_type,posted_at,fetched_at,created_at,expires_at,catalogue_status,source,apply_url")
      .is("user_id", null)
      .is("campaign_id", null)
      .not("catalogue_status", "in", "(expired,closed,invalid)");

    if (requestedIds.length) query = query.in("id", requestedIds);
    else {
      query = query
        .or(`posted_at.gte.${cutoff},and(posted_at.is.null,fetched_at.gte.${cutoff}),and(posted_at.is.null,fetched_at.is.null,created_at.gte.${cutoff})`)
        .limit(limit);
    }

    const jobsResult = await query;
    if (jobsResult.error) return reply({ ok: false, error: jobsResult.error.message }, 500);
    const jobs = jobsResult.data || [];
    const jobIds = jobs.map((job: Row) => job.id);

    const existingMap = new Map<string, Row>();
    if (jobIds.length) {
      const existing = await supabase
        .from("campaign_job_matches")
        .select("job_id,ai_status,filter_status,selected_for_campaign,selected_at")
        .eq("campaign_id", campaignId)
        .in("job_id", jobIds);
      if (existing.error) return reply({ ok: false, error: existing.error.message }, 500);
      for (const row of existing.data || []) existingMap.set(row.job_id, row);
    }

    let eligible = 0;
    let rejected = 0;
    const eligibleJobIds: string[] = [];
    const rejectedJobIds: string[] = [];
    const now = new Date().toISOString();

    const rows = jobs.map((job: Row) => {
      const result = evaluate(job, plan);
      if (result.filter_status === "eligible") {
        eligible += 1;
        eligibleJobIds.push(job.id);
      } else {
        rejected += 1;
        rejectedJobIds.push(job.id);
      }

      const current = existingMap.get(job.id);
      const payload: Row = {
        campaign_id: campaignId,
        job_id: job.id,
        orchestrator_run_id: runId,
        ...result,
        selected_for_campaign: Boolean(current?.selected_for_campaign),
        selected_at: current?.selected_at || null,
        last_evaluated_at: now,
        updated_at: now,
      };
      if (current?.ai_status === "completed") payload.filter_status = current.filter_status || result.filter_status;
      else {
        payload.ai_status = result.filter_status === "eligible" ? "pending" : "skipped";
        payload.ai_last_error = null;
      }
      return payload;
    });

    if (rows.length) {
      const upsert = await supabase.from("campaign_job_matches").upsert(rows, { onConflict: "campaign_id,job_id" });
      if (upsert.error) return reply({ ok: false, error: upsert.error.message }, 500);
    }

    return reply({
      ok: true,
      function: "match-campaign-jobs",
      version: "bulk_match_v2",
      campaign_id: campaignId,
      orchestrator_run_id: runId,
      requested_job_count: requestedIds.length,
      catalogue_checked: jobs.length,
      eligible,
      rejected,
      eligible_job_ids: eligibleJobIds,
      rejected_job_ids: rejectedJobIds,
    });
  } catch (error) {
    return reply({ ok: false, function: "match-campaign-jobs", error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
