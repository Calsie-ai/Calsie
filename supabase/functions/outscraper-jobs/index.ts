import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const outscraperKey = Deno.env.get("OUTSCRAPER_API_KEY") || "";
const outscraperJobsUrl = Deno.env.get("OUTSCRAPER_JOBS_URL") || "https://api.app.outscraper.com/jobs/search";

type OutscraperJob = Record<string, unknown>;

type RequestBody = {
  role?: string;
  location?: string;
  campaign_id?: string;
  trigger?: string;
};

type CampaignRow = {
  id: string;
  user_id: string;
  name?: string | null;
  location?: string | null;
  target_business_type?: string | null;
  search?: { target_role?: string | null; target_location?: string | null } | null;
};

type NormalizedJob = {
  title: string;
  company: string;
  location: string;
  source: string;
  apply_url: string;
  description: string;
  posted_at: string;
  status: string;
};

function cleanText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function pickText(job: OutscraperJob, keys: string[], fallback = "") {
  for (const key of keys) {
    const value = cleanText(job[key]);
    if (value) return value;
  }
  return fallback;
}

function jobKey(job: { title?: string | null; company?: string | null; apply_url?: string | null }) {
  const applyUrl = cleanText(job.apply_url).toLowerCase();
  if (applyUrl) return `url:${applyUrl}`;
  return `text:${cleanText(job.title).toLowerCase()}::${cleanText(job.company).toLowerCase()}`;
}

function uniqueJobs(jobs: NormalizedJob[]) {
  const seen = new Set<string>();
  return jobs.filter((job) => {
    const key = jobKey(job);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeJobs(payload: unknown, fallbackLocation: string) {
  const raw = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as Record<string, unknown>)?.data)
      ? (payload as Record<string, unknown>).data
      : Array.isArray((payload as Record<string, unknown>)?.results)
        ? (payload as Record<string, unknown>).results
        : [];

  const flattened = raw.flatMap((item) => Array.isArray(item) ? item : [item]) as OutscraperJob[];

  const jobs = flattened.map((job) => ({
    title: pickText(job, ["title", "job_title", "name"], "Untitled job"),
    company: pickText(job, ["company", "company_name", "employer_name", "organization", "organization_name"], "Unknown company"),
    location: pickText(job, ["location", "address", "city"], fallbackLocation),
    source: "Outscraper",
    apply_url: pickText(job, ["apply_link", "apply_url", "url", "job_url", "link"]),
    description: pickText(job, ["description", "snippet", "summary", "job_description"]),
    posted_at: pickText(job, ["posted_at", "date", "created_at", "published_at"]),
    status: "new",
  })).filter((job) => job.title !== "Untitled job" || job.company !== "Unknown company");

  return uniqueJobs(jobs);
}

async function loadExistingJobKeys(supabase: ReturnType<typeof createClient>, userId: string, campaignId: string | null) {
  let query = supabase
    .from("jobs")
    .select("title,company,apply_url")
    .eq("user_id", userId);

  query = campaignId ? query.eq("campaign_id", campaignId) : query.is("campaign_id", null);

  const { data, error } = await query.limit(1000);
  if (error) throw error;

  return new Set((data || []).map((job) => jobKey(job)).filter(Boolean));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing Supabase Edge Function database secrets.");
    }

    if (!outscraperKey) {
      throw new Error("Missing OUTSCRAPER_API_KEY Edge Function secret.");
    }

    const authHeader = req.headers.get("authorization") || "";
    const body = (await req.json().catch(() => ({}))) as RequestBody;

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const userClient = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();

    if (userError || !userData.user) {
      return new Response(JSON.stringify({ ok: false, error: "Please sign in again." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let campaign: CampaignRow | null = null;

    if (body.campaign_id) {
      const { data, error } = await supabase
        .from("campaigns")
        .select("id,user_id,name,location,target_business_type,search")
        .eq("id", body.campaign_id)
        .eq("user_id", userData.user.id)
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!data) throw new Error("Campaign was not found for this user.");
      campaign = data as CampaignRow;
    }

    const role = cleanText(campaign?.search?.target_role || campaign?.target_business_type || campaign?.name || body.role, "support worker");
    const location = cleanText(campaign?.search?.target_location || campaign?.location || body.location, "Sydney NSW");
    const campaignId = campaign?.id || cleanText(body.campaign_id) || null;
    const query = `${role} ${location}`;
    const url = new URL(outscraperJobsUrl);
    url.searchParams.set("query", query);
    url.searchParams.set("async", "false");

    const providerResponse = await fetch(url.toString(), {
      headers: { "X-API-KEY": outscraperKey },
    });

    const providerText = await providerResponse.text().catch(() => "");
    let providerPayload: unknown = providerText;
    try {
      providerPayload = providerText ? JSON.parse(providerText) : null;
    } catch {
      providerPayload = providerText;
    }

    if (!providerResponse.ok) {
      return new Response(JSON.stringify({ ok: false, error: `Outscraper rejected the job search with HTTP ${providerResponse.status}.`, provider_status: providerResponse.status, provider_status_text: providerResponse.statusText, query, role, location, campaign_id: campaignId, details: providerPayload }), {
        status: providerResponse.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const normalizedJobs = normalizeJobs(providerPayload, location).slice(0, 50);

    if (normalizedJobs.length === 0) {
      return new Response(JSON.stringify({ ok: true, count: 0, inserted_count: 0, duplicate_count: 0, saved: true, campaign_id: campaignId, role, location, trigger: body.trigger || "manual", jobs: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const existingKeys = await loadExistingJobKeys(supabase, userData.user.id, campaignId);
    const rows = normalizedJobs
      .filter((job) => !existingKeys.has(jobKey(job)))
      .map((job) => ({
        ...job,
        user_id: userData.user.id,
        campaign_id: campaignId,
      }));

    if (rows.length === 0) {
      return new Response(JSON.stringify({ ok: true, count: normalizedJobs.length, inserted_count: 0, duplicate_count: normalizedJobs.length, saved: true, campaign_id: campaignId, role, location, trigger: body.trigger || "manual", jobs: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data, error } = await supabase.from("jobs").insert(rows).select();

    if (error) {
      return new Response(JSON.stringify({ ok: true, count: normalizedJobs.length, inserted_count: 0, duplicate_count: normalizedJobs.length - rows.length, saved: false, error: error.message, campaign_id: campaignId, role, location, trigger: body.trigger || "manual", jobs: rows }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, count: normalizedJobs.length, inserted_count: data?.length || rows.length, duplicate_count: normalizedJobs.length - rows.length, saved: true, campaign_id: campaignId, role, location, trigger: body.trigger || "manual", jobs: data || rows }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "Could not fetch jobs." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
