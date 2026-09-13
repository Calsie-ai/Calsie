# Resume Format Research and Design Rationale

## Design constraints

The resume builder serves Australian job seekers and exports PDFs that may be read both by recruiters and applicant tracking systems (ATS). The formats therefore use a single reading column, standard section names, ordinary text, visible employment dates, and reverse-chronological entries. Visual differentiation is limited to typography, spacing, restrained colour, section order, and emphasis; none of the formats relies on graphics, text boxes, sidebars, or multi-column reading order to communicate essential information.

Australian Government guidance recommends a simple professional layout with easy-to-read fonts, a tailored personal summary, relevant skills, reverse-chronological work and education history, and relevant licences with expiry dates.^1 It also recommends using job-ad keywords and moving the most relevant information earlier.^2 UC Berkeley similarly advises standard fonts and headings, recognizable work-history fields, and avoiding tables, graphics, headers, and footers for ATS compatibility.^3 These constraints remain common to all ten formats.

The content model intentionally stays factual. Harvard advises specific, active, fact-based wording, quantified outcomes, concise scanning, and reverse chronology.^4 The University of Michigan expresses an effective accomplishment bullet as “Action Verb + What + How/Why/Impact.”^5 Accordingly, a format changes presentation and section language but never invents achievements, skills, or qualifications.

## Added format: Executive

### Ideology

An experienced leader should establish scope and value quickly rather than lead with education or a generic skill inventory. The format therefore opens with an `Executive Profile`, follows with `Leadership Capabilities`, and renames work history `Career Impact`. The wording prompts the reader to interpret experience through outcomes, accountability, and organisational impact without rewriting the candidate’s underlying facts.

Harvard’s experienced-professional example leads with years of technical leadership and impact, while its action-verb guidance includes terms such as led, directed, orchestrated, improved, strengthened, and surpassed.^6 The University of Michigan notes that a summary is more common for experienced professionals and recommends quantified impact in bullets.^5

### Structure

1. Name, target headline, and contact details
2. Executive Profile
3. Leadership Capabilities
4. Career Impact, with complete dates in reverse chronology
5. Education
6. Professional Credentials
7. References, only when supplied

The gold accent and strong rule create seniority without compromising reading order. Skills are displayed as a compact capability matrix, but remain ordinary text in a single content flow.

## Added format: Career Pivot

### Ideology

Career changers need to connect prior evidence to a new target while retaining a transparent work timeline. The format opens with `Career Profile`, promotes `Transferable Capabilities`, and labels history `Relevant Experience`. It is a hybrid emphasis—not a functional resume—because every role and date remains visible.

Workforce Australia explicitly recommends tailoring the summary, using the employer’s keywords, listing relevant skills near the top, and including skills gained through study, volunteering, hobbies, and work.^1 UC Berkeley recognises skills-oriented formats for career change but separately cautions that ATS submissions need standard work-history fields.^3 University of Pennsylvania guidance recommends a leading summary, transferable skills, outcomes, and a dedicated skills section for a career switch.^7 This format reconciles those recommendations by changing emphasis without hiding chronology.

### Structure

1. Name, target headline, and contact details
2. Career Profile that connects established evidence to the target role
3. Transferable Capabilities
4. Relevant Experience, fully dated and reverse chronological
5. Education & Training
6. Credentials & Licences
7. References, only when supplied

The plum rule provides a distinct identity while the straightforward structure keeps the career story credible and machine-readable.

## Added format: Technical

### Ideology

Technical hiring requires quick validation of concrete tools and evidence. The format therefore surfaces `Technical Skills`, makes a supplied portfolio URL explicit, and labels work history `Technical Experience`. Certifications appear before education because current platform or trade credentials can be stronger screening evidence than older study for many tool-intensive roles.

UC Berkeley describes technical resumes as highlighting technology-related skills, projects, experience, and qualifications.^8 The University of Pennsylvania notes that projects commonly demonstrate technical skills in software and computer science resumes and recommends a GitHub or portfolio link.^9 Projects should show role, technologies, and results rather than exist as an unfiltered list.^10 Because the current builder has no structured projects field, this implementation does not fabricate one; project outcomes can be entered truthfully as bullets under the role where they occurred, while the portfolio receives visible placement.

### Structure

1. Name, target headline, contact details, and explicit portfolio link
2. Technical Profile
3. Technical Skills
4. Technical Experience, fully dated and reverse chronological
5. Technical Certifications
6. Education
7. References, only when supplied

The cyan-blue accent and compact skill labels support rapid scanning without introducing icons, rating bars, or visual proficiency claims that the source data cannot substantiate.

## Content and wording rules

- Keep claims specific, truthful, and relevant to the target role.
- Begin experience bullets with strong action verbs; omit first-person pronouns.
- Prefer evidence of scope and results over task lists, quantifying only when the candidate supplied a defensible figure.
- Mirror accurate terminology from the job advertisement, especially required skills, licences, and tools.
- Preserve employer, role, and date context for every experience entry.
- Treat soft skills as claims to prove through experience bullets; reserve skill lists primarily for concrete or job-relevant capabilities.
- Never infer seniority, credentials, project outcomes, or proficiency levels from a selected visual format.

## Sources

1. Australian Government, Workforce Australia. “[Write a resume](https://www.workforceaustralia.gov.au/individuals/coaching/job-applications/resumes).” Updated 19 February 2026.
2. Australian Government, Workforce Australia. “[Résumé tailoring checklist](https://www.workforceaustralia.gov.au/content/online-learning/course/tailoring-your-resume/assets/resume%20tailoring%20checklist.pdf).”
3. UC Berkeley Career Engagement. “[Resumes](https://career.berkeley.edu/prepare-for-success/resumes/).”
4. Harvard FAS Mignone Center for Career Success. “[Harvard College Guide to Creating a Strong Resume](https://careerservices.fas.harvard.edu/resources/create-a-strong-resume/).”
5. University of Michigan Career Center. “[Resume Resources](https://careercenter.umich.edu/article/resume-resources).”
6. Harvard FAS Mignone Center for Career Success. “[Create Impactful Resumes and Cover Letters](https://careerservices.fas.harvard.edu/resources/hes-create-impactful-resumes-and-cover-letters/).”
7. University of Pennsylvania Career Services. “[How to Make a Career Switch That Actually Works for You](https://careerservices.upenn.edu/blog/2025/05/27/how-to-make-a-career-switch-that-actually-works-for-you/).”
8. UC Berkeley Career Engagement. “[Sample Resumes](https://career.berkeley.edu/prepare-for-success/resumes/sample-resumes/).”
9. University of Pennsylvania Career Services. “[Write a Resume/CV](https://careerservices.upenn.edu/channels/resume/).”
10. University of Pennsylvania Career Services. “[How—and When—to Include Projects on Your Resume](https://careerservices.upenn.edu/blog/2021/02/26/how-and-when-to-include-projects-on-your-resume-plus-examples/).”
