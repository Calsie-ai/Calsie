import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type Row = Record<string, any>;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("APPLIX_SERVICE_ROLE_KEY") || "";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";
const MODEL = Deno.env.get("OPENAI_JOB_JUDGE_MODEL") || "gpt-4o-mini";
const PROMPT_VERSION = Deno.env.get("OPENAI_JOB_JUDGE_PROMPT_VERSION") || "job_judge_v3_model_verdict_guard";

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function text(value: unknown) { return value == null ? "" : String(value).trim(); }
function list(value: unknown): string[] { return Array.isArray(value) ? value.map(text).filter(Boolean) : []; }
function clamp(value: unknown, min: number, max: number) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : min;
}
function normalized(value: unknown) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}
function containsPhrase(value: unknown, phrases: unknown) {
  const haystack = normalized(value);
  return list(phrases).some((phrase) => {
    const needle = normalized(phrase);
    return Boolean(needle && haystack.includes(needle));
  });
}
async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

const SYSTEM_PROMPT = `You are Applix's strict job relevance decision engine.
Judge occupation relevance first. Candidate transferability must not rescue an unrelated occupation.
Use only supplied facts. Never invent qualifications, duties, licences, or experience.
A reject means the job must not be automatically selected. Return concise JSON only.`;

async function callOpenAI(payload: Row) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.1,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "job_judgment",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              role_relevance_score: { type: "integer", minimum: 0, maximum: 100 },
              candidate_fit_score: { type: "integer", minimum: 0, maximum: 100 },
              confidence: { type: "number", minimum: 0, maximum: 1 },
              verdict: { type: "string", enum: ["pass", "review", "reject"] },
              role_family: { type: "string" },
              matched_requirements: { type: "array", items: { type: "string" } },
              conflicts: { type: "array", items: { type: "string" } },
              reason: { type: "string" },
            },
            required: ["role_relevance_score", "candidate_fit_score", "confidence", "verdict", "role_family", "matched_requirements", "conflicts", "reason"],
          },
        },
      },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(payload) },
      ],
    }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`OpenAI failed ${response.status}: ${JSON.stringify(body).slice(0, 600)}`);
  return JSON.parse(body.choices?.[0]?.message?.content || "{}");
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return reply({ ok: false, error: "Use POST" }, 405);
    if (!SUPABASE_URL || !SERVICE_KEY || !OPENAI_API_KEY) return reply({ ok: false, error: "Missing Supabase or OpenAI configuration" }, 500);

    const authorization = req.headers.get("authorization") || "";
    const apiKey = req.headers.get("apikey") || "";
    if (authorization !== `Bearer ${SERVICE_KEY}` || apiKey !== SERVICE_KEY) {
      return reply({ ok: false, error: "Internal service authorization required" }, 401);
    }

    const input = await req.json().catch(() => ({})) as Row;
    const campaignId = text(input.campaign_id);
    const runId = text(input.orchestrator_run_id);
    const requestedIds = list(input.job_ids);
    const limit = Math.max(1, Math.min(50, Number(input.limit || 24)));
    if (!campaignId || !runId) return reply({ ok: false, error: "campaign_id and orchestrator_run_id are required" }, 400);

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const campaignResult = await supabase.from("campaigns").select("id,user_id,name,location,target_business_type,search,filters,outreach").eq("id", campaignId).maybeSingle();
    if (campaignResult.error) throw new Error(campaignResult.error.message);
    if (!campaignResult.data) return reply({ ok: false, error: "Campaign not found" }, 404);
    const campaign = campaignResult.data as Row;

    const matchQuery = supabase.from("campaign_job_matches").select("*,jobs!inner(id,title,company,location,job_type,description,posted_at,source,apply_url)").eq("campaign_id", campaignId);
    const matchResult = requestedIds.length
      ? await matchQuery.in("job_id", requestedIds).limit(limit)
      : await matchQuery.eq("filter_status", "eligible").order("match_score", { ascending: false }).limit(limit);
    if (matchResult.error) throw new Error(matchResult.error.message);

    const resumeResult = await supabase.from("campaign_resume_sources").select("source_of_truth").eq("campaign_id", campaignId).maybeSingle();
    const candidate = resumeResult.data?.source_of_truth || null;

    let judged = 0, cached = 0, preserved = 0, passed = 0, reviewed = 0, rejected = 0, failed = 0;
    const results: Row[] = [];

    for (const match of matchResult.data || []) {
      const job = match.jobs as Row;

      // Never re-judge or reset a row that has entered campaign history.
      if (match.selected_for_campaign === true || match.user_decision === "approved" || match.user_decision === "skipped") {
        preserved += 1;
        results.push({
          job_id: job.id,
          preserved: true,
          selected_for_campaign: match.selected_for_campaign,
          user_decision: match.user_decision,
          verdict: match.ai_verdict,
          score: match.ai_role_relevance_score,
        });
        continue;
      }

      const judgmentInput = {
        prompt_version: PROMPT_VERSION,
        campaign: {
          target_role: campaign.search?.target_role || campaign.target_business_type,
          location: campaign.location,
          include_title_terms: campaign.search?.include_title_terms || campaign.search?.include_titles || [],
          exclude_title_terms: campaign.search?.exclude_title_terms || campaign.search?.exclude_titles || [],
          description_keywords: campaign.search?.description_keywords || [],
          job_types: campaign.search?.job_types || campaign.filters?.job_types || [],
        },
        candidate,
        job: {
          id: job.id,
          title: job.title,
          company: job.company,
          location: job.location,
          job_type: job.job_type,
          description: text(job.description).slice(0, 7000),
          posted_at: job.posted_at,
        },
      };

      const inputHash = await sha256(JSON.stringify(judgmentInput));
      if (match.ai_status === "completed" && match.ai_input_hash === inputHash && match.ai_prompt_version === PROMPT_VERSION) {
        cached += 1;
        results.push({ job_id: job.id, cached: true, verdict: match.ai_verdict, score: match.ai_role_relevance_score });
        continue;
      }

      const claim = await supabase.from("campaign_job_matches").update({
        ai_status: "processing",
        ai_attempt_count: Number(match.ai_attempt_count || 0) + 1,
        ai_last_error: null,
        orchestrator_run_id: runId,
        updated_at: new Date().toISOString(),
      })
        .eq("id", match.id)
        .neq("ai_status", "processing")
        .eq("selected_for_campaign", false)
        .is("user_decision", null)
        .select("id")
        .maybeSingle();
      if (claim.error) throw new Error(claim.error.message);
      if (!claim.data) { preserved += 1; continue; }

      try {
        const ai = await callOpenAI(judgmentInput);
        const originalRelevance = Math.round(clamp(ai.role_relevance_score, 0, 100));
        let relevance = originalRelevance;
        const confidence = clamp(ai.confidence, 0, 1);
        const conflicts = list(ai.conflicts);
        const matchedRequirements = list(ai.matched_requirements);
        const rawModelVerdict = ["pass", "review", "reject"].includes(ai.verdict) ? ai.verdict : "reject";

        const targetRole = normalized(campaign.search?.target_role || campaign.target_business_type);
        const roleFamilyText = text(ai.role_family);
        const roleFamily = normalized(roleFamilyText);
        const normalizedTitle = normalized(job.title);
        const includeTerms = campaign.search?.include_title_terms || campaign.search?.include_titles || [];
        const excludeTerms = campaign.search?.exclude_title_terms || campaign.search?.exclude_titles || [];
        const includedTitleMatch = containsPhrase(job.title, includeTerms) || Boolean(targetRole && normalizedTitle.includes(targetRole));
        const excludedTitleMatch = containsPhrase(job.title, excludeTerms);
        const sameRoleFamily = Boolean(roleFamily && targetRole && (roleFamily.includes(targetRole) || targetRole.includes(roleFamily)));

        let consistencyAdjusted = false;
        if (rawModelVerdict === "pass" && !excludedTitleMatch && includedTitleMatch && sameRoleFamily && matchedRequirements.length >= 3 && conflicts.length === 0 && relevance < 80) {
          relevance = 80;
          consistencyAdjusted = true;
        }

        let verdict: "pass" | "review" | "reject";
        if (rawModelVerdict === "reject") verdict = "reject";
        else if (rawModelVerdict === "review") verdict = "review";
        else if (relevance < 55 || excludedTitleMatch) verdict = "reject";
        else if (relevance >= 80 && confidence >= 0.8 && conflicts.length === 0) verdict = "pass";
        else verdict = "review";

        const filterStatus = verdict === "pass" ? "eligible" : "rejected";
        const update = await supabase.from("campaign_job_matches").update({
          ai_status: "completed",
          ai_verdict: verdict,
          ai_role_relevance_score: relevance,
          ai_candidate_fit_score: Math.round(clamp(ai.candidate_fit_score, 0, 100)),
          ai_confidence: confidence,
          ai_role_family: roleFamilyText || null,
          ai_matched_requirements: matchedRequirements,
          ai_conflicts: conflicts,
          ai_reason: `${consistencyAdjusted ? `[Consistency safeguard raised relevance from ${originalRelevance} to ${relevance}.] ` : ""}${text(ai.reason)}`.slice(0, 1000),
          ai_model: MODEL,
          ai_prompt_version: PROMPT_VERSION,
          ai_input_hash: inputHash,
          ai_judged_at: new Date().toISOString(),
          ai_last_error: null,
          filter_status: filterStatus,
          updated_at: new Date().toISOString(),
        })
          .eq("id", match.id)
          .eq("selected_for_campaign", false)
          .is("user_decision", null);
        if (update.error) throw new Error(update.error.message);

        judged += 1;
        if (verdict === "pass") passed += 1;
        else if (verdict === "review") reviewed += 1;
        else rejected += 1;

        results.push({
          job_id: job.id,
          title: job.title,
          verdict,
          model_verdict: rawModelVerdict,
          relevance,
          original_relevance: originalRelevance,
          confidence,
          consistency_adjusted: consistencyAdjusted,
          reason: text(ai.reason),
        });
      } catch (error) {
        failed += 1;
        await supabase.from("campaign_job_matches").update({
          ai_status: "failed",
          ai_last_error: error instanceof Error ? error.message : String(error),
          updated_at: new Date().toISOString(),
        })
          .eq("id", match.id)
          .eq("selected_for_campaign", false)
          .is("user_decision", null);
        results.push({ job_id: job.id, title: job.title, error: error instanceof Error ? error.message : String(error) });
      }
    }

    return reply({
      ok: failed === 0,
      function: "judge-campaign-jobs",
      version: "model_verdict_guard_v4_preserve_campaign_history",
      campaign_id: campaignId,
      orchestrator_run_id: runId,
      model: MODEL,
      prompt_version: PROMPT_VERSION,
      considered: (matchResult.data || []).length,
      judged,
      cached,
      preserved,
      passed,
      reviewed,
      rejected,
      failed,
      results,
    }, failed === 0 ? 200 : 207);
  } catch (error) {
    return reply({
      ok: false,
      function: "judge-campaign-jobs",
      version: "model_verdict_guard_v4_preserve_campaign_history",
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});
