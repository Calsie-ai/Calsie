export const CARE_AGENTS: Record<string, { title: string; category: string }> = {
  "support-worker": { title: "Disability Agent", category: "Disability" },
  childcare: { title: "Childcare Agent", category: "Childcare" },
  agecare: { title: "Aged Care Agent", category: "Aged Care" },
};

export function careAgentForSlug(slug: string | null | undefined) {
  return slug ? CARE_AGENTS[slug] || null : null;
}
