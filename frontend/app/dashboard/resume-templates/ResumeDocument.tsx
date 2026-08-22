// Single entry point BuildResumePanel calls into — picks the right
// template component for the id the user selected. This is the only
// import that needs to change if a template is renamed or a new one added.

import AcademicTemplate from "./AcademicTemplate";
import CleanTemplate from "./CleanTemplate";
import EntryLevelTemplate from "./EntryLevelTemplate";
import ProfessionalTemplate from "./ProfessionalTemplate";
import PureAtsTemplate from "./PureAtsTemplate";
import SpecialistTemplate from "./SpecialistTemplate";
import TraditionalTemplate from "./TraditionalTemplate";
import type { ResumePdfData, ResumeTemplateId } from "./types";

export type { ResumePdfData, ResumeTemplateId } from "./types";
export { DEFAULT_RESUME_TEMPLATE, RESUME_TEMPLATES, resumeTemplateMeta } from "./types";

export default function ResumeDocument({ templateId, data }: { templateId: ResumeTemplateId; data: ResumePdfData }) {
  switch (templateId) {
    case "professional": return <ProfessionalTemplate data={data} />;
    case "pureAts": return <PureAtsTemplate data={data} />;
    case "traditional": return <TraditionalTemplate data={data} />;
    case "specialist": return <SpecialistTemplate data={data} />;
    case "entryLevel": return <EntryLevelTemplate data={data} />;
    case "academic": return <AcademicTemplate data={data} />;
    case "clean":
    default:
      return <CleanTemplate data={data} />;
  }
}
