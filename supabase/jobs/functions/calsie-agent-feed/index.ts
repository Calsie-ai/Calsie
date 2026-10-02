import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { matchesLocation, CATEGORY_POOLS, validJobId, alreadyReviewed, mapFeedJob } from "./feedRules.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const URL = Deno.env.get("SUPABASE_URL") || "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const POOLS = CATEGORY_POOLS;
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
      .select("id,user_id,category,name,status,created_at,preferences")
      .eq("user_id", userId).order("created_at", { ascending: false });
    if (agentsResult.error) throw agentsResult.error;
    const agents = (agentsResult.data || []).filter((agent) => ["draft", "active", "paused"].includes(agent.status) && agent.category in POOLS);
    const requestedId = typeof body?.agent_id === "string" ? body.agent_id : "";
    const agent = requestedId ? agents.find((item) => item.id === requestedId) : agents.find((item) => item.status === "active") || agents[0];
    if (requestedId && !agent) return reply(req, { ok: false, error: "This agent is unavailable to your account." }, 404);
    if (!agent) return reply(req, { ok: true, agent: null, agents, opportunities: [], message: "Choose an agent to review jobs." });
    const category = agent.category as Category;
    const pool = POOLS[category];
    const table = pool.current;
    const decisions: Row[] = [];
    for (let offset = 0; ; offset += 500) {
      const page = await db.from("calsie_job_swipe_decisions")
        .select("source_table,source_job_id,decision,reviewed_at,job_snapshot")
        .eq("user_id", userId).eq("agent_id", agent.id)
        .order("reviewed_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + 499);
      if (page.error) throw page.error;
      decisions.push(...(page.data || []));
      if ((page.data || []).length < 500) break;
    }

    if (action === "decide") {
      if (agent.status !== "active") return reply(req, { ok: false, error: "Start or resume this campaign before reviewing jobs." }, 409);
      const jobId = validJobId(body?.source_job_id);
      const decisionTable = jobId?.includes("-") ? table : pool.legacy;
      if (!jobId || !["approved", "skipped"].includes(body?.decision)) {
        return reply(req, { ok: false, error: "Invalid decision." }, 400);
      }
      const job = await db.from(decisionTable)
        .select("*")
        .eq("id", jobId).maybeSingle();
      if (job.error) throw job.error;
      if (!job.data) return reply(req, { ok: false, error: "Job is no longer in this agent's pool." }, 404);
      if (alreadyReviewed(job.data, decisionTable, decisions)) return reply(req, { ok: false, error: "This job was already reviewed." }, 409);
      if (!matchesLocation(job.data.location, agent.preferences?.location)) return reply(req, { ok: false, error: "This job does not match your campaign location." }, 409);
      const saved = await db.from("calsie_job_swipe_decisions").insert({
        user_id: userId, agent_id: agent.id, category, source_table: decisionTable,
        source_job_id: jobId, decision: body.decision,
        job_snapshot: { id: job.data.id, title: job.data.title, company: job.data.company, location: job.data.location, canonical_apply_url: job.data.canonical_apply_url, job_source: job.data.job_source, source_job_id: job.data.source_job_id, listing_date: job.data.listing_date || null, first_seen_at: job.data.first_seen_at || null, created_at: job.data.created_at || null }, reviewed_at: new Date().toISOString(),
      });
      if (saved.error) {
        if (saved.error.code === "23514" && saved.error.message.includes("campaign_not_active")) {
          return reply(req, { ok: false, error: "Start or resume this campaign before reviewing jobs." }, 409);
        }
        if (saved.error.code === "23505") return reply(req, { ok: false, error: "This job was already reviewed." }, 409);
        throw saved.error;
      }
      return reply(req, { ok: true, decision: body.decision, source_job_id: jobId, agent_id: agent.id });
    }

    const pendingJobs: Row[] = [];
    for (let offset = 0; pendingJobs.length < 100; offset += 500) {
      const page = await db.from(table)
        .select("id,title,company,location,canonical_apply_url,job_source,source_job_id,description,first_seen_at,last_seen_at,work_type,salary_label,raw_payload")
        .order("first_seen_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + 499);
      if (page.error) throw page.error;
      for (const job of page.data || []) {
        if (agent.status === "active" && matchesLocation(job.location, agent.preferences?.location)
          && !alreadyReviewed(job, table, decisions) && pendingJobs.length < 100) pendingJobs.push(job);
      }
      if (agent.status !== "active" || (page.data || []).length < 500) break;
    }
    // History keeps its original table/ID identity. Enrich from the original
    // pool when available, falling back to the saved snapshot if removed.
    const historical = new Map<string, Row>();
    for (const historyTable of [pool.current, pool.legacy]) {
      const ids = decisions.filter((item) => item.source_table === historyTable).map((item) => String(item.source_job_id));
      for (let index = 0; index < ids.length; index += 100) {
        const result = await db.from(historyTable).select("*").in("id", ids.slice(index, index + 100));
        if (result.error) throw result.error;
        for (const row of result.data || []) historical.set(`${historyTable}:${row.id}`, row);
      }
    }
    const opportunities = [
      ...pendingJobs.map((item) => mapFeedJob(item, agent.id, table)),
      ...decisions.map((decision) => {
        const row = historical.get(`${decision.source_table}:${decision.source_job_id}`)
          || { ...decision.job_snapshot, id: decision.source_job_id };
        return mapFeedJob(row, agent.id, decision.source_table, decision);
      }),
    ];
    return reply(req, { ok: true, agent, agents, category, source_table: table, opportunities,
      message: agent.status === "active" ? null : "Start or resume this campaign from Set Up Campaign to review new jobs. Your history is saved." });
  } catch (error) {
    return reply(req, { ok: false, error: error instanceof Error ? error.message : "Could not load agent jobs." }, 500);
  }
});
