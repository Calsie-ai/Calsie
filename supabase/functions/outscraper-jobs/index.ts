import { serve } from "std/http/server.ts";
import { createClient } from "supabase";

type Row = Record<string, any>;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || SUPABASE_SERVICE_ROLE_KEY;
const OUTSCRAPER_API_KEY = Deno.env.get("OUTSCRAPER_API_KEY") || "";
const OUTSCRAPER_JOBS_API_URL = Deno.env.get("OUTSCRAPER_JOBS_API_URL") || "https://api.outscraper.cloud/indeed-search";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

function text(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const clean = String(value).trim();
  return clean ? clean : null;
}

function bool(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (["true", "1", "yes"].includes(value.toLowerCase())) return true;
    if (["false", "0", "no"].includes(value.toLowerCase())) return false;
  }
  return fallback;
}

function numberValue(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function uniqueStrings(values: unknown[]) {
  return [...new Set(values.map(text).filter(Boolean) as string[])];
}

function toArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
}

function parseJsonIfNeeded(value: unknown): Row {
  if (!value) return {};
  if (typeof value === "object") return value as Row;
  if (typeof value !== "string") return {};

  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed ? parsed as Row : {};
  } catch {
    return {};
  }
}

function normalizeWhitespace(value: unknown) {
  return text(value)?.replace(/\s+/g, " ") || null;
}

function safeLower(value: unknown) {
  return normalizeWhitespace(value)?.toLowerCase() || "";
}

function cleanUrl(value: unknown) {
  const raw = text(value);
  if (!raw) return null;
  return raw.trim();
}

function parsePostedAt(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  const raw = text(value);
  if (!raw) return null;

  const maybeNumber = Number(raw);
  if (Number.isFinite(maybeNumber) && maybeNumber > 1000000000) {
    const date = new Date(maybeNumber);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  const direct = new Date(raw);
  if (!Number.isNaN(direct.getTime())) return direct.toISOString();

  const relative = raw.toLowerCase();
  const match = relative.match(/(\d+)\s+(minute|minutes|hour|hours|day|days)\s+ago/);
  if (!match) return null;

  const amount = Number(match[1]);
  const unit = match[2];
  const now = Date.now();
  const ms =
    unit.startsWith("minute") ? amount * 60 * 1000 :
    unit.startsWith("hour") ? amount * 60 * 60 * 1000 :
    amount * 24 * 60 * 60 * 1000;

  return new Date(now - ms).toISOString();
}

function hoursAgoIso(hours: number) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function daysAgoIso(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function isRecentEnough(postedAt: string | null, postedWithinHours: number) {
  if (!postedAt) return true;
  const parsed = new Date(postedAt);
  if (Number.isNaN(parsed.getTime())) return true;
  return parsed.getTime() >= Date.now() - postedWithinHours * 60 * 60 * 1000;
}

function buildJobDedupeKey(job: Row) {
  return [
    safeLower(job.apply_url),
    safeLower(job.company),
    safeLower(job.title),
    safeLower(job.location),
  ].join("|");
}

function collectQueryTerms(campaign: Row, input: Row) {
  const outreach = parseJsonIfNeeded(campaign.outreach);
  return uniqueStrings([
    input.query,
    outreach.query,
    ...(toArray(outreach.queries)),
    ...(toArray(outreach.keywords)),
    ...(toArray(outreach.job_titles)),
    ...(toArray(outreach.roles)),
  ]);
}

function collectLocations(campaign: Row, input: Row) {
  const outreach = parseJsonIfNeeded(campaign.outreach);
  return uniqueStrings([
    input.location,
    outreach.location,
    ...(toArray(outreach.locations)),
  ]);
}

function collectCompanies(campaign: Row, input: Row) {
  const outreach = parseJsonIfNeeded(campaign.outreach);
  return uniqueStrings([
    input.company,
    ...(toArray(outreach.company_names)),
    ...(toArray(outreach.companies)),
  ]);
}

function flattenRows(value: unknown): Row[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => Array.isArray(item) ? flattenRows(item) : [item as Row]);
}

function extractJobRows(payload: unknown): Row[] {
  if (Array.isArray(payload)) return flattenRows(payload);

  const body = payload as Row;
  if (Array.isArray(body?.data)) return flattenRows(body.data);
  if (Array.isArray(body?.results)) return flattenRows(body.results);
  if (Array.isArray(body?.items)) return flattenRows(body.items);
  if (Array.isArray(body?.jobs)) return flattenRows(body.jobs);
  if (Array.isArray(body?.response?.jobs)) return flattenRows(body.response.jobs);
  if (Array.isArray(body?.response?.results)) return flattenRows(body.response.results);

  return [];
}

function normalizeJob(raw: Row, campaignId: string | null, userId: string) {
  const applyUrl = cleanUrl(
    raw.apply_url ||
    raw.job_url ||
    raw.url ||
    raw.link ||
    raw.job_link ||
    raw.viewJobLink,
  );
  const company = normalizeWhitespace(
    raw.company ||
    raw.company_name ||
    raw.employer ||
    raw.organization,
  );
  const title = normalizeWhitespace(
    raw.title ||
    raw.displayTitle ||
    raw.normTitle ||
    raw.job_title ||
    raw.position ||
    raw.role,
  );
  const location = normalizeWhitespace(
    raw.location ||
    raw.formattedLocation ||
    raw.formatted_location ||
    raw.jobLocationCity ||
    raw.jobLocationState ||
    raw.city ||
    raw.region,
  );
  const postedAt = parsePostedAt(
    raw.posted_at ||
    raw.posted_date ||
    raw.date_posted ||
    raw.publication_date ||
    raw.published_at ||
    raw.pubDate ||
    raw.createDate,
  );

  const salaryText = raw.salarySnippet?.text || raw.salary || null;

  const job: Row = {
    user_id: userId,
    campaign_id: campaignId,
    title,
    company,
    location,
    salary: text(salaryText),
    description: text(raw.description || raw.summary || raw.job_description || raw.snippet),
    apply_url: applyUrl,
    source: "outscraper_indeed",
    posted_at: postedAt,
    job_type: text(raw.job_type || raw.type || raw.employment_type),
    raw_payload: raw,
    job_dedupe_key: "",
  };

  job.job_dedupe_key = buildJobDedupeKey(job);
  return job;
}

function buildIndeedSearchUrl(query: string, location: string) {
  const url = new URL("https://www.indeed.com/jobs");
  url.searchParams.set("q", query);
  url.searchParams.set("l", location);
  return url.toString();
}

function buildOutscraperUrl(campaign: Row, input: Row, limit: number) {
  const endpoint = OUTSCRAPER_JOBS_API_URL || "https://api.outscraper.cloud/indeed-search";
  const url = new URL(endpoint);

  const queryTerms = collectQueryTerms(campaign, input);
  const locations = collectLocations(campaign, input);
  const terms = queryTerms.length ? queryTerms : ["Entry Level IT Support"];
  const places = locations.length ? locations : ["Sydney NSW"];

  for (const term of terms) {
    for (const place of places) {
      url.searchParams.append("query", buildIndeedSearchUrl(term, place));
    }
  }

  url.searchParams.set("limit", String(limit));
  url.searchParams.set("async", "false");
  return url;
}

async function getSignedInUserId(authHeader: string) {
  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });

  const { data, error } = await authClient.auth.getUser();
  if (error || !data.user) {
    throw new Error("Unauthorized: signed-in user token is required");
  }

  return data.user.id;
}

