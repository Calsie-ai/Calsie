import type { CampaignRecord, CampaignTemplate } from "../app/dashboard/workspace-data";

export const CARE_AGENTS: Record<string, { title: string; category: string }> = {
  "support-worker": { title: "Disability Agent", category: "Disability" },
  childcare: { title: "Childcare Agent", category: "Childcare" },
  agecare: { title: "Aged Care Agent", category: "Aged Care" },
};

export function careAgentForSlug(slug: string | null | undefined) {
  return slug ? CARE_AGENTS[slug] || null : null;
}

export const AGENT_TEMPLATES: CampaignTemplate[] = [
  { id: "disability", slug: "support-worker", title: "Disability Agent", role: "Disability Support Worker", category: "Disability", imageUrl: "/images/templates/supportworker.jpg", description: "Review jobs from the classified Disability job pool." },
  { id: "aged_care", slug: "agecare", title: "Aged Care Agent", role: "Aged Care Worker", category: "Aged Care", imageUrl: "/images/templates/agecare.jpg", description: "Review jobs from the classified Aged Care job pool." },
  { id: "childcare", slug: "childcare", title: "Childcare Agent", role: "Childcare Educator", category: "Childcare", imageUrl: "/images/templates/childcare.jpg", description: "Review jobs from the classified Childcare job pool." },
].map((item) => ({ ...item, campaignName: item.title, location: "Australia", queryTerms: [], includeTitleTerms: [], excludeTitleTerms: [], descriptionKeywords: [], jobTypes: [], postedWithinDays: 30, priceAmount: 0, priceLabel: "Payment deferred", paymentRequired: false, pricingFeatures: ["Category job feed", "Smash / Pass decisions", "Review history and tracker"] }));

export type CalsieAgent = { id: string; category: string; name: string; status: string; created_at: string; preferences?: { postcode?: string; location?: string } };

// Adapt NEW agent state to the existing dashboard's presentation contract.
export function agentCampaign(agent: CalsieAgent): CampaignRecord {
  const template = AGENT_TEMPLATES.find((item) => item.id === agent.category);
  return { id: agent.id, name: agent.name, status: agent.status === "paused" ? "paused" : "draft", created_at: agent.created_at,
    location: agent.preferences?.location || template?.location || null,
    target_business_type: template?.role || null,
    search: { template_id: agent.category, target_role: template?.role, target_location: agent.preferences?.location || template?.location },
    outreach: { active: false, scheduled: false },
  };
}
