import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type Row = Record<string, any>;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "https://bnshgtrqbfuphhhdgccs.supabase.co";

function env(name: string) {
  return Deno.env.get(name) || "";
}

function firstSecretKey() {
  const direct = env("SUPABASE_SERVICE_ROLE_KEY") || env("SERVICE_ROLE_KEY") || env("APPLIX_SERVICE_ROLE_KEY");
  if (direct) return direct;

  const modern = env("SUPABASE_SECRET_KEYS");
  if (!modern) return "";

  try {
    const parsed = JSON.parse(modern);
    if (Array.isArray(parsed)) return parsed[0]?.secret_key || parsed[0]?.key || parsed[0] || "";
    if (typeof parsed === "object" && parsed !== null) return parsed.secret_key || parsed.key || String(Object.values(parsed)[0] || "");
  } catch {
    return modern;
  }

  return "";
}

const SUPABASE_SERVICE_ROLE_KEY = firstSecretKey();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

function txt(value: unknown) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "POST") return reply({ ok: false, error: "Use POST" }, 405);
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return reply({ ok: false, error: "Missing Supabase service role configuration." }, 500);
    }

    const authHeader = req.headers.get("authorization") || "";
    const input = (await req.json().catch(() => ({}))) as Row;
    const queueId = txt(input.queue_id || input.outreach_queue_id || input.id);

    if (!queueId) return reply({ ok: false, error: "queue_id is required" }, 400);

    const userClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const { data: userData, error: userError } = await userClient.auth.getUser();
    const userId = userData?.user?.id;

    if (userError || !userId) {
      return reply({ ok: false, error: "Please sign in again." }, 401);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const queueResult = await supabase
      .from("outreach_queue")
      .select("id,campaign_id,status,review_status")
      .eq("id", queueId)
      .maybeSingle();

    if (queueResult.error) return reply({ ok: false, error: queueResult.error.message }, 500);
    if (!queueResult.data?.id) return reply({ ok: false, error: "Outreach queue row not found." }, 404);

    const campaignResult = await supabase
      .from("campaigns")
      .select("id,user_id")
      .eq("id", queueResult.data.campaign_id)
      .maybeSingle();

    if (campaignResult.error) return reply({ ok: false, error: campaignResult.error.message }, 500);
    if (!campaignResult.data?.id) return reply({ ok: false, error: "Campaign not found." }, 404);

    if (campaignResult.data.user_id !== userId) {
      return reply({ ok: false, error: "This draft does not belong to the signed-in user." }, 403);
    }

    const updatedAt = new Date().toISOString();
    const updateResult = await supabase
      .from("outreach_queue")
      .update({
        status: "queued",
        review_status: "approved",
        updated_at: updatedAt,
      })
      .eq("id", queueId)
      .select("id,status,review_status,updated_at")
      .maybeSingle();

    if (updateResult.error) return reply({ ok: false, error: updateResult.error.message }, 500);

    await supabase
      .from("campaign_lead_personalizations")
      .update({ status: "approved", updated_at: updatedAt })
      .eq("outreach_queue_id", queueId);

    return reply({
      ok: true,
      function: "approve-outreach-draft",
      queue_id: queueId,
      status: updateResult.data?.status || "queued",
      review_status: updateResult.data?.review_status || "approved",
      updated_at: updateResult.data?.updated_at || updatedAt,
    });
  } catch (error) {
    return reply({
      ok: false,
      function: "approve-outreach-draft",
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});
