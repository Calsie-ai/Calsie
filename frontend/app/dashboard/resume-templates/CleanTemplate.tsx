// The original single-template design, kept as the safe baseline option.
// Single column, Helvetica, black/grey text only, thin rule under each
// section heading.

import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { formatDateRange } from "../../../lib/resumeBuilderContent";
import { contactParts } from "./shared";
import type { ResumePdfData } from "./types";

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    lineHeight: 1.4,
    color: "#1A1A1A",
    padding: "42pt 46pt",
  },
  name: { fontFamily: "Helvetica-Bold", fontSize: 20, lineHeight: 1.15, marginBottom: 7 },
  headline: { fontFamily: "Helvetica-Bold", fontSize: 11, color: "#3A3A3A", marginBottom: 4 },
  contactLine: { fontSize: 9, color: "#444444", marginBottom: 4 },
  sectionHeading: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10.5,
    color: "#3A3A3A",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginTop: 13,
    marginBottom: 5,
    paddingBottom: 3,
    borderBottom: "0.75pt solid #3A3A3A",
  },
  paragraph: { fontSize: 10, lineHeight: 1.45 },
  skillsRow: { flexDirection: "row", flexWrap: "wrap" },
  skillItem: { fontSize: 9.5, marginRight: 14, marginBottom: 3 },
  entry: { marginBottom: 9 },
  entryHeadRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  entryTitle: { fontFamily: "Helvetica-Bold", fontSize: 10.5 },
  entryDates: { fontSize: 9, color: "#444444" },
  entrySubline: { fontSize: 9.5, color: "#333333", marginBottom: 3 },
  bulletRow: { flexDirection: "row", marginBottom: 1.5 },
  bulletMark: { width: 10, fontSize: 9.5 },
  bulletText: { flex: 1, fontSize: 9.5, lineHeight: 1.4 },
  refGrid: { flexDirection: "row", flexWrap: "wrap" },
  refCard: { width: "50%", marginBottom: 8, paddingRight: 12 },
  refName: { fontFamily: "Helvetica-Bold", fontSize: 9.5 },
  refMeta: { fontSize: 9, color: "#444444" },
});

export default function CleanTemplate({ data }: { data: ResumePdfData }) {
  const hasCertsOrLicences = data.certifications.length > 0 || data.licences.length > 0;

  return (
    <Document title={`${data.fullName || "Resume"} — Resume`}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.name}>{data.fullName || "Your Name"}</Text>
        {data.headline ? <Text style={styles.headline}>{data.headline}</Text> : null}
        {contactParts(data) ? <Text style={styles.contactLine}>{contactParts(data)}</Text> : null}

        {data.summary ? (
          <View>
            <Text style={styles.sectionHeading}>Professional Summary</Text>
            <Text style={styles.paragraph}>{data.summary}</Text>
          </View>
        ) : null}

        {data.skills.length > 0 ? (
          <View>
            <Text style={styles.sectionHeading}>Key Skills</Text>
            <View style={styles.skillsRow}>
              {data.skills.map((skill) => (
                <Text key={skill} style={styles.skillItem}>• {skill}</Text>
              ))}
            </View>
          </View>
        ) : null}

        {data.workExperience.length > 0 ? (
          <View>
            <Text style={styles.sectionHeading}>Work Experience</Text>
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

        {data.education.length > 0 ? (
          <View>
            <Text style={styles.sectionHeading}>Education</Text>
            {data.education.map((entry) => (
              <View key={entry.id} style={styles.entry} wrap={false}>
                <View style={styles.entryHeadRow}>
                  <Text style={styles.entryTitle}>{entry.qualification || "Qualification"}</Text>
                  <Text style={styles.entryDates}>{entry.inProgress ? "In progress" : entry.completionYear}</Text>
                </View>
                <Text style={styles.entrySubline}>
                  {[entry.institution, entry.location].filter(Boolean).join(" — ")}
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

        {data.references.length > 0 ? (
          <View>
            <Text style={styles.sectionHeading}>References</Text>
            <View style={styles.refGrid}>
              {data.references.map((entry) => (
                <View key={entry.id} style={styles.refCard}>
                  <Text style={styles.refName}>{entry.name}{entry.relationship ? `, ${entry.relationship}` : ""}</Text>
                  {entry.company ? <Text style={styles.refMeta}>{entry.company}</Text> : null}
                  {(entry.phone || entry.email) ? <Text style={styles.refMeta}>{[entry.phone, entry.email].filter(Boolean).join("  ·  ")}</Text> : null}
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </Page>
    </Document>
  );
}