async function loadCampaign(supabase: ReturnType<typeof createClient>, campaignId: string) {
  const { data, error } = await supabase
    .from("campaigns")
    .select("id,user_id,outreach,status,created_at")
    .eq("id", campaignId)
    .single();

  if (error) throw new Error(error.message);
  return data as Row;
}

async function loadRecentCachedJobs(
  supabase: ReturnType<typeof createClient>,
  campaignId: string | null,
  userId: string,
  limit: number,
) {
  let query = supabase
    .from("jobs")
    .select("*")
    .eq("user_id", userId)
    .gte("created_at", hoursAgoIso(24))
    .order("created_at", { ascending: false })
    .limit(limit);

  if (campaignId) query = query.eq("campaign_id", campaignId);
  else query = query.is("campaign_id", null);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

async function loadExistingDedupeKeys(
  supabase: ReturnType<typeof createClient>,
  campaignId: string | null,
  userId: string,
) {
  let query = supabase
    .from("jobs")
    .select("job_dedupe_key")
    .eq("user_id", userId)
    .gte("created_at", daysAgoIso(30));

  if (campaignId) query = query.eq("campaign_id", campaignId);
  else query = query.is("campaign_id", null);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return new Set(
    (data || [])
      .map((row: Row) => text(row.job_dedupe_key))
      .filter(Boolean) as string[],
  );
}

async function insertJobs(supabase: ReturnType<typeof createClient>, jobs: Row[]) {
  let insertedCount = 0;
  let duplicateCount = 0;
  const insertedIds: string[] = [];

  for (const job of jobs) {
    const result = await supabase
      .from("jobs")
      .insert(job)
      .select("id")
      .single();

    if (result.error) {
      if (result.error.code === "23505") {
        duplicateCount += 1;
        continue;
      }

      throw new Error(result.error.message);
    }

    insertedCount += 1;
    insertedIds.push(result.data.id as string);
  }

  return { insertedCount, duplicateCount, insertedIds };
}

async function fetchOutscraperJobs(campaign: Row, input: Row) {
  if (Array.isArray(input.jobs)) return input.jobs as Row[];

  if (!OUTSCRAPER_API_KEY) {
    throw new Error("Missing OUTSCRAPER_API_KEY");
  }

  const limit = Math.max(1, Math.min(100, numberValue(input.results_limit, 24)));
  const url = buildOutscraperUrl(campaign, input, limit);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "X-API-KEY": OUTSCRAPER_API_KEY,
    },
  });

  const responseText = await response.text().catch(() => "");
  let payload: unknown = responseText;

  try {
    payload = responseText ? JSON.parse(responseText) : {};
  } catch {
    payload = { raw: responseText };
  }

  if (!response.ok) {
    throw new Error(`Outscraper indeed-search failed ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`);
  }

  return extractJobRows(payload);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "POST") return json({ ok: false, error: "Use POST" }, 405);
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return json({ ok: false, error: "Missing Supabase service role configuration" }, 500);
    }

    const input = await req.json().catch(() => ({}));
    const authHeader = req.headers.get("authorization") || "";
    const isServiceRoleCall = authHeader === `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`;
    const forceRefresh = bool(input.force_refresh, false);
    const scheduledRun = bool(input.scheduled_run, false);
    const postedWithinHours = Math.max(1, Math.min(168, numberValue(input.posted_within_hours, 24)));
    const requestedLimit = numberValue(input.results_limit, 100);
    const resultsLimit = Math.max(1, Math.min(100, requestedLimit));
    const campaignId = text(input.campaign_id);

    if (!campaignId) {
      return json({ ok: false, error: "campaign_id is required" }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const campaign = await loadCampaign(supabase, campaignId);

    let userId = text(campaign.user_id);
    if (isServiceRoleCall) {
      userId = text(input.user_id) || userId;
    } else {
      const signedInUserId = await getSignedInUserId(authHeader);
      if (text(input.user_id) && text(input.user_id) !== signedInUserId) {
        return json({ ok: false, error: "user_id is only accepted on service role calls" }, 403);
      }

      if (userId && signedInUserId !== userId) {
        return json({ ok: false, error: "Campaign does not belong to the signed-in user" }, 403);
      }

      userId = signedInUserId;
    }

    if (!userId) {
      return json({ ok: false, error: "Unable to resolve user_id for campaign" }, 400);
    }

    if (!isServiceRoleCall && !forceRefresh) {
      const cachedJobs = await loadRecentCachedJobs(supabase, campaignId, userId, resultsLimit);
      if (cachedJobs.length > 0) {
        return json({
          ok: true,
          function: "outscraper-jobs",
          campaign_id: campaignId,
          user_id: userId,
          scheduled_run: scheduledRun,
          used_cached_jobs: true,
          inserted_count: 0,
          duplicate_count: 0,
          cached_job_count: cachedJobs.length,
          jobs: cachedJobs,
        });
      }
    }

    const existingKeys = await loadExistingDedupeKeys(supabase, campaignId, userId);
    const rawJobs = await fetchOutscraperJobs(campaign, input);

    const normalized = rawJobs
      .map((raw) => normalizeJob(raw, campaignId, userId))
      .filter((job) => job.apply_url || job.company || job.title);

    const withinPostedWindow = normalized.filter((job) => isRecentEnough(job.posted_at, postedWithinHours));
    const seenIncomingKeys = new Set<string>();
    const jobsToInsert: Row[] = [];
    let duplicateCount = 0;

    for (const job of withinPostedWindow) {
      const key = text(job.job_dedupe_key);
      if (!key) {
        jobsToInsert.push(job);
        continue;
      }

      if (existingKeys.has(key) || seenIncomingKeys.has(key)) {
        duplicateCount += 1;
        continue;
      }

      seenIncomingKeys.add(key);
      jobsToInsert.push(job);
    }

    const insertResult = await insertJobs(supabase, jobsToInsert);

    return json({
      ok: true,
      function: "outscraper-jobs",
      campaign_id: campaignId,
      user_id: userId,
      scheduled_run: scheduledRun,
      used_cached_jobs: false,
      provider: "outscraper_indeed_search",
      provider_url: OUTSCRAPER_JOBS_API_URL,
      fetched_count: rawJobs.length,
      normalized_count: normalized.length,
      filtered_count: withinPostedWindow.length,
      inserted_count: insertResult.insertedCount,
      duplicate_count: duplicateCount + insertResult.duplicateCount,
      inserted_job_ids: insertResult.insertedIds,
    });
  } catch (error) {
    return json({
      ok: false,
      function: "outscraper-jobs",
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});
