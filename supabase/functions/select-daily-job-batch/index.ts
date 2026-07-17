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

function toSelectedJob(row: Row) {
  return {
    job_id: row.job_id,
    match_score: row.match_score,
    ai_role_relevance_score: row.ai_role_relevance_score,
    ai_confidence: row.ai_confidence,
    ai_reason: row.ai_reason,
    title: row.jobs?.title || null,
    company: row.jobs?.company || null,
    location: row.jobs?.location || null,
  };
}

function toSelectedPoolContact(row: Row, templateId: string) {
  const contact = Array.isArray(row.company_contacts_pool)
    ? row.company_contacts_pool[0]
    : row.company_contacts_pool;

  return {
    pool_contact_id: row.contact_id,
    template_id: templateId,
    company_name: contact?.company_name || null,
    company_domain: contact?.company_domain || null,
    company_website_url: contact?.company_website_url || null,
    email: contact?.email || null,
    confidence: contact?.confidence ?? null,
    relevance_score: row.relevance_score ?? null,
    last_used_at: contact?.last_used_at || null,
    use_count: contact?.use_count ?? 0,
  };
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return reply({ ok: false, error: "Use POST" }, 405);
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return reply({ ok: false, error: "Missing Supabase service configuration" }, 500);
    }
    if ((req.headers.get("authorization") || "") !== `Bearer ${SERVICE_KEY}`) {
      return reply({ ok: false, error: "Service-role authorization required" }, 401);
    }

    const input = await req.json().catch(() => ({})) as Row;
    const campaignId = text(input.campaign_id);
    const runId = text(input.orchestrator_run_id);
    const dailyTarget = Math.max(1, Math.min(24, Number(input.daily_target || 24)));

    if (!campaignId || !runId) {
      return reply({ ok: false, error: "campaign_id and orchestrator_run_id are required" }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    const campaignResult = await supabase
      .from("campaigns")
      .select("id,template_id")
      .eq("id", campaignId)
      .maybeSingle();

    if (campaignResult.error) {
      return reply({ ok: false, error: campaignResult.error.message }, 500);
    }
    if (!campaignResult.data) {
      return reply({ ok: false, error: "Campaign not found" }, 404);
    }

    const templateId = text(campaignResult.data.template_id);

    const fields = "id,job_id,match_score,ai_role_relevance_score,ai_confidence,ai_reason,created_at,selected_at,filter_status,selected_for_campaign,jobs!inner(posted_at,fetched_at,created_at,title,company,location)";

    const alreadyResult = await supabase
      .from("campaign_job_matches")
      .select(fields)
      .eq("campaign_id", campaignId)
      .eq("selected_for_campaign", true)
      .eq("ai_status", "completed")
      .eq("ai_verdict", "pass")
      .order("selected_at", { ascending: true })
      .limit(500);

    if (alreadyResult.error) return reply({ ok: false, error: alreadyResult.error.message }, 500);

    const alreadySelected = (alreadyResult.data || []) as Row[];
    const remainingJobQuota = Math.max(0, dailyTarget - alreadySelected.length);

    const eligibleResult = await supabase
      .from("campaign_job_matches")
      .select(fields)
      .eq("campaign_id", campaignId)
      .eq("filter_status", "eligible")
      .eq("selected_for_campaign", false)
      .eq("ai_status", "completed")
      .eq("ai_verdict", "pass")
      .order("ai_role_relevance_score", { ascending: false })
      .order("match_score", { ascending: false })
      .limit(500);

    if (eligibleResult.error) return reply({ ok: false, error: eligibleResult.error.message }, 500);

    const eligible = (eligibleResult.data || []) as Row[];
    const newlySelected = eligible.slice(0, remainingJobQuota);
    const held = eligible.slice(remainingJobQuota);
    const now = new Date().toISOString();

    if (newlySelected.length) {
      const result = await supabase
        .from("campaign_job_matches")
        .update({
          filter_status: "selected",
          selected_for_campaign: true,
          selected_at: now,
          orchestrator_run_id: runId,
          updated_at: now,
        })
        .in("id", newlySelected.map((row) => row.id));

      if (result.error) return reply({ ok: false, error: result.error.message }, 500);
    }

    if (held.length) {
      const result = await supabase
        .from("campaign_job_matches")
        .update({
          filter_status: "held_for_later",
          selected_for_campaign: false,
          selected_at: null,
          orchestrator_run_id: runId,
          updated_at: now,
        })
        .in("id", held.map((row) => row.id));

      if (result.error) return reply({ ok: false, error: result.error.message }, 500);
    }

    const cumulativeSelected = [...alreadySelected, ...newlySelected].slice(0, dailyTarget);
    const remainingQuota = Math.max(0, dailyTarget - cumulativeSelected.length);

    let selectedPoolContacts: Row[] = [];
    let poolEligibleCount = 0;
    let poolAlreadyUsedCount = 0;

    if (remainingQuota > 0 && templateId) {
      const usedResult = await supabase
        .from("outreach_queue")
        .select("pool_contact_id")
        .eq("campaign_id", campaignId)
        .not("pool_contact_id", "is", null)
        .limit(5000);

      if (usedResult.error) return reply({ ok: false, error: usedResult.error.message }, 500);

      const usedContactIds = new Set(
        (usedResult.data || [])
          .map((row: Row) => text(row.pool_contact_id))
          .filter(Boolean),
      );
      poolAlreadyUsedCount = usedContactIds.size;

      const poolResult = await supabase
        .from("company_contact_template_links")
        .select(
          "contact_id,relevance_score,status,company_contacts_pool!inner(id,company_name,company_domain,company_website_url,email,confidence,quality_status,status,last_used_at,use_count)",
        )
        .eq("template_id", templateId)
        .eq("status", "active")
        .eq("company_contacts_pool.status", "active")
        .eq("company_contacts_pool.quality_status", "verified")
        .not("company_contacts_pool.email", "is", null)
        .order("relevance_score", { ascending: false })
        .limit(500);

      if (poolResult.error) return reply({ ok: false, error: poolResult.error.message }, 500);

      const availableContacts = ((poolResult.data || []) as Row[])
        .filter((row) => !usedContactIds.has(text(row.contact_id)))
        .sort((a, b) => {
          const aContact = Array.isArray(a.company_contacts_pool)
            ? a.company_contacts_pool[0]
            : a.company_contacts_pool;
          const bContact = Array.isArray(b.company_contacts_pool)
            ? b.company_contacts_pool[0]
            : b.company_contacts_pool;

          const aLastUsed = aContact?.last_used_at
            ? new Date(aContact.last_used_at).getTime()
            : Number.NEGATIVE_INFINITY;
          const bLastUsed = bContact?.last_used_at
            ? new Date(bContact.last_used_at).getTime()
            : Number.NEGATIVE_INFINITY;

          return aLastUsed - bLastUsed ||
            Number(aContact?.use_count || 0) - Number(bContact?.use_count || 0) ||
            Number(b.relevance_score || 0) - Number(a.relevance_score || 0) ||
            Number(bContact?.confidence || 0) - Number(aContact?.confidence || 0);
        });

      poolEligibleCount = availableContacts.length;
      selectedPoolContacts = availableContacts.slice(0, remainingQuota);
    }

    return reply({
      ok: true,
      function: "select-daily-job-batch",
      version: "template_pool_selection_v1",
      campaign_id: campaignId,
      template_id: templateId || null,
      orchestrator_run_id: runId,
      daily_target: dailyTarget,
      already_selected_count: alreadySelected.length,
      newly_selected_count: newlySelected.length,
      eligible_count: eligible.length,
      selected_count: cumulativeSelected.length,
      held_for_later_count: held.length,
      remaining_quota: remainingQuota,
      selected_jobs: cumulativeSelected.map(toSelectedJob),
      pool_fallback_enabled: Boolean(templateId && remainingQuota > 0),
      pool_already_used_count: poolAlreadyUsedCount,
      pool_eligible_count: poolEligibleCount,
      selected_pool_contact_count: selectedPoolContacts.length,
      selected_pool_contacts: selectedPoolContacts.map((row) =>
        toSelectedPoolContact(row, templateId)
      ),
    });
  } catch (error) {
    return reply({
      ok: false,
      function: "select-daily-job-batch",
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});
