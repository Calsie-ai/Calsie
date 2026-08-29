// Pure data/logic for the "Build Resume" wizard — no React, no Supabase.
// Field shapes here are the source of truth for what gets written into
// resume_profiles' jsonb columns (work_experience, education_locked,
// certifications_locked, licences_locked, references_locked).

export type WorkExperienceEntry = {
  id: string;
  jobTitle: string;
  employer: string;
  location: string;
  startMonth: string;
  startYear: string;
  endMonth: string;
  endYear: string;
  current: boolean;
  bullets: string[];
};

export type EducationEntry = {
  id: string;
  qualification: string;
  institution: string;
  location: string;
  completionYear: string;
  inProgress: boolean;
  grade: string;
};

export type CertificationEntry = {
  id: string;
  name: string;
  issuer: string;
  year: string;
};

export type LicenceEntry = {
  id: string;
  name: string;
  number: string;
  expiry: string;
};

export type ReferenceEntry = {
  id: string;
  name: string;
  relationship: string;
  company: string;
  phone: string;
  email: string;
};

export type WorkRightsStatus = "citizen" | "permanent_resident" | "visa_holder" | "other";

export type WorkRights = {
  status: WorkRightsStatus;
  visaType: string;
  visaExpiry: string;
};

export const EMPTY_WORK_RIGHTS: WorkRights = { status: "citizen", visaType: "", visaExpiry: "" };

export type ResumeIndustry =
  | "Aged Care"
  | "Healthcare & NDIS"
  | "Community Services & Social Care"
  | "Accounting"
  | "Construction & Trades"
  | "General";

export const INDUSTRY_OPTIONS: ResumeIndustry[] = [
  "Aged Care",
  "Healthcare & NDIS",
  "Community Services & Social Care",
  "Accounting",
  "Construction & Trades",
  "General",
];

type IndustryContent = {
  summaryTemplate: (years: string, role: string, skills: string[]) => string;
  suggestedSkills: string[];
  suggestedCertifications: string[];
  suggestedLicences: string[];
};

const SKILL_PHRASE = (skills: string[]) =>
  skills.length ? ` with particular strength in ${skills.slice(0, 3).join(", ")}` : "";

