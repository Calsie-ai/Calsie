type Row = Record<string, any>;

const OUTSCRAPER_API_KEY = Deno.env.get("OUTSCRAPER_API_KEY") || "";
const OUTSCRAPER_API_URL = Deno.env.get("OUTSCRAPER_JOBS_API_URL") || "https://api.outscraper.cloud/indeed-search";
const INDEED_BASE_URL = Deno.env.get("OUTSCRAPER_INDEED_BASE_URL") || "https://au.indeed.com/jobs";

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function decodeJwtPayload(token: string): Row | null {
  const parts = token.split