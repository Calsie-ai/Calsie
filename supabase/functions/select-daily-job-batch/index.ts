import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type Row = Record<string, any>;
type PoolKey = "disability" | "aged_care";

const VERSION = "template_industry_pools_v3";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("APPLIX_SERVICE_ROLE_KEY") || "";
const INTERNAL_SECRET = Deno.env.get("APPLIX_INTERNAL_SECRET") || "";

const text = (value: unknown) => value == null ? "" : String(value).trim();
const list = (value: unknown): string[] => Array.isArray(value) ? value.map(text).filter(Boolean) : [];

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function authorized(req: Request) {
  return Boolean(INTERNAL_SECRET) && text(req.headers.get("x-applix-internal-secret")) === INTERNAL_SECRET;
}

function isSydneyPostcode(value: unknown) {
  const postcode = Number.parseInt(text(value), 10);
  return Number.isFinite(postcode) && (
    (postcode >= 2000 && postcode <= 2234) ||
    (postcode >= 2555 && postcode <= 2574) ||
    (postcode >= 2740 && postcode <= 2786)
  );
}

function disabilityServiceScore(categories: unknown) {
  const joined = list(categories).join(" ").toLowerCase();
  const groups = [
    /daily personal|personal activit|personal care|self care/,
    /community participation|community access|social participation|social and civic/,
    /travel|transport/,
    /household task|domestic/,
    /accommodation|supported independent living|sil|respite/,
    /life skill|development of daily living/,
    /behaviour support|therapeutic support/,
  ];
  return Math.min(35, groups.filter((pattern) => pattern.test(joined)).length * 7);
}

function agedCareServiceScore(categories: unknown) {
  const joined = list(categories).join(" ").toLowerCase();
  const groups = [
    /residential aged care|residential care|nursing home/,
    /home care|in home care|home support/,
    /personal care|activities of daily living|daily living/,
    /dementia|memory support/,
    /respite/,
    /domestic assistance|household assistance/,
    /social support|community support|companionship/,
  ];
  return Math.min(35, groups.filter((pattern) => pattern.test(joined)).length * 7);
}