const INDUSTRY_CONTENT: Record<ResumeIndustry, IndustryContent> = {
  "Aged Care": {
    summaryTemplate: (years, role, skills) =>
      `Compassionate and reliable ${role || "Aged Care Worker"}${years ? ` with ${years} of experience` : ""} supporting older Australians with daily living, personal care, and mobility needs${SKILL_PHRASE(skills)}. Known for patience, attention to detail, and a person-centred approach to care.`,
    suggestedSkills: ["Personal care", "Hygiene assistance", "Medication assistance", "Manual handling", "Dementia care", "Meal preparation & support", "Mobility support", "Companionship", "Continence care"],
    suggestedCertifications: ["Certificate III in Individual Support (Ageing)", "First Aid & CPR", "Manual Handling Certificate", "Food Safety Handling"],
    suggestedLicences: ["National Police Check", "NDIS Worker Screening Check", "Driver's Licence"],
  },
  "Healthcare & NDIS": {
    summaryTemplate: (years, role, skills) =>
      `Dedicated ${role || "Disability Support Worker"}${years ? ` with ${years} of experience` : ""} providing physical, emotional, and social support to individuals living with disability under the NDIS${SKILL_PHRASE(skills)}. Focused on empowering independence and full community participation.`,
    suggestedSkills: ["Personal care", "Personal hygiene support", "Community access support", "Behaviour support", "Case notes & reporting", "Medication assistance", "Manual handling"],
    suggestedCertifications: ["Certificate III in Individual Support (Disability)", "First Aid & CPR", "Manual Handling Certificate"],
    suggestedLicences: ["NDIS Worker Screening Check", "Working with Children Check", "National Police Check", "Driver's Licence"],
  },
  "Community Services & Social Care": {
    summaryTemplate: (years, role, skills) =>
      `Motivated ${role || "Community Support Worker"}${years ? ` with ${years} of experience` : ""} supporting individuals and families through assessment, case planning, referrals, and coordinated support${SKILL_PHRASE(skills)}. Committed to positive, client-centred outcomes.`,
    suggestedSkills: ["Case management", "Client advocacy", "Community engagement", "Crisis support", "Case notes & reporting", "Referral coordination"],
    suggestedCertifications: ["Certificate IV in Community Services", "First Aid & CPR", "Mental Health First Aid"],
    suggestedLicences: ["Working with Children Check", "National Police Check", "Driver's Licence"],
  },
  Accounting: {
    summaryTemplate: (years, role, skills) =>
      `Detail-oriented ${role || "Accounting Assistant"}${years ? ` with ${years} of experience` : ""} across accounts payable/receivable, reconciliations, and finance administration${SKILL_PHRASE(skills)}. Known for accuracy, organisation, and reliable turnaround under deadline.`,
    suggestedSkills: ["Accounts payable", "Accounts receivable", "Bank reconciliation", "Payroll", "Xero", "MYOB", "Microsoft Excel"],
    suggestedCertifications: ["Certificate IV in Accounting and Bookkeeping", "Xero Certified Advisor", "MYOB Certificate"],
    suggestedLicences: [],
  },
  "Construction & Trades": {
    summaryTemplate: (years, role, skills) =>
      `Hands-on ${role || "Construction Worker"}${years ? ` with ${years} of experience` : ""} across site work, project support, and skilled trade tasks${SKILL_PHRASE(skills)}. Safety-focused with a strong record of reliable, on-time delivery.`,
    suggestedSkills: ["Site safety compliance", "Manual handling", "Power tool operation", "Blueprint reading", "Team coordination"],
    suggestedCertifications: ["White Card (Construction Induction)", "First Aid & CPR", "Working at Heights"],
    suggestedLicences: ["Driver's Licence", "Forklift Licence", "National Police Check"],
  },
  General: {
    summaryTemplate: (years, role, skills) =>
      `Reliable and adaptable ${role || "professional"}${years ? ` with ${years} of experience` : ""} looking to bring a strong work ethic and a fast learning curve to a new role${SKILL_PHRASE(skills)}. Comfortable working independently or as part of a team.`,
    suggestedSkills: ["Communication", "Time management", "Problem solving", "Customer service", "Teamwork"],
    suggestedCertifications: ["First Aid & CPR"],
    suggestedLicences: ["National Police Check", "Driver's Licence"],
  },
};

export function industryContent(industry: string): IndustryContent {
  return INDUSTRY_CONTENT[industry as ResumeIndustry] || INDUSTRY_CONTENT.General;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MONTH_OPTIONS = MONTHS;

function monthIndex(month: string) {
  const index = MONTHS.indexOf(month);
  return index === -1 ? 0 : index;
}

// Sums each entry's own span rather than min-start/max-end, so overlapping
// or gapped roles don't over/under-count — closest a simple client-side
// estimate can get without asking the user for a total directly.
export function computeYearsOfExperience(entries: WorkExperienceEntry[]): number {
  const now = new Date();
  let totalMonths = 0;

  for (const entry of entries) {
    const startYear = Number.parseInt(entry.startYear, 10);
    if (!Number.isFinite(startYear)) continue;
    const start = new Date(startYear, monthIndex(entry.startMonth), 1);

    const end = entry.current
      ? now
      : Number.isFinite(Number.parseInt(entry.endYear, 10))
        ? new Date(Number.parseInt(entry.endYear, 10), monthIndex(entry.endMonth), 1)
        : null;
    if (!end) continue;

    const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
    if (months > 0) totalMonths += months;
  }

  return Math.round((totalMonths / 12) * 10) / 10;
}

export function formatYearsOfExperience(years: number): string {
  if (years <= 0) return "";
  if (years < 1) return "under a year";
  const rounded = Math.round(years);
  return `${rounded}+ year${rounded === 1 ? "" : "s"}`;
}

export function composeSummary(industry: string, targetRole: string, workExperience: WorkExperienceEntry[], skills: string[]): string {
  const years = formatYearsOfExperience(computeYearsOfExperience(workExperience));
  return industryContent(industry).summaryTemplate(years, targetRole.trim(), skills);
}

export function formatDateRange(startMonth: string, startYear: string, endMonth: string, endYear: string, current: boolean): string {
  const start = startYear ? `${startMonth ? `${startMonth} ` : ""}${startYear}` : "";
  const end = current ? "Present" : endYear ? `${endMonth ? `${endMonth} ` : ""}${endYear}` : "";
  if (!start && !end) return "";
  if (!end) return start;
  return `${start} – ${end}`;
}

// --- Legacy-data safety ---------------------------------------------------
// resume_profiles' jsonb columns are ALREADY populated for many real users
// by a separate AI resume-extraction pipeline elsewhere in the product,
// with no enforced schema — different runs produced different shapes
// (snake_case keys, a single free-text blob, date-range strings instead of
// separate month/year, etc.), and at least one observed shape genuinely
// collides on some field names with what this wizard uses (education's
// legacy {year, institution, qualification} vs. this wizard's
// {completionYear, institution, qualification}).
//
// Each parseLegacy* function below only accepts an array item into the
// wizard if it has a key that is UNIQUE to this wizard's own shape and
// never appears in any observed legacy shape — anything else (including
// a plausible-looking but legacy-shaped object) is silently skipped, not
// coerced. Skipped items are NOT lost: saveDraft() (in BuildResumePanel)
// never writes an empty array back to a column the wizard didn't actually
// populate, so untouched legacy data stays exactly as it was in the
// database until the user replaces it by actually filling in that section.

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}
function strArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(str) : [];
}

