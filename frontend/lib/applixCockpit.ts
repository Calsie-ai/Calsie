import { getSupabaseClient } from "./supabaseClient";

const TABLES = [
  "campaigns",
  "campaign_leads",
  "lead_contact_emails",
  "outreach_queue",
  "campaign_lead_personalizations",
  "jobs",
  "applications",
  "resume_versions",
  "user_tasks",
  "applix_logs",
] as const;

export type CockpitTable = (typeof TABLES)[number];

export type CockpitOverview = {
  campaigns: number;
  campaignLeads: number;
  savedContacts: number;
  queueRows: number;
  failedQueue: number;
  aiDrafts: number;
  jobs: number;
  applications: number;
  resumeVersions: number;
  pendingTasks: number;
  logs: number;
};

function assertTable(table: string): asserts table is CockpitTable {
  if (!TABLES.includes(table as CockpitTable)) {
    throw new Error("Unsupported cockpit table.");
  }
}

async function countRows(table: CockpitTable, filter?: (query: any) => any) {
  const supabase = getSupabaseClient();
  let query = supabase.from(table).select("id", { count: "exact", head: true });
  if (filter) query = filter(query);
  const { count, error } = await query;
  if (error) return 0;
  return count ?? 0;
}

export async function getCockpitOverview(): Promise<CockpitOverview> {
  const [
    campaigns,
    campaignLeads,
    savedContacts,
    queueRows,
    failedQueue,
    aiDrafts,
    jobs,
    applications,
    resumeVersions,
    pendingTasks,
    logs,
  ] = await Promise.all([
    countRows("campaigns"),
    countRows("campaign_leads"),
    countRows("lead_contact_emails"),
    countRows("outreach_queue"),
    countRows("outreach_queue", (q) => q.eq("status", "failed")),
    countRows("campaign_lead_personalizations"),
    countRows("jobs"),
    countRows("applications"),
    countRows("resume_versions"),
    countRows("user_tasks", (q) => q.eq("status", "pending")),
    countRows("applix_logs"),
  ]);

  return {
    campaigns,
    campaignLeads,
    savedContacts,
    queueRows,
    failedQueue,
    aiDrafts,
    jobs,
    applications,
    resumeVersions,
    pendingTasks,
    logs,
  };
}

export async function listCockpitRows(table: string, limit = 100) {
  assertTable(table);
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(table)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data ?? [];
}
