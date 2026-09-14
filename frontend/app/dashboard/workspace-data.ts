import {
  Briefcase,
  Cpu,
  GraduationCap,
  HeartPulse,
  Headset,
  Layers,
  type LucideIcon,
} from "lucide-react";

export type WorkspaceTab =
  | "overview"
  | "templates"
  | "resume"
  | "buildResume"
  | "gmail"
  | "campaign"
  | "approve"
  | "tracker"
  | "notifications"
  | "profile";

export type CampaignRecord = {
  id: string;
  name: string;
  location: string | null;
  target_business_type: string | null;
  search: {
    target_role?: string;
    target_location?: string | null;
    query_terms?: string[];
    include_title_terms?: string[];
    exclude_title_terms?: string[];
    template_id?: string;
  } | null;
  outreach: Record<string, unknown> | null;
  status: string;
  created_at: string;
};

export type CampaignTemplate = {
  id: string;
  slug?: string;
  title: string;
  campaignName?: string;
  imageUrl?: string | null;
  role: string;
  location: string;
  description: string;
  category: string;
  queryTerms: string[];
  includeTitleTerms: string[];
  excludeTitleTerms: string[];
  descriptionKeywords: string[];
  jobTypes: string[];
  postedWithinDays: number;
  priceAmount?: number;
  compareAtPriceAmount?: number | null;
  currency?: string;
  priceLabel?: string;
  pricingFeatures?: string[];
  paymentRequired?: boolean;
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

const COMMON_JOB_TYPES = ["Casual", "Part-time", "Full-time"];

export const CAMPAIGN_TEMPLATES: CampaignTemplate[] = [
  { id: "support-worker", title: "Support Worker / NDIS", role: "Disability Support Worker", location: "Sydney NSW", description: "Disability support, community access, personal care, and NDIS support-worker roles.", category: "Healthcare & NDIS", queryTerms: ["Disability Support Worker", "Community Support Worker", "NDIS Support Worker"], includeTitleTerms: ["support worker", "disability support", "community support", "psychosocial support worker", "personal care worker"], excludeTitleTerms: ["behaviour support practitioner", "social worker", "youth worker", "aged care worker", "registered nurse", "cleaner", "coordinator", "manager"], descriptionKeywords: ["NDIS", "disability", "community access", "personal care"], jobTypes: COMMON_JOB_TYPES, postedWithinDays: 30 },
  { id: "social-work", title: "Social Work / Mental Health", role: "Mental Health Social Worker", location: "Sydney NSW", description: "Social work, case management, hospital, and mental-health opportunities.", category: "Healthcare & NDIS", queryTerms: ["Mental Health Social Worker", "Social Worker", "Mental Health Case Manager"], includeTitleTerms: ["social worker", "case manager", "mental health clinician"], excludeTitleTerms: ["support worker", "youth worker", "care worker", "registered nurse"], descriptionKeywords: ["mental health", "case management", "social work"], jobTypes: COMMON_JOB_TYPES, postedWithinDays: 30 },
  { id: "business-analyst", title: "Business Analyst", role: "Business Analyst", location: "Sydney NSW", description: "Requirements, reporting, process improvement, and stakeholder roles.", category: "Business", queryTerms: ["Business Analyst", "Junior Business Analyst", "Process Analyst"], includeTitleTerms: ["business analyst", "process analyst", "systems analyst"], excludeTitleTerms: ["senior manager", "director", "data scientist", "financial analyst"], descriptionKeywords: ["requirements", "process improvement", "stakeholder", "reporting"], jobTypes: COMMON_JOB_TYPES, postedWithinDays: 30 },
  { id: "it-support", title: "IT Support", role: "IT Support", location: "Sydney NSW", description: "Service desk, help desk, desktop support, and junior technical roles.", category: "Technology", queryTerms: ["IT Support", "Service Desk Analyst", "Help Desk", "Desktop Support"], includeTitleTerms: ["it support", "service desk", "help desk", "desktop support", "technical support"], excludeTitleTerms: ["customer support", "sales support", "disability support", "senior manager", "director"], descriptionKeywords: ["Microsoft 365", "Active Directory", "ticketing", "troubleshooting"], jobTypes: COMMON_JOB_TYPES, postedWithinDays: 30 },
  { id: "customer-service", title: "Customer Service", role: "Customer Service Representative", location: "Sydney NSW", description: "Customer support, contact centre, administration, and service roles.", category: "Customer Service", queryTerms: ["Customer Service Representative", "Customer Service Officer", "Contact Centre"], includeTitleTerms: ["customer service", "contact centre", "customer support", "client services"], excludeTitleTerms: ["it support", "disability support", "sales manager", "director"], descriptionKeywords: ["customer enquiries", "inbound calls", "client service", "administration"], jobTypes: COMMON_JOB_TYPES, postedWithinDays: 30 },
  { id: "accounting-assistant", title: "Accounting Assistant", role: "Accounting Assistant", location: "Sydney NSW", description: "Accounts payable, bookkeeping, finance administration, and graduate roles.", category: "Business", queryTerms: ["Accounting Assistant", "Accounts Assistant", "Accounts Payable", "Finance Administrator"], includeTitleTerms: ["accounting assistant", "accounts assistant", "accounts payable", "bookkeeper", "finance administrator"], excludeTitleTerms: ["finance manager", "financial controller", "director", "senior accountant"], descriptionKeywords: ["accounts payable", "reconciliation", "bookkeeping", "invoicing"], jobTypes: COMMON_JOB_TYPES, postedWithinDays: 30 },
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

export function templateCategoryIcon(category: string): LucideIcon {
  const key = category.toLowerCase();
  if (key.includes("health") || key.includes("ndis") || key.includes("aged") || key.includes("care") || key.includes("social")) return HeartPulse;
  if (key.includes("tech")) return Cpu;
  if (key.includes("customer")) return Headset;
  if (key.includes("business") || key.includes("account") || key.includes("finance")) return Briefcase;
  if (key.includes("child") || key.includes("education")) return GraduationCap;
  return Layers;
}

// A subtle per-category tint for the small category label on template
// cards — purely a visual grouping cue, category names/logic are unchanged.
export function templateCategoryAccent(category: string): string {
  const key = category.toLowerCase();
  if (key.includes("health") || key.includes("ndis") || key.includes("aged") || key.includes("care") || key.includes("social")) return "ws-tag-teal";
  if (key.includes("tech")) return "ws-tag-blue";
  if (key.includes("customer")) return "ws-tag-pink";
  if (key.includes("business") || key.includes("account") || key.includes("finance")) return "ws-tag-violet";
  if (key.includes("child") || key.includes("education")) return "ws-tag-amber";
  return "ws-tag-neutral";
}
