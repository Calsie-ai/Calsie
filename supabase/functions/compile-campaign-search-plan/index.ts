import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type Row = Record<string, any>;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("APPLIX_SERVICE_ROLE_KEY") || "";

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

function text(value: unknown): string {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function object(value: unknown): Row {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value as Row;
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Row : {};
  } catch {
    return {};
  }
}

function array(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === "") return [];
  return [value];
}

function unique(values: unknown[]) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function safeInteger(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function deriveRoleFamily(values: string[]) {
  const joined = values.join(" ").toLowerCase();
  if (/account|finance|bookkeep|payroll|audit/.test(joined)) return "accounting_finance";
  if (/support worker|disability|community care|ndis/.test(joined)) return "disability_support";
  return "general";
}

function defaultIncludeTitles(roleFamily: string) {
  if (roleFamily === "accounting_finance") {
    return [
      "Junior Accountant",
      "Assistant Accountant",
      "Graduate Accountant",
      "Accounts Officer",
      "Finance Officer",
      "Accounts Payable Officer",
      "Accounts Receivable Officer",
      "Bookkeeper",
    ];
  }
  return [];
}

function defaultExcludeTitles(roleFamily: string) {
  const universal = ["Director", "Head", "Chief", "CFO", "Controller"];
  if (roleFamily === "accounting_finance") {
    return [...universal, "Senior", "Manager", "Finance Business Partner"];
  }
  return universal;
}

function compilePlan(campaign: Row, input: Row) {
  const search = object(campaign.search);
  const filters = object(campaign.filters);
  const outreach = object(campaign.outreach);

  const roleCandidates = unique([
    input.target_role,
    search.target_role,
    search.job_title,
    search.role,
    filters.job_title,
    campaign.target_business_type,
    campaign.name,
    ...array(search.job_titles),
    ...array(search.roles),
    ...array(outreach.job_titles),
    ...array(outreach.roles),
  ]);

  const locationCandidates = unique([
    input.location,
    search.target_location,
    search.location,
    filters.location,
    outreach.location,
    campaign.location,
    ...array(search.locations),
    ...array(outreach.locations),
  ]);

  const targetRole = roleCandidates[0] || "";
  const location = locationCandidates[0] || "";
  const roleFamily = deriveRoleFamily(roleCandidates);

  const configuredIncludes = unique([
    ...array(input.include_titles),
    ...array(filters.include_titles),
    ...array(filters.included_titles),
    ...array(search.include_titles),
    ...array(outreach.include_titles),
  ]);

  const configuredExcludes = unique([
    ...array(input.exclude_titles),
    ...array(filters.exclude_titles),
    ...array(filters.excluded_titles),
    ...array(search.exclude_titles),
    ...array(outreach.exclude_titles),
  ]);

  const includeTitles = configuredIncludes.length ? configuredIncludes : defaultIncludeTitles(roleFamily);
  const excludeTitles = unique([
    ...defaultExcludeTitles(roleFamily),
    ...configuredExcludes,
  ]);

  const queryRoles = includeTitles.length ? includeTitles : (targetRole ? [targetRole] : []);
  const queries = unique(queryRoles.map((role) => [role, location].filter(Boolean).join(" ")));

  return {
    version: "calsie_search_plan_v2_phase_1",
    campaign_id: campaign.id,
    intent: roleFamily,
    target_role: targetRole,
    location,
    include_titles: includeTitles,
    exclude_titles: excludeTitles,
    queries,
    job_types: unique([
      ...array(input.job_types),
      ...array(filters.job_types),
      ...array(filters.employment_types),
      ...array(search.job_types),
    ]),
    work_modes: unique([
      ...array(input.work_modes),
      ...array(filters.work_modes),
      ...array(filters.work_mode),
      ...array(search.work_modes),
    ]),
    daily_target: safeInteger(input.daily_target ?? outreach.daily_target ?? outreach.target_email_count ?? outreach.daily_cap, 24, 1, 24),
    catalogue_age_days: safeInteger(input.catalogue_age_days, 30, 1, 30),
    minimum_match_score: safeInteger(input.minimum_match_score ?? filters.minimum_match_score, 70, 0, 100),
    compiled_at: new Date().toISOString(),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "POST") return reply({ ok: false, error: "Use POST" }, 405);
    if (!SUPABASE_URL || !SERVICE_KEY) return reply({ ok: false, error: "Missing Supabase service configuration" }, 500);

    const authorization = req.headers.get("authorization") || "";
    if (authorization !== `Bearer ${SERVICE_KEY}`) {
      return reply({ ok: false, error: "Service-role authorization required" }, 401);
    }

    const input = await req.json().catch(() => ({})) as Row;
    const campaignId = text(input.campaign_id);
    if (!campaignId) return reply({ ok: false, error: "campaign_id is required" }, 400);

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const campaignResult = await supabase
      .from("campaigns")
      .select("id,user_id,name,location,target_business_type,search,filters,outreach,status,created_at")
      .eq("id", campaignId)
      .maybeSingle();

    if (campaignResult.error) return reply({ ok: false, error: campaignResult.error.message }, 500);
    if (!campaignResult.data) return reply({ ok: false, error: "Campaign not found" }, 404);

    const plan = compilePlan(campaignResult.data as Row, input);
    if (!plan.target_role) return reply({ ok: false, error: "Campaign has no target role" }, 422);
    if (!plan.location) return reply({ ok: false, error: "Campaign has no location" }, 422);

    return reply({ ok: true, function: "compile-campaign-search-plan", plan });
  } catch (error) {
    return reply({
      ok: false,
      function: "compile-campaign-search-plan",
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});
