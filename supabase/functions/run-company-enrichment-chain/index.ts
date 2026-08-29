import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type Row = Record<string, any>;

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

const FUNCTION_NAME = "run-company-enrichment-chain";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("APPLIX_SERVICE_ROLE_KEY") || "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") || Deno.env.get("APPLIX_CRON_SECRET") || "";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type, x-applix-cron-secret, x-cron-secret, cron-secret",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

function bearerToken(req: Request) {
  return (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
}

async function isAuthorized(req: Request, supabase: ReturnType<typeof createClient>) {
  const token = bearerToken(req);
  const cronHeader = req.headers.get("x-applix-cron-secret") || req.headers.get("x-cron-secret") || req.headers.get("cron-secret") || "";
  if (SUPABASE_SERVICE_ROLE_KEY && token === SUPABASE_SERVICE_ROLE_KEY) return true;
  if (CRON_SECRET && (token === CRON_SECRET || cronHeader === CRON_SECRET)) return true;
  if (!token) return false;
  const user = await supabase.auth.getUser(token);
  return Boolean(user.data.user && !user.error);
}

async function invokeWorker(holderId: string) {
  const response = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/process-company-enrichment-queue`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: SUPABASE_SERVICE_ROLE_KEY,
    },
    body: JSON.stringify({
      lock_id: holderId,
      max_email_finder_calls: 1,
      source: FUNCTION_NAME,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.ok === false) {
    throw new Error(body?.error || `Worker failed with ${response.status}`);
  }
  return body as Row;
}

async function hasDuePending(supabase: ReturnType<typeof createClient>) {
  const { count, error } = await supabase
    .from("company_enrichment_queue")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending")
    .lte("available_at", new Date().toISOString());
  if (error) throw new Error(error.message);
  return Number(count || 0) > 0;
}

async function startNext() {
  const response = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/${FUNCTION_NAME}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: SUPABASE_SERVICE_ROLE_KEY,
    },
    body: JSON.stringify({ source: "self-chain" }),
  });
  await response.arrayBuffer().catch(() => new ArrayBuffer(0));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  let holderId = "";
  let acquired = false;

  try {
    if (req.method !== "POST") return json({ ok: false, error: "Use POST." }, 405);
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return json({ ok: false, error: "Missing Supabase service configuration." }, 500);
    if (!(await isAuthorized(req, supabase))) return json({ ok: false, error: "Unauthorized." }, 401);

    holderId = `${FUNCTION_NAME}-${crypto.randomUUID()}`;
    const lease = await supabase.rpc("acquire_company_enrichment_worker_lease", {
      p_holder_id: holderId,
      p_ttl_seconds: 180,
    });
    if (lease.error) throw new Error(lease.error.message);
    acquired = Boolean(lease.data);

    if (!acquired) {
      return json({ ok: true, function: FUNCTION_NAME, started: false, reason: "worker already active" });
    }

    const worker = await invokeWorker(holderId);
    const pending = await hasDuePending(supabase);

    return json({
      ok: true,
      function: FUNCTION_NAME,
      started: true,
      worker,
      next_pending: pending,
    });
  } catch (error) {
    return json({ ok: false, function: FUNCTION_NAME, error: error instanceof Error ? error.message : String(error) }, 500);
  } finally {
    if (acquired && holderId) {
      await supabase.rpc("release_company_enrichment_worker_lease", { p_holder_id: holderId }).catch(() => null);
      const pending = await hasDuePending(supabase).catch(() => false);
      if (pending) {
        const task = startNext();
        if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(task);
        else task.catch(() => null);
      }
    }
  }
});
