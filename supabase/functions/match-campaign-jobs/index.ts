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
  if (value === undefined || value === null) return "";
  return String(value).trim();
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

function evaluate(job: Row, plan: Row) {
  const title = normalized(job.title);
  const location = normalized(job.location);
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

  if (targetLocation && !location.includes(targetLocation) && !targetLocation.includes(location)) {
    rejectionReasons.push("location_mismatch");
  }

  if (containsPhrase(title, excludeTitles)) rejectionReasons.push("excluded_title");

  const includedTitle = includeTitles.length === 0 || containsPhrase(title, includeTitles);
  if (!includedTitle) rejectionReasons.push("title_family_mismatch");

  if (rejectionReasons.length > 0) {
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

  let titleScore = 0;
  if (containsPhrase(title, includeTitles)) {
    titleScore = 40;
    matchedRules.push("included_title");
  } else if (normalized(plan.target_role) && title.includes(normalized(plan.target_role))) {
    titleScore = 32;
    matchedRules.push("target_role_title");
  }

  const locationScore = targetLocation ? 20 : 10;
  if (targetLocation) matchedRules.push("location_match");

  let experienceScore = 15;
  if (/senior|lead|principal|manager|director|head|chief|cfo|controller/.test(title)) {
    experienceScore = 0;
  } else {
    matchedRules.push("entry_or_unspecified_seniority");
  }

  let descriptionScore = 0;
  const roleTokens = [...includeTitles, text(plan.target_role)]
    .flatMap((value) => normalized(value).split(" "))
    .filter((value) => value.length >= 4);
  const uniqueTokens = [...new Set(roleTokens)];
  const descriptionHits = uniqueTokens.filter((token) => description.includes(token)).length;
  if (descriptionHits > 0) {
    descriptionScore = Math.min(15, 5 + descriptionHits * 2);
    matchedRules.push("description_relevance");
  }

  let jobTypeScore = 10;
  if (requiredJobTypes.length > 0) {
    jobTypeScore = requiredJobTypes.some((required) => jobType.includes(required)) ? 10 : 0;
    if (jobTypeScore > 0) matchedRules.push("job_type_match");
  }

  const matchScore = titleScore + locationScore + experienceScore + descriptionScore + jobTypeScore;
  return {
    filter_status: matchScore >= Number(plan.minimum_match_score || 70) ? "eligible" : "rejected",
    match_score: matchScore,
    title_score: titleScore,
    location_score: locationScore,
    experience_score: experienceScore,
    description_score: descriptionScore,
    job_type_score: jobTypeScore,
    matched_rules: matchedRules,
    rejection_reasons: matchScore >= Number(plan.minimum_match_score || 70) ? [] : ["below_minimum_score"],
  };
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return reply({ ok: false, error: "Use POST" }, 405);
    if (!SUPABASE_URL || !SERVICE_KEY) return reply({ ok: false, error: "Missing Supabase service configuration" }, 500);
    if ((req.headers.get("authorization") || "") !== `Bearer ${SERVICE_KEY}`) {
      return reply({ ok: false, error: "Service-role authorization required" }, 401);
    }

    const input = await req.json().catch(() => ({})) as Row;
    const campaignId = text(input.campaign_id);
    const runId = text(input.orchestrator_run_id);
    const plan = input.search_plan as Row;
    if (!campaignId || !runId || !plan) return reply({ ok: false, error: "campaign_id, orchestrator_run_id and search_plan are required" }, 400);

    const limit = Math.max(1, Math.min(500, Number(input.limit || 300)));
    const ageDays = Math.max(1, Math.min(30, Number(plan.catalogue_age_days || 30)));
    const cutoff = new Date(Date.now() - ageDays * 86400000).toISOString();
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const jobsResult = await supabase
      .from("jobs")
      .select("id,title,company,location,description,job_type,posted_at,fetched_at,created_at,expires_at,catalogue_status,source,apply_url")
      .is("user_id", null)
      .is("campaign_id", null)
      .not("catalogue_status", "in", "(expired,closed,invalid)")
      .or(`posted_at.gte.${cutoff},and(posted_at.is.null,fetched_at.gte.${cutoff}),and(posted_at.is.null,fetched_at.is.null,created_at.gte.${cutoff})`)
      .limit(limit);

    if (jobsResult.error) return reply({ ok: false, error: jobsResult.error.message }, 500);

    const evaluated = (jobsResult.data || []).map((job: Row) => ({ job, result: evaluate(job, plan) }));
    let eligible = 0;
    let rejected = 0;

    for (const item of evaluated) {
      if (item.result.filter_status === "eligible") eligible += 1;
      else rejected += 1;

      const upsert = await supabase.from("campaign_job_matches").upsert({
        campaign_id: campaignId,
        job_id: item.job.id,
        orchestrator_run_id: runId,
        ...item.result,
        selected_for_campaign: false,
        selected_at: null,
        last_evaluated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "campaign_id,job_id" });

      if (upsert.error) return reply({ ok: false, error: upsert.error.message, job_id: item.job.id }, 500);
    }

    return reply({
      ok: true,
      function: "match-campaign-jobs",
      campaign_id: campaignId,
      orchestrator_run_id: runId,
      catalogue_checked: evaluated.length,
      eligible,
      rejected,
    });
  } catch (error) {
    return reply({ ok: false, function: "match-campaign-jobs", error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
