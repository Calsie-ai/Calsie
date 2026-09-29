import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const MAIN_SUPABASE_URL = Deno.env.get("CALSIE_MAIN_SUPABASE_URL") || "https://bnshgtrqbfuphhhdgccs.supabase.co";
const MAIN_PUBLISHABLE_KEY = Deno.env.get("CALSIE_MAIN_PUBLISHABLE_KEY") || "sb_publishable_HLFwtpqvm2UVxVgzR9WhBQ_KL_B1Tfo";
const JOBS_SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const JOBS_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const POOLS = {
  "support-worker": { category: "disability", table: "disability_jobs_apify" },
  "childcare": { category: "childcare", table: "childcare_jobs_apify" },
  "agecare": { category: "aged_care", table: "agecare_jobs_apify" },
} as const;

type Json = Record<string, unknown>;

function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowed = origin === "https://calsie.com.au" || origin === "https://www.calsie.com.au" || origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:");
  return {
    "access-control-allow-origin": allowed ? origin : "https://calsie.com.au",
    "access-control-allow-headers": "authorization, content-type, apikey, x-client-info",
    "access-control-allow-methods": "POST, OPTIONS",
    "vary": "Origin",
  };
}

function response(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(req), "content-type": "application/json" } });
}

async function mainFetch(path: string, token: string, options: RequestInit = {}) {
  return fetch(`${MAIN_SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      apikey: MAIN_PUBLISHABLE_KEY,
      accept: "application/json",
      ...options.headers,
    },
  });
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function mapJob(row: Record<string, any>, campaignId: string, decision?: Record<string, any>) {
  const payload = row.payload && typeof row.payload === "object" ? row.payload : {};
  const description = text(payload.description) || text(payload.jobDescription) || text(payload.summary);
  const logo = text(payload.companyLogo) || text(payload.company_logo);
  const salary = text(row.salary_label) || text(payload.salary) || text(payload.salaryLabel);
  const postedAt = row.listing_date || text(payload.postedAt) || row.created_at || null;
  return {
    opportunity_type: "live_job",
    review_id: `apify:${row.id}`,
    id: String(row.id),
    source_job_id: Number(row.id),
    campaign_id: campaignId,
    title: row.title || null,
    company: row.company || null,
    location: row.location || null,
    source: row.job_source || text(payload.source),
    apply_url: row.canonical_apply_url || text(payload.applyUrl) || text(payload.url),
    extracted_email: null,
    description,
    status: decision?.decision || "pending_review",
    created_at: row.created_at || row.fetched_at || null,
    selected_at: row.fetched_at || row.created_at || null,
    reviewed_at: decision?.reviewed_at || null,
    batch_date: postedAt ? String(postedAt).slice(0, 10) : null,
    campaign_day: null,
    ai_role_relevance_score: null,
    ai_reason: null,
    salary,
    job_type: row.work_type || text(payload.jobType),
    posted_at: postedAt,
    company_logo: logo,
  };
}

async function resolveCampaign(token: string, userId: string, requestedId: string | null) {
  const campaignPath = `/rest/v1/campaigns?select=id,name,location,target_business_type,template_id,source_purchase_id,search,status,created_at&user_id=eq.${encodeURIComponent(userId)}&status=in.(active,launched,scheduled,paused,draft)&order=created_at.desc&limit=100`;
  const campaignRes = await mainFetch(campaignPath, token);
  if (!campaignRes.ok) throw new Error(`Could not read your Calsie campaign (${campaignRes.status}).`);
  const campaigns = await campaignRes.json() as Array<Record<string, any>>;
  const templateRes = await mainFetch("/rest/v1/campaign_templates?select=id,slug,title&is_active=eq.true", token);
  if (!templateRes.ok) throw new Error(`Could not resolve your campaign template (${templateRes.status}).`);
  const templates = await templateRes.json() as Array<{ id: string; slug: string }>;
  const byId = new Map(templates.map((row) => [row.id, row.slug]));
  const candidates = (Array.isArray(campaigns) ? campaigns : []).flatMap((campaign) => {
    const search = campaign.search && typeof campaign.search === "object" ? campaign.search : {};
    const slug = byId.get(text(campaign.template_id) || text(search.template_id) || "");
    return slug && slug in POOLS && (campaign.status !== "draft" || Boolean(campaign.source_purchase_id))
      ? [{ campaign, slug, pool: POOLS[slug as keyof typeof POOLS] }] : [];
  });
  const eligibility = await Promise.all(candidates.map(async (item) => {
    if (item.campaign.status !== "draft") return true;
    const check = await mainFetch("/rest/v1/rpc/calsie_is_paid_agent_campaign", token, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ p_campaign_id: item.campaign.id }),
    });
    if (!check.ok) throw new Error(`Could not verify this agent purchase (${check.status}).`);
    return await check.json() === true;
  }));
  const eligible = candidates.filter((_, index) => eligibility[index]);
  const selected = requestedId ? eligible.find((row) => row.campaign.id === requestedId) : eligible[0];
  return {
    campaign: selected?.campaign || null,
    pool: selected?.pool || null,
    slug: selected?.slug || null,
    campaigns: eligible.map((row) => ({
      id: row.campaign.id,
      name: row.campaign.name,
      status: row.campaign.status,
      pool: row.pool.category,
      template_slug: row.slug,
    })),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return response(req, { ok: false, error: "Use POST." }, 405);

  try {
    if (!JOBS_SUPABASE_URL || !JOBS_SERVICE_ROLE_KEY) throw new Error("Jobs database service configuration is missing.");
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return response(req, { ok: false, error: "Please sign in again." }, 401);

    const userRes = await mainFetch("/auth/v1/user", token);
    if (!userRes.ok) return response(req, { ok: false, error: "Your Calsie session is not valid." }, 401);
    const user = await userRes.json();
    const userId = text(user?.id);
    if (!userId) return response(req, { ok: false, error: "Your Calsie user could not be resolved." }, 401);

    const body = await req.json().catch(() => ({})) as Json;
    const action = text(body.action) || "feed";
    if (action !== "feed" && action !== "validate") return response(req, { ok: false, error: "Unknown action." }, 400);
    const requestedId = text(body.campaign_id);
    const { campaign, pool, slug, campaigns } = await resolveCampaign(token, userId, requestedId);
    if (requestedId && !campaign) return response(req, { ok: false, error: "That agent campaign is unavailable to this user." }, 404);
    if (!campaign || !pool) return response(req, { ok: true, campaign: null, campaigns, pool: null, opportunities: [], message: "Activate a care agent to start reviewing jobs." });

    const db = createClient(JOBS_SUPABASE_URL, JOBS_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

    if (action === "validate") {
      const sourceJobId = Number(body.source_job_id);
      if (!Number.isSafeInteger(sourceJobId) || sourceJobId <= 0) return response(req, { ok: false, error: "Invalid job id." }, 400);

      const jobCheck = await db.from(pool.table).select("id,title,company,location,canonical_apply_url,job_source,listing_date,created_at").eq("id", sourceJobId).maybeSingle();
      if (jobCheck.error) throw jobCheck.error;
      if (!jobCheck.data) return response(req, { ok: false, error: "That job is no longer available in this category feed." }, 404);

      return response(req, {
        ok: true,
        campaign_id: campaign.id,
        source_table: pool.table,
        source_job_id: sourceJobId,
        snapshot: {
          title: jobCheck.data.title,
          company: jobCheck.data.company,
          location: jobCheck.data.location,
          canonical_apply_url: jobCheck.data.canonical_apply_url,
          job_source: jobCheck.data.job_source,
          listing_date: jobCheck.data.listing_date,
          created_at: jobCheck.data.created_at,
        },
      });
    }

    const limitRaw = Number(body.limit ?? 500);
    const limit = Math.max(1, Math.min(Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 500, 500));
    type SavedDecision = { source_job_id: number; decision: string; reviewed_at: string; job_snapshot: Record<string, any> };
    const decisions: SavedDecision[] = [];
    for (let offset = 0; ; offset += 500) {
      const pageRes = await mainFetch(`/rest/v1/calsie_agent_job_decisions?select=source_job_id,decision,reviewed_at,job_snapshot&campaign_id=eq.${campaign.id}&source_table=eq.${pool.table}&order=reviewed_at.desc&limit=500&offset=${offset}`, token);
      if (!pageRes.ok) throw new Error(`Could not load your review history (${pageRes.status}).`);
      const page = await pageRes.json() as SavedDecision[];
      decisions.push(...page);
      if (page.length < 500) break;
    }
    const decisionMap = new Map(decisions.map((row) => [Number(row.source_job_id), row]));
    const jobRows: Record<string, any>[] = [];
    let pendingCount = 0;
    for (let offset = 0; pendingCount < limit; offset += 500) {
      const page = await db.from(pool.table)
        .select("id,job_source,category,canonical_apply_url,title,company,location,payload,fetched_at,created_at,listing_date,work_type,salary_label")
        .order("listing_date", { ascending: false, nullsFirst: false })
        .order("fetched_at", { ascending: false, nullsFirst: false })
        .order("id", { ascending: false })
        .range(offset, offset + 499);
      if (page.error) throw page.error;
      const rows = page.data || [];
      jobRows.push(...rows);
      pendingCount += rows.filter((row) => !decisionMap.has(Number(row.id))).length;
      if (rows.length < 500) break;
    }
    const visibleIds = new Set(jobRows.map((row: any) => Number(row.id)));
    const missingIds = decisions.map((row) => Number(row.source_job_id)).filter((id) => !visibleIds.has(id));
    const historyRows: Record<string, any>[] = [];
    for (let i = 0; i < missingIds.length; i += 100) {
      const history = await db.from(pool.table)
        .select("id,job_source,category,canonical_apply_url,title,company,location,payload,fetched_at,created_at,listing_date,work_type,salary_label")
        .in("id", missingIds.slice(i, i + 100));
      if (history.error) throw history.error;
      historyRows.push(...(history.data || []));
    }
    const fetchedIds = new Set([...jobRows, ...historyRows].map((row: any) => Number(row.id)));
    const snapshots = decisions.filter((row) => !fetchedIds.has(Number(row.source_job_id))).map((row) => ({
      id: row.source_job_id,
      ...row.job_snapshot,
      fetched_at: row.reviewed_at,
      payload: {},
    }));
    let emittedPending = 0;
    const opportunities = [...jobRows.filter((row) => decisionMap.has(Number(row.id)) || emittedPending++ < limit), ...historyRows, ...snapshots]
      .map((row: any) => mapJob(row, campaign.id, decisionMap.get(Number(row.id))));

    return response(req, {
      ok: true,
      campaign: { id: campaign.id, name: campaign.name, location: campaign.location, target_business_type: campaign.target_business_type, status: campaign.status },
      campaigns,
      template_slug: slug,
      pool: pool.category,
      source_table: pool.table,
      opportunities,
      counts: {
        waiting: opportunities.filter((item: any) => item.status === "pending_review").length,
        approved: opportunities.filter((item: any) => item.status === "approved").length,
        skipped: opportunities.filter((item: any) => item.status === "skipped").length,
      },
    });
  } catch (error) {
    return response(req, { ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
