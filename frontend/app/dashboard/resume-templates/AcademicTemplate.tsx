// Education is the most prominent section (extra detail spacing), a
// centred formal Times-Roman header like Traditional, and References
// always rendered — academic contexts expect referees even when a
// candidate hasn't filled them in yet. Work Experience still keeps its
// full reverse-chronological order and dates.

import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { formatDateRange } from "../../../lib/resumeBuilderContent";
import { contactParts } from "./shared";
import type { ResumePdfData } from "./types";

const styles = StyleSheet.create({
  page: {
    fontFamily: "Times-Roman",
    fontSize: 10.5,
    lineHeight: 1.42,
    color: "#1A1A1A",
    padding: "48pt 52pt",
  },
  header: {
    alignItems: "center",
    paddingBottom: 9,
    marginBottom: 13,
    borderBottom: "1pt solid #2A2A40",
  },
  name: { fontFamily: "Times-Bold", fontSize: 19, lineHeight: 1.15, marginBottom: 7 },
  headline: { fontFamily: "Times-Italic", fontSize: 10.5, color: "#2A2A40", marginBottom: 4 },
  contactLine: { fontSize: 9.5, color: "#444444" },
  sectionHeading: {
    fontFamily: "Times-Bold",
    fontSize: 11.5,
    color: "#2A2A40",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: 14,
    marginBottom: 6,
  },
  paragraph: { fontSize: 10.5, lineHeight: 1.45 },
  educationEntry: { marginBottom: 11 },
  educationHeadRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  educationTitle: { fontFamily: "Times-Bold", fontSize: 11.5 },
  educationDates: { fontFamily: "Times-Italic", fontSize: 9.5, color: "#444444" },
  educationSubline: { fontFamily: "Times-Italic", fontSize: 10.5, color: "#333333", marginTop: 2 },
  skillsRow: { flexDirection: "row", flexWrap: "wrap" },
  skillItem: { fontSize: 10, marginRight: 14, marginBottom: 3 },
  entry: { marginBottom: 9 },
  entryHeadRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  entryTitle: { fontFamily: "Times-Bold", fontSize: 10.5 },
  entryDates: { fontFamily: "Times-Italic", fontSize: 9.5, color: "#444444" },
  entrySubline: { fontFamily: "Times-Italic", fontSize: 10, color: "#333333", marginBottom: 3 },
  bulletRow: { flexDirection: "row", marginBottom: 1.5 },
  bulletMark: { width: 10, fontSize: 10 },
  bulletText: { flex: 1, fontSize: 10, lineHeight: 1.4 },
  refGrid: { flexDirection: "row", flexWrap: "wrap" },
  refCard: { width: "50%", marginBottom: 8, paddingRight: 12 },
  refName: { fontFamily: "Times-Bold", fontSize: 10 },
  refMeta: { fontSize: 9.5, color: "#444444" },
  refPlaceholder: { fontFamily: "Times-Italic", fontSize: 10, color: "#666666" },
});

export default function AcademicTemplate({ data }: { data: ResumePdfData }) {
  const hasCertsOrLicences = data.certifications.length > 0 || data.licences.length > 0;

  return (
    <Document title={`${data.fullName || "Resume"} — Resume`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.name}>{data.fullName || "Your Name"}</Text>
          {data.headline ? <Text style={styles.headline}>{data.headline}</Text> : null}
          {contactParts(data) ? <Text style={styles.contactLine}>{contactParts(data)}</Text> : null}
        </View>

        {data.summary ? (
          <View>
            <Text style={styles.sectionHeading}>Professional Summary</Text>
            <Text style={styles.paragraph}>{data.summary}</Text>
          </View>
        ) : null}

        {data.education.length > 0 ? (
          <View>
            <Text style={styles.sectionHeading}>Education</Text>
            {data.education.map((entry) => (
              <View key={entry.id} style={styles.educationEntry} wrap={false}>
                <View style={styles.educationHeadRow}>
                  <Text style={styles.educationTitle}>{entry.qualification || "Qualification"}</Text>
                  <Text style={styles.educationDates}>{entry.inProgress ? "In progress" : entry.completionYear}</Text>
                </View>
                <Text style={styles.educationSubline}>
                  {[entry.institution, entry.location].filter(Boolean).join(", ")}
                  {entry.grade ? `  ·  ${entry.grade}` : ""}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {hasCertsOrLicences ? (
          <View>
            <Text style={styles.sectionHeading}>Certifications & Licences</Text>
            {data.certifications.map((entry) => (
              <View key={entry.id} style={styles.bulletRow}>
                <Text style={styles.bulletMark}>•</Text>
                <Text style={styles.bulletText}>{entry.name}{entry.issuer ? ` — ${entry.issuer}` : ""}{entry.year ? ` (${entry.year})` : ""}</Text>
              </View>
            ))}
            {data.licences.map((entry) => (
              <View key={entry.id} style={styles.bulletRow}>
                <Text style={styles.bulletMark}>•</Text>
                <Text style={styles.bulletText}>{entry.name}{entry.number ? ` — ${entry.number}` : ""}{entry.expiry ? ` (expires ${entry.expiry})` : ""}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {data.skills.length > 0 ? (
          <View>
            <Text style={styles.sectionHeading}>Skills</Text>
            <View style={styles.skillsRow}>
              {data.skills.map((skill) => (
                <Text key={skill} style={styles.skillItem}>• {skill}</Text>
              ))}
            </View>
          </View>
        ) : null}

        {data.workExperience.length > 0 ? (
          <View>
            <Text style={styles.sectionHeading}>Experience</Text>
            {data.workExperience.map((entry) => (
              <View key={entry.id} style={styles.entry} wrap={false}>
                <View style={styles.entryHeadRow}>
                  <Text style={styles.entryTitle}>{entry.jobTitle || "Role"}{entry.employer ? ` — ${entry.employer}` : ""}</Text>
                  <Text style={styles.entryDates}>{formatDateRange(entry.startMonth, entry.startYear, entry.endMonth, entry.endYear, entry.current)}</Text>
                </View>
                {entry.location ? <Text style={styles.entrySubline}>{entry.location}</Text> : null}
                {entry.bullets.filter(Boolean).map((bullet, index) => (
                  <View key={index} style={styles.bulletRow}>
                    <Text style={styles.bulletMark}>•</Text>
                    <Text style={styles.bulletText}>{bullet}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        ) : null}

        <View>
          <Text style={styles.sectionHeading}>References</Text>
          {data.references.length > 0 ? (
            <View style={styles.refGrid}>
              {data.references.map((entry) => (
                <View key={entry.id} style={styles.refCard}>
                  <Text style={styles.refName}>{entry.name}{entry.relationship ? `, ${entry.relationship}` : ""}</Text>
                  {entry.company ? <Text style={styles.refMeta}>{entry.company}</Text> : null}
                  {(entry.phone || entry.email) ? <Text style={styles.refMeta}>{[entry.phone, entry.email].filter(Boolean).join("  ·  ")}</Text> : null}
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.refPlaceholder}>Available upon request.</Text>
          )}
        </View>
      </Page>
    </Document>
  );
}
