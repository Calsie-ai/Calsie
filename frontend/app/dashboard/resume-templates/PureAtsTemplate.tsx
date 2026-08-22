// The most stripped-down option — no rules, no uppercase/letter-spacing
// styling, tightest allowed margins (36pt) to maximise parseable text per
// page. Bold weight is the only visual differentiation used anywhere.
// This is the "if in doubt, use this one" template.

import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { formatDateRange } from "../../../lib/resumeBuilderContent";
import { contactParts } from "./shared";
import type { ResumePdfData } from "./types";

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    lineHeight: 1.4,
    color: "#000000",
    padding: "36pt",
  },
  name: { fontFamily: "Helvetica-Bold", fontSize: 16, lineHeight: 1.15, marginBottom: 6 },
  headline: { fontFamily: "Helvetica-Bold", fontSize: 10.5, marginBottom: 4 },
  contactLine: { fontSize: 9.5, color: "#222222", marginBottom: 10 },
  sectionHeading: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10.5,
    marginTop: 11,
    marginBottom: 4,
  },
  paragraph: { fontSize: 10, lineHeight: 1.4 },
  skillsRow: { flexDirection: "row", flexWrap: "wrap" },
  skillItem: { fontSize: 9.5, marginRight: 12, marginBottom: 2 },
  entry: { marginBottom: 7 },
  entryHeadRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  entryTitle: { fontFamily: "Helvetica-Bold", fontSize: 10 },
  entryDates: { fontSize: 9.5, color: "#222222" },
  entrySubline: { fontSize: 9.5, color: "#222222", marginBottom: 2 },
  bulletRow: { flexDirection: "row", marginBottom: 1 },
  bulletMark: { width: 10, fontSize: 9.5 },
  bulletText: { flex: 1, fontSize: 9.5, lineHeight: 1.35 },
  refGrid: { flexDirection: "row", flexWrap: "wrap" },
  refCard: { width: "50%", marginBottom: 6, paddingRight: 10 },
  refName: { fontFamily: "Helvetica-Bold", fontSize: 9.5 },
  refMeta: { fontSize: 9.5, color: "#222222" },
});

export default function PureAtsTemplate({ data }: { data: ResumePdfData }) {
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
            <Text style={styles.sectionHeading}>Certifications and Licences</Text>
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
