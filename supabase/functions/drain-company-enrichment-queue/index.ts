import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type Row = Record<string, any>;

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

const FUNCTION_NAME = "drain-company-enrichment-queue";
const LEASE_NAME = "company-enrichment-global";
const LEASE_TTL_SECONDS = 180;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "authorization, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

function txt(value: unknown, fallback = "") {
  if (value === undefined || value === null) return fallback;
  const clean = String(value).trim();
  return clean || fallback;
}

async function countQueueState(supabase: any) {
  const now = new Date().toISOString();
  const [due, pending, processing] = await Promise.all([
    supabase
      .from("company_enrichment_queue")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .lte("available_at", now),
    supabase
      .from("company_enrichment_queue")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("company_enrichment_queue")
      .select("id", { count: "exact", head: true })
      .eq("status", "processing"),
  ]);

  const error = due.error || pending.error || processing.error;
  if (error) throw new Error(error.message);
  return {
    due: Number(due.count || 0),
    pending: Number(pending.count || 0),
    processing: Number(processing.count || 0),
  };
}

async function callWorker(workerId: string, triggerSource: string) {
  const response = await fetch(
    `${
      SUPABASE_URL.replace(/\/$/, "")
    }/functions/v1/process-company-enrichment-queue`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${SERVICE_KEY}`,
        apikey: SERVICE_KEY,
      },
      body: JSON.stringify({
        lock_id: workerId,
        max_email_finder_calls: 1,
        source: triggerSource,
      }),
    },
  );

  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.ok === false) {
    throw new Error(body?.error || `Worker failed with ${response.status}`);
  }
  return body as Row;
}

async function kickNext() {
  const response = await fetch(
    `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/${FUNCTION_NAME}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${SERVICE_KEY}`,
        apikey: SERVICE_KEY,
      },
      body: JSON.stringify({ source: "self_chain" }),
    },
  );

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error("Company enrichment self-chain failed", {
      status: response.status,
      body: body.slice(0, 500),
    });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json(
      { ok: false, function: FUNCTION_NAME, error: "Use POST." },
      405,
    );
  }
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return json({
      ok: false,
      function: FUNCTION_NAME,
      error:
        "Missing Supabase service configuration; the queue was not drained.",
    }, 500);
  }

  const input = await req.json().catch(() => ({}));
  const triggerSource = txt(input.source || input.trigger, "unknown");
  const workerId = `${FUNCTION_NAME}-${crypto.randomUUID()}`;
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });
  let leaseAcquired = false;

  try {
    const before = await countQueueState(supabase);
    if (before.due === 0) {
      return json({
        ok: true,
        function: FUNCTION_NAME,
        trigger_source: triggerSource,
        worker_id: workerId,
        lease_acquired: false,
        skipped: true,
        reason: "no_due_work",
        queue_rows_due: 0,
        queue_rows_claimed: 0,
        completed: 0,
        retried: 0,
        failed: 0,
        pending_after_run: before.pending,
        self_chain_requested: false,
      });
    }

    const lease = await supabase.rpc("acquire_queue_worker_lease", {
      p_lease_name: LEASE_NAME,
      p_worker_id: workerId,
      p_ttl_seconds: LEASE_TTL_SECONDS,
    });

    if (lease.error) throw new Error(lease.error.message);
    leaseAcquired = Boolean(lease.data);

    if (!leaseAcquired) {
      return json({
        ok: true,
        function: FUNCTION_NAME,
        trigger_source: triggerSource,
        worker_id: workerId,
        lease_acquired: false,
        skipped: true,
        reason: "global_queue_lease_held",
        queue_rows_due: before.due,
        queue_rows_claimed: 0,
        completed: 0,
        retried: 0,
        failed: 0,
        pending_after_run: before.pending,
        self_chain_requested: false,
      });
    }

    const worker = await callWorker(workerId, triggerSource);
    const after = await countQueueState(supabase);

    const release = await supabase.rpc("release_queue_worker_lease", {
      p_lease_name: LEASE_NAME,
      p_worker_id: workerId,
    });
    if (release.error) throw new Error(release.error.message);
    leaseAcquired = false;

    const selfChainRequested = after.due > 0;
    if (selfChainRequested) EdgeRuntime.waitUntil(kickNext());

    return json({
      ok: true,
      function: FUNCTION_NAME,
      trigger_source: triggerSource,
      worker_id: workerId,
      lease_acquired: true,
      lease_ttl_seconds: LEASE_TTL_SECONDS,
      queue_rows_due: before.due,
      queue_rows_claimed: Number(
        worker.queue_rows_claimed ?? worker.claimed ?? 0,
      ),
      completed: Number(worker.completed || 0),
      retried: Number(worker.retried || 0),
      failed: Number(worker.failed || 0),
      pending_after_run: after.pending,
      pending_due_after_run: after.due,
      processing_after_run: after.processing,
      self_chain_requested: selfChainRequested,
      worker,
      errors: worker.errors || [],
    });
  } catch (error) {
    return json({
      ok: false,
      function: FUNCTION_NAME,
      trigger_source: triggerSource,
      worker_id: workerId,
      lease_acquired: leaseAcquired,
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  } finally {
    if (leaseAcquired) {
      try {
        const release = await supabase.rpc("release_queue_worker_lease", {
          p_lease_name: LEASE_NAME,
          p_worker_id: workerId,
        });
        if (release.error) {
          console.error(
            "Failed to release company enrichment lease",
            release.error.message,
          );
        }
      } catch (releaseError) {
        console.error(
          "Failed to release company enrichment lease",
          releaseError,
        );
        // Automatic lease expiry remains the fallback.
      }
    }
  }
});
