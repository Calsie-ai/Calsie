type Row = Record<string, unknown>;

const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("APPLIX_SERVICE_ROLE_KEY") || "";
const OUTSCRAPER_API_KEY = Deno.env.get("OUTSCRAPER_API_KEY") || "";
const OUTSCRAPER_API_URL = Deno.env.get("OUTSCRAPER_JOBS_API_URL") || "https://api.outscraper.cloud/indeed-search";
const INDEED_BASE_URL = Deno.env.get("OUTSCRAPER_INDEED_BASE_URL") || "https://au.indeed.com/jobs";

function reply(body: unknown, status = 200)