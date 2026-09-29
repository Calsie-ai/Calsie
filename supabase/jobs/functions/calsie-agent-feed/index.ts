import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const URL = Deno.env.get("SUPABASE_URL") || "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const POOLS = {
  disability: "disability_jobs_apify",
  aged_care: "agecare_jobs_apify",
  childcare: "childcare_jobs_apify",
} as const;
type Category = keyof typeof POOLS;
type Row = Record<string, any>;

function headers(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowed = ["https://calsie.com.au", "https://www.calsie.com.au"].includes(origin)
    || origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:");
  return {
    "access-control-allow-origin": allowed ? origin : "https://calsie.com.au",
    "access-control-allow-headers": "authorization, content-type, apikey, x-client-info",
    "access-control-allow-methods": "POST, OPTIONS", vary: "Origin",
    "content-type": "application/json", "cache-control": "no-store",
  };
}
function reply(req: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: headers(req) });
}
function mapJob(row: Row, agentId: string, decision?: Row) {
  const payload = row.payload && typeof row.payload === "object" ? row.payload : {};
  const string = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;
  const posted = row.listing_date || row.created_at || null;
  return {
    opportunity_type: "live_job", review_id: `apify:${row.id}`, id: String(row.id),
    source_job_id: Number(row.id), campaign_id: agentId,
    title: row.title || null, company: row.company || null, location: row.location || null,
    source: row.job_source || null, apply_url: row.canonical_apply_url || null,
    extracted_email: null, description: string(payload.description) || string(payload.jobDescription) || string(payload.summary),
    status: decision?.decision || "pending_review", created_at: row.created_at || null,
    selected_at: row.fetched_at || row.created_at || null, reviewed_at: decision?.reviewed_at || null,
    batch_date: posted ? String(posted).slice(0, 10) : null, campaign_day: null,
    salary: row.salary_label || string(payload.salary), job_type: row.work_type || string(payload.jobType),
    posted_at: posted, company_logo: string(payload.companyLogo) || string(payload.company_logo),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: headers(req) });
  if (req.method !== "POST") return reply(req, { ok: false, error: "Use POST." }, 405);
  if (!URL || !ANON_KEY || !SERVICE_KEY) return reply(req, { ok: false, error: "Agent service is not configured." }, 503);
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return reply(req, { ok: false, error: "Please sign in again." }, 401);

  try {
    const auth = createClient(URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: userResult, error: authError } = await auth.auth.getUser(token);
    if (authError || !userResult.user) return reply(req, { ok: false, error: "Your session is not valid." }, 401);
    const userId = userResult.user.id;
    const db = createClient(URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const body = await req.json().catch(() => ({}));
    const action = body?.action || "feed";
    if (action !== "feed" && action !== "decide") return reply(req, { ok: false, error: "Unknown action." }, 400);

    const agentsResult = await db.from("calsie_agents")
      .select("id,user_id,category,name,status,created_at")
      .eq("user_id", userId).order("created_at", { ascending: false });
    if (agentsResult.error) throw agentsResult.error;
    const agents = (agentsResult.data || []).filter((agent) => agent.status === "active" && agent.category in POOLS);
    const requestedId = typeof body?.agent_id === "string" ? body.agent_id : "";
    const agent = requestedId ? agents.find((item) => item.id === requestedId) : agents[0];
    if (requestedId && !agent) return reply(req, { ok: false, error: "This agent is unavailable to your account." }, 404);
    if (!agent) return reply(req, { ok: true, agent: null, agents, opportunities: [], message: "Choose an agent to review jobs." });
    const category = agent.category as Category;
    const table = POOLS[category];

    if (action === "decide") {
      const jobId = Number(body?.source_job_id);
      if (!Number.isSafeInteger(jobId) || jobId <= 0 || !["approved", "skipped"].includes(body?.decision)) {
        return reply(req, { ok: false, error: "Invalid decision." }, 400);
      }
      const job = await db.from(table)
        .select("id,title,company,location,canonical_apply_url,job_source,listing_date,created_at")
        .eq("id", jobId).maybeSingle();
      if (job.error) throw job.error;
      if (!job.data) return reply(req, { ok: false, error: "Job is no longer in this agent's pool." }, 404);
      const saved = await db.from("calsie_job_swipe_decisions").insert({
        user_id: userId, agent_id: agent.id, category, source_table: table,
        source_job_id: jobId, decision: body.decision,
        job_snapshot: job.data, reviewed_at: new Date().toISOString(),
      });
      if (saved.error) {
        if (saved.error.code === "23505") return reply(req, { ok: false, error: "This job was already reviewed." }, 409);
        throw saved.error;
      }
      return reply(req, { ok: true, decision: body.decision, source_job_id: jobId, agent_id: agent.id });
    }

    const decisions: Row[] = [];
    for (let offset = 0; ; offset += 500) {
      const page = await db.from("calsie_job_swipe_decisions")
        .select("source_job_id,decision,reviewed_at,job_snapshot")
        .eq("user_id", userId).eq("agent_id", agent.id)
        .order("reviewed_at", { ascending: false }).range(offset, offset + 499);
      if (page.error) throw page.error;
      decisions.push(...(page.data || []));
      if ((page.data || []).length < 500) break;
    }
    const byId = new Map(decisions.map((item) => [Number(item.source_job_id), item]));
    const jobs: Row[] = [];
    let pending = 0;
    for (let offset = 0; pending < 100; offset += 500) {
      const page = await db.from(table)
        .select("id,title,company,location,canonical_apply_url,job_source,listing_date,created_at,fetched_at,work_type,salary_label,payload")
        .order("listing_date", { ascending: false, nullsFirst: false })
        .order("id", { ascending: false }).range(offset, offset + 499);
      if (page.error) throw page.error;
      jobs.push(...(page.data || []));
      pending += (page.data || []).filter((item) => !byId.has(Number(item.id))).length;
      if ((page.data || []).length < 500) break;
    }
    const visible = new Set(jobs.map((item) => Number(item.id)));
    const missing = decisions.map((item) => Number(item.source_job_id)).filter((id) => !visible.has(id));
    const historical: Row[] = [];
    for (let index = 0; index < missing.length; index += 100) {
      const result = await db.from(table)
        .select("id,title,company,location,canonical_apply_url,job_source,listing_date,created_at,fetched_at,work_type,salary_label,payload")
        .in("id", missing.slice(index, index + 100));
      if (result.error) throw result.error;
      historical.push(...(result.data || []));
    }
    const found = new Set([...jobs, ...historical].map((item) => Number(item.id)));
    const snapshots = decisions.filter((item) => !found.has(Number(item.source_job_id)))
      .map((item) => ({ id: item.source_job_id, ...item.job_snapshot }));
    let sent = 0;
    const opportunities = [...jobs.filter((item) => byId.has(Number(item.id)) || sent++ < 100), ...historical, ...snapshots]
      .map((item) => mapJob(item, agent.id, byId.get(Number(item.id))));
    return reply(req, { ok: true, agent, agents, category, source_table: table, opportunities });
  } catch (error) {
    return reply(req, { ok: false, error: error instanceof Error ? error.message : "Could not load agent jobs." }, 500);
  }
});