function selectedJob(row: Row) {
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

function selectedCompany(row: Row) {
  const contact = row.contact || {};
  return {
    review_id: row.id,
    opportunity_type: "direct_company",
    pool_key: row.pool_key,
    pool_contact_id: row.contact_id,
    company_name: contact.company_name || null,
    company_website_url: contact.company_website_url || null,
    email: contact.email || null,
    service_categories: contact.service_categories || [],
    service_postcodes: contact.service_postcodes || [],
    total_score: row.total_score ?? null,
    ai_reason: row.ai_reason || null,
  };
}

function poolTable(poolKey: PoolKey) {
  return poolKey === "aged_care"
    ? "aged_care_company_contacts_pool"
    : "disability_company_contacts_pool";
}

function normaliseContact(poolKey: PoolKey, row: Row) {
  return {
    ...row,
    service_categories: poolKey === "aged_care"
      ? list(row.aged_care_service_categories)
      : list(row.ndis_service_categories),
    service_postcodes: list(row.service_postcodes),
  };
}

async function attachContacts(supabase: ReturnType<typeof createClient>, candidates: Row[]) {
  const result = candidates.map((candidate) => ({ ...candidate, contact: null as Row | null }));
  for (const poolKey of ["disability", "aged_care"] as PoolKey[]) {
    const ids = [...new Set(result.filter((row) => row.pool_key === poolKey).map((row) => row.contact_id).filter(Boolean))];
    if (!ids.length) continue;
    const columns = poolKey === "aged_care"
      ? "id,company_name,company_website_url,email,aged_care_service_categories,service_postcodes"
      : "id,company_name,company_website_url,email,ndis_service_categories,service_postcodes";
    const contacts = await supabase.from(poolTable(poolKey)).select(columns).in("id", ids);
    if (contacts.error) throw new Error(contacts.error.message);
    const byId = new Map((contacts.data || []).map((row: Row) => [row.id, normaliseContact(poolKey, row)]));
    for (const candidate of result) {
      if (candidate.pool_key === poolKey) candidate.contact = byId.get(candidate.contact_id) || null;
    }
  }
  return result.filter((row) => row.contact);
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method !== "POST") return reply({ ok: false, error: "Use POST" }, 405);
    if (!SUPABASE_URL || !SERVICE_KEY || !INTERNAL_SECRET) {
      return reply({ ok: false, error: "Missing Supabase or internal service configuration" }, 500);
    }
    if (!authorized(req)) return reply({ ok: false, error: "Internal service authorization required" }, 401);

    const input = await req.json().catch(() => ({})) as Row;
    const campaignId = text(input.campaign_id);
    const runId = text(input.orchestrator_run_id);
    const includeCompanyFallback = input.include_company_fallback === true;
    const requestedTarget = Number(input.daily_target || 24);
    const dailyTarget = Math.max(1, Math.min(24, Number.isFinite(requestedTarget) ? Math.floor(requestedTarget) : 24));
    if (!campaignId || !runId) return reply({ ok: false, error: "campaign_id and orchestrator_run_id are required" }, 400);

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const [campaignResult, runResult] = await Promise.all([
      supabase.from("campaigns").select("id,template_id,search,location").eq("id", campaignId).maybeSingle(),
      supabase.from("orchestrator_runs").select("id,run_date").eq("id", runId).eq("campaign_id", campaignId).maybeSingle(),
    ]);
    if (campaignResult.error) return reply({ ok: false, error: campaignResult.error.message }, 500);
    if (runResult.error) return reply({ ok: false, error: runResult.error.message }, 500);
    if (!campaignResult.data || !runResult.data) return reply({ ok: false, error: "Campaign or run not found" }, 404);

    const search = campaignResult.data.search && typeof campaignResult.data.search === "object"
      ? campaignResult.data.search as Row
      : {};
    const templateId = text(campaignResult.data.template_id || search.template_id);
    let poolKey: PoolKey | null = null;
    if (templateId) {
      const mapping = await supabase
        .from("template_company_pool_links")
        .select("pool_key")
        .eq("template_id", templateId)
        .eq("is_active", true)
        .maybeSingle();
      if (mapping.error) return reply({ ok: false, error: mapping.error.message }, 500);
      if (mapping.data?.pool_key === "disability" || mapping.data?.pool_key === "aged_care") {
        poolKey = mapping.data.pool_key;
      }
    }

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
        .select("id,contact_id,pool_key,total_score,ai_reason,selected_at")
        .eq("campaign_id", campaignId)
        .eq("selected_for_campaign", true)
        .gte("selected_at", dayStart)
        .lt("selected_at", dayEnd)
        .order("selected_at", { ascending: true })
        .limit(100),
    ]);
    if (selectedJobsResult.error) return reply({ ok: false, error: selectedJobsResult.error.message }, 500);
    if (selectedCompaniesResult.error) return reply({ ok: false, error: selectedCompaniesResult.error.message }, 500);

    const alreadyJobs = (selectedJobsResult.data || []) as Row[];
    const alreadyCompanies = await attachContacts(supabase, (selectedCompaniesResult.data || []) as Row[]);
    const availableJobSlots = Math.max(0, dailyTarget - alreadyJobs.length - alreadyCompanies.length);

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
    const newJobs = eligibleJobs.slice(0, availableJobSlots);
    const heldJobs = eligibleJobs.slice(availableJobSlots);

    if (newJobs.length) {
      const result = await supabase
        .from("campaign_job_matches")
        .update({
          filter_status: "selected",
          selected_for_campaign: true,
          selected_at: now,
          orchestrator_run_id: runId,
          updated_at: now,
        })
        .in("id", newJobs.map((row) => row.id));
      if (result.error) return reply({ ok: false, error: result.error.message }, 500);
    }

    if (heldJobs.length) {
      const result = await supabase
        .from("campaign_job_matches")
        .update({ filter_status: "held_for_later", selected_for_campaign: false, selected_at: null, updated_at: now })
        .in("id", heldJobs.map((row) => row.id));
      if (result.error) return reply({ ok: false, error: result.error.message }, 500);
    }

    const jobs = [...alreadyJobs, ...newJobs];
    let remaining = Math.max(0, dailyTarget - jobs.length - alreadyCompanies.length);
    let newCompanies: Row[] = [];
    let providerEligibleCount = 0;

    if (includeCompanyFallback && remaining > 0 && templateId && poolKey) {
      const [candidateIdsResult, queuedIdsResult] = await Promise.all([
        supabase.from("campaign_company_candidates").select("contact_id").eq("campaign_id", campaignId).eq("pool_key", poolKey).limit(10000),
        supabase.from("outreach_queue").select("pool_contact_id").eq("campaign_id", campaignId).not("pool_contact_id", "is", null).limit(10000),
      ]);
      if (candidateIdsResult.error) return reply({ ok: false, error: candidateIdsResult.error.message }, 500);
      if (queuedIdsResult.error) return reply({ ok: false, error: queuedIdsResult.error.message }, 500);

      const columns = poolKey === "aged_care"
        ? "id,company_name,company_website_url,email,confidence,last_used_at,use_count,aged_care_service_categories,service_states,service_postcodes"
        : "id,company_name,company_website_url,email,confidence,last_used_at,use_count,ndis_service_categories,service_states,service_postcodes";
      let poolQuery = supabase
        .from(poolTable(poolKey))
        .select(columns)
        .eq("status", "active")
        .in("quality_status", ["verified", "official_source"])
        .contains("service_states", ["NSW"])
        .not("email", "is", null)
        .limit(5000);
      poolQuery = poolKey === "aged_care"
        ? poolQuery.eq("aged_care_active", true)
        : poolQuery.eq("ndis_active", true);
      const poolResult = await poolQuery;
      if (poolResult.error) return reply({ ok: false, error: poolResult.error.message }, 500);

      const usedIds = new Set<string>();
      for (const row of candidateIdsResult.data || []) usedIds.add(text(row.contact_id));
      for (const row of queuedIdsResult.data || []) usedIds.add(text(row.pool_contact_id));

      const ranked = ((poolResult.data || []) as Row[])
        .map((rawContact) => {
          const contact = normaliseContact(poolKey, rawContact);
          const postcodes = contact.service_postcodes.filter(isSydneyPostcode);
          const industryScore = poolKey === "aged_care"
            ? agedCareServiceScore(contact.service_categories)
            : disabilityServiceScore(contact.service_categories);
          const totalScore = Math.min(100,
            industryScore +
            (postcodes.length ? 30 : 0) +
            (contact.email ? 15 : 0) +
            (contact.company_website_url ? 10 : 0) +
            (contact.last_used_at ? 5 : 10)
          );
          return { contact, postcodes, industryScore, totalScore };
        })
        .filter((item) => !usedIds.has(text(item.contact.id)) && item.postcodes.length > 0 && item.industryScore > 0)
        .sort((a, b) =>
          b.totalScore - a.totalScore ||
          Number(a.contact.use_count || 0) - Number(b.contact.use_count || 0) ||
          Number(b.contact.confidence || 0) - Number(a.contact.confidence || 0)
        );

      providerEligibleCount = ranked.length;
      const chosen = ranked.slice(0, remaining);
      if (chosen.length) {
        const rows = chosen.map((item) => ({
          campaign_id: campaignId,
          contact_id: item.contact.id,
          pool_key: poolKey,
          orchestrator_run_id: runId,
          template_id: templateId,
          opportunity_type: "direct_company",
          template_score: item.industryScore,
          location_score: 30,
          service_score: item.industryScore,
          total_score: item.totalScore,
          location_reason: `Serves Greater Sydney (${item.postcodes.slice(0, 6).join(", ")})`,
          ai_reason: poolKey === "aged_care"
            ? "Aged care provider serves Greater Sydney and offers aged-care-relevant services. Verified company email available."
            : "Disability provider serves Greater Sydney and offers support-worker-relevant services. Verified company email available.",
          selected_for_campaign: true,
          selected_at: now,
          user_decision: null,
          reviewed_at: null,
          updated_at: now,
        }));
        const result = await supabase
          .from("campaign_company_candidates")
          .upsert(rows, { onConflict: "campaign_id,pool_key,contact_id" })
          .select("id,contact_id,pool_key,total_score,ai_reason,selected_at");
        if (result.error) return reply({ ok: false, error: result.error.message }, 500);
        newCompanies = await attachContacts(supabase, (result.data || []) as Row[]);
      }
      remaining = Math.max(0, remaining - newCompanies.length);
    }

    const companies = [...alreadyCompanies, ...newCompanies];
    const selectedCount = Math.min(dailyTarget, jobs.length + companies.length);
    return reply({
      ok: true,
      function: "select-daily-job-batch",
      version: VERSION,
      campaign_id: campaignId,
      template_id: templateId || null,
      company_pool_key: poolKey,
      orchestrator_run_id: runId,
      run_date: runDate,
      daily_target: dailyTarget,
      include_company_fallback: includeCompanyFallback,
      eligible_job_count: eligibleJobs.length,
      newly_selected_job_count: newJobs.length,
      selected_job_count: jobs.length,
      held_for_later_count: heldJobs.length,
      provider_eligible_count: providerEligibleCount,
      newly_selected_company_count: newCompanies.length,
      selected_company_count: companies.length,
      selected_count: selectedCount,
      remaining_quota: Math.max(0, dailyTarget - selectedCount),
      selected_jobs: jobs.map(selectedJob),
      selected_pool_contacts: companies.map(selectedCompany),
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