export function parseLegacyWorkExperience(value: unknown): WorkExperienceEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .filter((entry) => "jobTitle" in entry)
    .map((entry) => ({
      id: str(entry.id) || createEntryId(),
      jobTitle: str(entry.jobTitle),
      employer: str(entry.employer),
      location: str(entry.location),
      startMonth: str(entry.startMonth),
      startYear: str(entry.startYear),
      endMonth: str(entry.endMonth),
      endYear: str(entry.endYear),
      current: Boolean(entry.current),
      bullets: strArray(entry.bullets),
    }));
}

export function parseLegacyEducation(value: unknown): EducationEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .filter((entry) => "completionYear" in entry)
    .map((entry) => ({
      id: str(entry.id) || createEntryId(),
      qualification: str(entry.qualification),
      institution: str(entry.institution),
      location: str(entry.location),
      completionYear: str(entry.completionYear),
      inProgress: Boolean(entry.inProgress),
      grade: str(entry.grade),
    }));
}

export function parseLegacyCertifications(value: unknown): CertificationEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .filter((entry) => "issuer" in entry)
    .map((entry) => ({ id: str(entry.id) || createEntryId(), name: str(entry.name), issuer: str(entry.issuer), year: str(entry.year) }));
}

export function parseLegacyLicences(value: unknown): LicenceEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .filter((entry) => "expiry" in entry || "number" in entry)
    .map((entry) => ({ id: str(entry.id) || createEntryId(), name: str(entry.name), number: str(entry.number), expiry: str(entry.expiry) }));
}

export function parseLegacyReferences(value: unknown): ReferenceEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .filter((entry) => "relationship" in entry)
    .map((entry) => ({ id: str(entry.id) || createEntryId(), name: str(entry.name), relationship: str(entry.relationship), company: str(entry.company), phone: str(entry.phone), email: str(entry.email) }));
}

const WORK_RIGHTS_STATUSES: WorkRightsStatus[] = ["citizen", "permanent_resident", "visa_holder", "other"];

export function parseLegacyWorkRights(value: unknown): WorkRights {
  if (!isRecord(value)) return EMPTY_WORK_RIGHTS;
  const status = WORK_RIGHTS_STATUSES.includes(value.status as WorkRightsStatus) ? (value.status as WorkRightsStatus) : EMPTY_WORK_RIGHTS.status;
  return { status, visaType: str(value.visaType), visaExpiry: str(value.visaExpiry) };
}

export function createEntryId(): string {
  try {
    if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  } catch {
    // Fall through to a non-cryptographic fallback below.
  }
  return `entry-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
