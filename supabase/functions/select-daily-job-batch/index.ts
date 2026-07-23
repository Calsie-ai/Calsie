import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type Row = Record<string, any>;

const VERSION = "mixed_daily_opportunities_v1";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("APPLIX_SERVICE_ROLE_KEY") || "";
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

function list(value: unknown): string[] {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : [];
}

function authorizedInternalCall(req: Request) {
  const supplied = text(req.headers.get("x-applix-internal-secret"));
  return Boolean(INTERNAL_SECRET) && supplied === INTERNAL_SECRET;
}

function isSydneyPostcode(value: unknown) {
  const postcode = Number.parseInt(text(value), 10);
  if (!Number.isFinite(postcode)) return false;
  return (
    (postcode >= 2000 && postcode <= 2234) ||
    (postcode >= 2555 && postcode <= 2574) ||
    (postcode >= 2740 && postcode <= 2786)
  );
}

function relevantServiceScore(categories: unknown) {
  const joined = list(categories).join(" ").toLowerCase();
  if (!joined) return 0;
  const groups = [
    /daily personal|personal activit|personal care|self care/,
    /community participation|community access|social participation|social and civic/,
    /travel|transport/,
    /household task|domestic/,
    /accommodation|supported independent living|sil|respite/,
    /life skill|development of daily living/,
    /behaviour support|therapeutic support/,
  ];
  const hits = groups.filter((pattern) => pattern.test(joined)).length;
  return Math.min(35, hits * 7);
}

function toSelectedJob(row: Row) {
  const job = Array.isArray(row.jobs) ? row.jobs[0] : row.jobs;
  return {
    review_id: row.id,
    opportunity_type: "live_job",
    job_id: row.job_id,
    match_score: row.match_score,
    ai_role_relevance_score: row.ai_role_relevance_score,
    ai_confidence: row.ai_confidence,
    ai_reason: row.ai_reason,
    title: job?.title || null,
    company: job?.company || null,
    location: job?.location || null,
  };
}

