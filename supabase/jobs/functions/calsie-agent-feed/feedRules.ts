const STATES: Record<string, string> = {
  "new south wales": "nsw", victoria: "vic", queensland: "qld", "south australia": "sa",
  "western australia": "wa", tasmania: "tas", "northern territory": "nt", "australian capital territory": "act",
};
function normalise(value: string) {
  let text = value.toLowerCase();
  for (const [name, abbreviation] of Object.entries(STATES)) text = text.replaceAll(name, abbreviation);
  return text.replace(/[^a-z0-9]+/g, " ").trim();
}

// Scraped jobs commonly have a suburb/state but no postcode or coordinates.
// Postcode-derived preferences therefore match the detected STATE, not a fictional radius.
export function matchesLocation(jobLocation: unknown, preference: unknown): boolean {
  const wanted = typeof preference === "string" ? normalise(preference) : "";
  if (!wanted && typeof preference === "string" && preference.trim()) return false;
  if (!wanted || ["australia", "au", "all australia", "anywhere"].includes(wanted)) return true;
  const actual = typeof jobLocation === "string" ? normalise(jobLocation) : "";
  if (!actual) return false;
  const words = wanted.split(" ");
  const state = words.find((word) => Object.values(STATES).includes(word));
  if (/\b\d{4}\b/.test(wanted) && state) return actual.split(" ").includes(state);
  return words.filter((word) => !["au", "australia"].includes(word)).every((word) => actual.split(" ").includes(word));
}

export function plainDescription(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<\/(?:p|div|li)>|<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
  return text || null;
}
