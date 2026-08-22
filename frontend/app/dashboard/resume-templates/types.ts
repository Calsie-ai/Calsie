// Shared contract for every resume PDF template. Moved here (out of the
// old single-template resume-pdf-document.tsx) since all 7 templates in
// this folder consume the exact same data — they only differ in how they
// lay it out.

import type {
  CertificationEntry,
  EducationEntry,
  LicenceEntry,
  ReferenceEntry,
  WorkExperienceEntry,
} from "../../../lib/resumeBuilderContent";

export type ResumePdfData = {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  websiteOrPortfolio: string;
  summary: string;
  headline: string;
  skills: string[];
  workExperience: WorkExperienceEntry[];
  education: EducationEntry[];
  certifications: CertificationEntry[];
  licences: LicenceEntry[];
  references: ReferenceEntry[];
};

export type ResumeTemplateId =
  | "clean"
  | "professional"
  | "pureAts"
  | "traditional"
  | "specialist"
  | "entryLevel"
  | "academic";

export type ResumeTemplateMeta = {
  id: ResumeTemplateId;
  name: string;
  description: string;
  bestFor: string;
  font: "Helvetica" | "Times-Roman";
  // The template's one accent color (section headings/rules only — body
  // text always stays black). Also drives the picker-card sketch below,
  // so the preview can't drift from what the PDF actually looks like.
  accentColor: string;
  // Whether the name/contact header is left-aligned or centred — also
  // read by the picker-card sketch.
  headerAlign: "left" | "center";
  // Section order as it actually renders — also drives the small layout
  // sketch on the picker cards, so the preview is never out of sync with
  // the real template.
  sections: string[];
};

// Every template still lists Work Experience with real reverse-chronological
// dates — per 2026 ATS research, formats that hide the timeline (true
// "functional" resumes) are now read by 63% of recruiters as gap-concealment
// and parse far worse on Workday/Taleo. Only order, emphasis, font, and
// spacing density vary between these.
export const RESUME_TEMPLATES: ResumeTemplateMeta[] = [
  {
    id: "clean",
    name: "Clean",
    description: "Minimal and uncluttered, with a thin rule under each section heading.",
    bestFor: "A safe, versatile default for most roles.",
    font: "Helvetica",
    accentColor: "#3A3A3A",
    headerAlign: "left",
    sections: ["Summary", "Skills", "Experience", "Education", "Certifications"],
  },
  {
    id: "professional",
    name: "Professional",
    description: "A navy header band and bolder section labels for a more polished look.",
    bestFor: "Corporate, office, and admin roles.",
    font: "Helvetica",
    accentColor: "#1F3A5F",
    headerAlign: "left",
    sections: ["Summary", "Skills", "Experience", "Education", "Certifications"],
  },
  {
    id: "pureAts",
    name: "Pure ATS",
    description: "Maximum stripped-down formatting — no rules, colour, or styling flourishes at all.",
    bestFor: "When you want the safest possible option for automated screening.",
    font: "Helvetica",
    accentColor: "#000000",
    headerAlign: "left",
    sections: ["Summary", "Skills", "Experience", "Education", "Certifications"],
  },
  {
    id: "traditional",
    name: "Traditional",
    description: "A centred serif header in burgundy and conservative, classic structure.",
    bestFor: "Established industries and formal workplaces.",
    font: "Times-Roman",
    accentColor: "#6B1F2A",
    headerAlign: "center",
    sections: ["Summary", "Experience", "Education", "Skills", "Certifications"],
  },
  {
    id: "specialist",
    name: "Specialist",
    description: "Certifications and licences promoted right after your summary, in forest green.",
    bestFor: "Aged care, disability support, and trade roles where checks come first.",
    font: "Helvetica",
    accentColor: "#2F5233",
    headerAlign: "left",
    sections: ["Summary", "Certifications", "Skills", "Experience", "Education"],
  },
  {
    id: "entryLevel",
    name: "Entry Level",
    description: "Education comes first, in dark teal, with looser spacing for shorter resumes.",
    bestFor: "Graduates and candidates with limited work history.",
    font: "Helvetica",
    accentColor: "#1F5C5C",
    headerAlign: "left",
    sections: ["Summary", "Education", "Skills", "Experience", "Certifications"],
  },
  {
    id: "academic",
    name: "Academic",
    description: "Education and references given the most prominence, formal serif type.",
    bestFor: "Academic, research, and postgraduate-pathway roles.",
    font: "Times-Roman",
    accentColor: "#2A2A40",
    headerAlign: "center",
    sections: ["Summary", "Education", "Certifications", "Skills", "Experience", "References"],
  },
];

export const DEFAULT_RESUME_TEMPLATE: ResumeTemplateId = "professional";

export function resumeTemplateMeta(id: ResumeTemplateId): ResumeTemplateMeta {
  return RESUME_TEMPLATES.find((template) => template.id === id) || RESUME_TEMPLATES[0];
}
