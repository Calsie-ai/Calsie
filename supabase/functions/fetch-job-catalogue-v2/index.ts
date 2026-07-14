import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type Row = Record<string, any>;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("APPLIX_SERVICE_ROLE_KEY") || "";
const OUTSCRAPER_API_KEY = Deno.env.get("OUTSCRAPER_API_KEY") || "";
const OUTSCRAPER_JOBS_API_URL = Deno.env.get("OUTSCRAPER_JOBS_API