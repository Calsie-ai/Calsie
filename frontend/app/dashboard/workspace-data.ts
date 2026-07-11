export type WorkspaceTab =
  | "overview"
  | "templates"
  | "resume"
  | "gmail"
  | "campaign"
  | "tracker";

export type CampaignRecord = {
  id: string;
  name: string;
  location: string | null;
  target_business_type: string | null;
  search: { target_role?: string; target_location?: string | null } | null;
  outreach: Record<string, unknown> | null;
  status: string;
  created_at: string;
};

export type CampaignTemplate = {
  id: string;
  title: string;
  role: string;
  location: string;
  description: string;
  category: string;
};

export const CAMPAIGN_PLAN = {
  scheduled: true,
  active: true,
  campaign_days: 30,
  daily_job_limit: 24,
  daily_email_limit: 24,
  hourly_email_limit: 1,
  total_cap: 720,
  require_email: true,
  require_user_approval: true,
  approval_mode: "Ask me before applying",
  test_mode: false,
  gmail_consent_required: true,
} as const;

export const CAMPAIGN_TEMPLATES: CampaignTemplate[] = [
  {
    id: "support-worker",
    title: "Support Worker / NDIS",
    role: "Support Worker",
    location: "Sydney NSW",
    description: "Disability support, community access, personal care, and NDIS roles.",
    category: "Healthcare & NDIS",
  },
  {
    id: "social-work",
    title: "Social Work / Mental Health",
    role: "Mental Health Social Worker",
    location: "Sydney NSW",
    description: "Social work, case management, hospital, and mental health opportunities.",
    category: "Healthcare & NDIS",
  },
  {
    id: "business-analyst",
    title: "Business Analyst",
    role: "Business Analyst",
    location: "Sydney NSW",
    description: "Requirements, reporting, process improvement, and stakeholder roles.",
    category: "Business",
  },
  {
    id: "it-support",
    title: "IT Support",
    role: "IT Support",
    location: "Sydney NSW",
    description: "Service desk, help desk, desktop support, and junior technical roles.",
    category: "Technology",
  },
  {
    id: "customer-service",
    title: "Customer Service",
    role: "Customer Service Representative",
    location: "Sydney NSW",
    description: "Customer support, contact centre, administration, and service roles.",
    category: "Customer Service",
  },
  {
    id: "accounting-assistant",
    title: "Accounting Assistant",
    role: "Accounting Assistant",
    location: "Sydney NSW",
    description: "Accounts payable, bookkeeping, finance administration, and graduate roles.",
    category: "Business",
  },
];

export function isCampaignRunning(status?: string | null) {
  return status === "scheduled" || status === "active" || status === "launched";
}

export function campaignRole(campaign?: CampaignRecord | null) {
  return campaign?.search?.target_role || campaign?.target_business_type || "Not configured";
}

export function campaignLocation(campaign?: CampaignRecord | null) {
  return campaign?.search?.target_location || campaign?.location || "Location not set";
}
