// Genuinely identical mechanics shared across all 7 templates — kept to
// pure logic only. Each template's actual layout/JSX/StyleSheet stays in
// its own file on purpose: the point of having 7 templates is that they
// differ structurally, so over-abstracting the visual pieces would just
// make every template harder to tune without affecting the others.

import type { ResumePdfData } from "./types";

export function contactParts(data: ResumePdfData): string {
  return [data.phone, data.email, data.location, data.linkedin, data.websiteOrPortfolio]
    .map((part) => part.trim())
    .filter(Boolean)
    .join("   •   ");
}