function toSelectedCompany(row: Row) {
  const contact = Array.isArray(row.company_contacts_pool)
    ? row.company_contacts_pool[0]
    : row.company_contacts_pool;
  return {
    review_id: row.id,
    opportunity_type: "direct_company",
    pool_contact_id: row.contact_id,
    company_name: contact?.company_name || null,
    company_website_url: contact?.company_website_url || null,
    email: contact?.email || null,
    service_categories: contact?.ndis_service_categories || [],
    service_postcodes: contact?.service_postcodes || [],
    total_score: row.total_score ?? null,
    ai_reason: row.ai_reason || null,
  };
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method !== "POST") return reply({ ok: false, error: "Use POST" }, 405);
    if (!SUPABASE_URL || !SERVICE_KEY || !INTERNAL_SECRET) {
      return reply({ ok: false, error: "Missing Supabase or internal service configuration" }, 500);
    }
    if (!authorizedInternalCall(req)) {
      return reply({ ok: false, error: "Internal service authorization required" }, 401);
    }

    const input = await req.json().catch(() => ({})) as Row;
    const campaignId = text(input.campaign_id);
    const runId = text(input.orchestrator_run_id);
    const includeCompanyFallback = input.include_company_fallback === true;
    const requestedTarget = Number(input.daily_target || 24);
    const dailyTarget = Math.max(1, Math.min(24, Number.isFinite(requestedTarget) ? Math.floor(requestedTarget) : 24));
    if (!campaignId || !runId) {
      return reply({ ok: false, error: "campaign_id and orchestrator_run_id are required" }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const [campaignResult, runResult] = await Promise.all([
      supabase
        .from("campaigns")
        .select("id,template_id,search,location")
        .eq("id", campaignId)
        .maybeSingle(),
      supabase
        .from("orchestrator_runs")
        .select("id,run_date")
        .eq("id", runId)
        .eq("campaign_id", campaignId)
        .maybeSingle(),
    ]);
    if (campaignResult.error) return reply({ ok: false, error: campaignResult.error.message }, 500);
    if (runResult.error) return reply({ ok: false, error: runResult.error.message }, 500);
    if (!campaignResult.data || !runResult.data) return reply({ ok: false, error: "Campaign or run not found" }, 404);

    const search = campaignResult.data.search && typeof campaignResult.data.search === "object"
      ? campaignResult.data.search as Row
      : {};
    const templateId = text(campaignResult.data.template_id || search.template_id);
    const runDate = text(runResult.data.run_date);
    const dayStart = `${runDate}T00:00:00.000Z`;
    const dayEnd = new Date(new Date(dayStart).getTime() + 86400000).toISOString();
    const now = new Date().toISOString();

    const jobFields = "id,job_id,match_score,ai_role_relevance_score,ai_confidence,ai_reason,selected_at,filter_status,selected_for_campaign,jobs!inner(title,company,location)";
    const [selectedJobsResult, selectedCompaniesResult] = await Promise.all([
      supabase
        .from("campaign_job_matches")
        .select(jobFields)
        .eq("campaign_id", campaignId)
        .eq("selected_for_campaign", true)
        .eq("ai_status", "completed")
        .eq("ai_verdict", "pass")
        .gte("selected_at", dayStart)
        .lt("selected_at", dayEnd)
        .order("selected_at", { ascending: true })
        .limit(100),
      supabase
        .from("campaign_company_candidates")
        .select("id,contact_id,total_score,ai_reason,selected_at,company_contacts_pool!inner(company_name,company_website_url,email,ndis_service_categories,service_postcodes)")
        .eq("campaign_id", campaignId)
        .eq("selected_for_campaign", true)
        .gte("selected_at", dayStart)
        .lt("selected_at", dayEnd)
        .order("selected_at", { ascending: true })
        .limit(100),
    ]);
    if (selectedJobsResult.error) return reply({ ok: false, error: selectedJobsResult.error.message }, 500);
    if (selectedCompaniesResult.error) return reply({ ok: false, error: selectedCompaniesResult.error.message }, 500);

    const alreadySelectedJobs = (selectedJobsResult.data || []) as Row[];
    const alreadySelectedCompanies = (selectedCompaniesResult.data || []) as Row[];
    const remainingJobQuota = Math.max(0, dailyTarget - alreadySelectedJobs.length - alreadySelectedCompanies.length);

    const eligibleResult = await supabase
      .from("campaign_job_matches")
      .select(jobFields)
      .eq("campaign_id", campaignId)
      .in("filter_status", ["eligible", "held_for_later"])
      .eq("selected_for_campaign", false)
      .eq("ai_status", "completed")
      .eq("ai_verdict", "pass")
      .order("ai_role_relevance_score", { ascending: false })
      .order("match_score", { ascending: false })
      .limit(500);
    if (eligibleResult.error) return reply({ ok: false, error: eligibleResult.error.message }, 500);

    const eligibleJobs = (eligibleResult.data || []) as Row[];
    const newlySelectedJobs = eligibleJobs.slice(0, remainingJobQuota);
    const heldJobs = eligibleJobs.slice(remainingJobQuota);

    if (newlySelectedJobs.length) {
      const result = await supabase
        .from("campaign_job_matches")
        .update({
          filter_status: "selected",
          selected_for_campaign: true,
          selected_at: now,
          orchestrator_run_id: runId,
          updated_at: now,
        })
        .in("id", newlySelectedJobs.map((row) => row.id));
      if (result.error) return reply({ ok: false, error: result.error.message }, 500);
    }

    if (heldJobs.length) {
      const result = await supabase
        .from("campaign_job_matches")
        .update({
          filter_status: "held_for_later",
          selected_for_campaign: false,
          selected_at: null,
          updated_at: now,
        })
        .in("id", heldJobs.map((row) => row.id));
      if (result.error) return reply({ ok: false, error: result.error.message }, 500);
    }

    const selectedJobs = [...alreadySelectedJobs, ...newlySelectedJobs];
    let remainingQuota = Math.max(0, dailyTarget - selectedJobs.length - alreadySelectedCompanies.length);
    let newlySelectedCompanies: Row[] = [];
    let providerEligibleCount = 0;

    if (includeCompanyFallback && remainingQuota > 0 && templateId) {
      const [candidateIdsResult, queuedIdsResult, poolResult] = await Promise.all([
        supabase
          .from("campaign_company_candidates")
          .select("contact_id")
          .eq("campaign_id", campaignId)
          .limit(10000),
        supabase
          .from("outreach_queue")
          .select("pool_contact_id")
          .eq("campaign_id", campaignId)
          .not("pool_contact_id", "is", null)
          .limit(10000),
        supabase
          .from("company_contacts_pool")
          .select("id,company_name,company_website_url,email,confidence,last_used_at,use_count,ndis_service_categories,service_states,service_postcodes")
          .eq("status", "active")
          .eq("quality_status", "verified")
          .eq("ndis_active", true)
          .contains("service_states", ["NSW"])
          .not("email", "is", null)
          .limit(5000),
      ]);
      if (candidateIdsResult.error) return reply({ ok: false, error: candidateIdsResult.error.message }, 500);
      if (queuedIdsResult.error) return reply({ ok: false, error: queuedIdsResult.error.message }, 500);
      if (poolResult.error) return reply({ ok: false, error: poolResult.error.message }, 500);

      const usedIds = new Set<string>();
      for (const row of candidateIdsResult.data || []) usedIds.add(text(row.contact_id));
      for (const row of queuedIdsResult.data || []) usedIds.add(text(row.pool_contact_id));

      const rankedProviders = ((poolResult.data || []) as Row[])
        .map((contact) => {
          const sydneyPostcodes = list(contact.service_postcodes).filter(isSydneyPostcode);
          const serviceScore = relevantServiceScore(contact.ndis_service_categories);
          const locationScore = sydneyPostcodes.length ? 30 : 0;
          const emailScore = contact.email ? 15 : 0;
          const websiteScore = contact.company_website_url ? 10 : 0;
          const unusedScore = contact.last_used_at ? 5 : 10;
          return {
            contact,
            sydneyPostcodes,
            serviceScore,
            locationScore,
            totalScore: Math.min(100, serviceScore + locationScore + emailScore + websiteScore + unusedScore),
          };
        })
        .filter((item) =>
          !usedIds.has(text(item.contact.id)) &&
          item.locationScore > 0 &&
          item.serviceScore > 0
        )
        .sort((a, b) =>
          b.totalScore - a.totalScore ||
          Number(a.contact.use_count || 0) - Number(b.contact.use_count || 0) ||
          Number(b.contact.confidence || 0) - Number(a.contact.confidence || 0)
        );

      providerEligibleCount = rankedProviders.length;
      const chosen = rankedProviders.slice(0, remainingQuota);
      if (chosen.length) {
        const rows = chosen.map((item) => ({
          campaign_id: campaignId,
          contact_id: item.contact.id,
          orchestrator_run_id: runId,
          template_id: templateId,
          opportunity_type: "direct_company",
          template_score: item.serviceScore,
          location_score: item.locationScore,
          service_score: item.serviceScore,
          total_score: item.totalScore,
          location_reason: `Serves Greater Sydney (${item.sydneyPostcodes.slice(0, 6).join(", ")})`,
          ai_reason: `NDIS provider serves Greater Sydney and offers support-worker-relevant services. Verified contact: ${item.contact.email}.`,
          selected_for_campaign: true,
          selected_at: now,
          user_decision: null,
          reviewed_at: null,
          updated_at: now,
        }));
        const result = await supabase
          .from("campaign_company_candidates")
          .upsert(rows, { onConflict: "campaign_id,contact_id" })
          .select("id,contact_id,total_score,ai_reason,selected_at,company_contacts_pool!inner(company_name,company_website_url,email,ndis_service_categories,service_postcodes)");
        if (result.error) return reply({ ok: false, error: result.error.message }, 500);
        newlySelectedCompanies = (result.data || []) as Row[];
      }
      remainingQuota = Math.max(0, remainingQuota - newlySelectedCompanies.length);
    }

    const selectedCompanies = [...alreadySelectedCompanies, ...newlySelectedCompanies];
    const selectedCount = Math.min(dailyTarget, selectedJobs.length + selectedCompanies.length);

    return reply({
      ok: true,
      function: "select-daily-job-batch",
      version: VERSION,
      campaign_id: campaignId,
      template_id: templateId || null,
      orchestrator_run_id: runId,
      run_date: runDate,
      daily_target: dailyTarget,
      include_company_fallback: includeCompanyFallback,
      eligible_job_count: eligibleJobs.length,
      newly_selected_job_count: newlySelectedJobs.length,
      selected_job_count: selectedJobs.length,
      held_for_later_count: heldJobs.length,
      provider_eligible_count: providerEligibleCount,
      newly_selected_company_count: newlySelectedCompanies.length,
      selected_company_count: selectedCompanies.length,
      selected_count: selectedCount,
      remaining_quota: Math.max(0, dailyTarget - selectedCount),
      selected_jobs: selectedJobs.map(toSelectedJob),
      selected_pool_contacts: selectedCompanies.map(toSelectedCompany),
      sends_emails_now: false,
      creates_drafts_now: false,
    });
  } catch (error) {
    return reply({
      ok: false,
      function: "select-daily-job-batch",
      version: VERSION,
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});