import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { formatDateRange } from "../../../lib/resumeBuilderContent";
import { contactParts } from "./shared";
import type { ResumePdfData } from "./types";

const plum = "#6B365C";
const styles = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 10, lineHeight: 1.45, color: "#1D1A1C", padding: "43pt 48pt" },
  header: { paddingLeft: 12, borderLeft: `4pt solid ${plum}` },
  name: { fontFamily: "Helvetica-Bold", fontSize: 22 },
  headline: { marginTop: 3, fontFamily: "Helvetica-Bold", fontSize: 10.5, color: plum },
  contact: { marginTop: 6, fontSize: 9, color: "#4D474B" },
  heading: { marginTop: 14, marginBottom: 6, paddingBottom: 3, borderBottom: `0.75pt solid ${plum}`, fontFamily: "Helvetica-Bold", fontSize: 10.5, color: plum, textTransform: "uppercase", letterSpacing: .6 },
  summary: { fontSize: 10, lineHeight: 1.5 },
  skills: { flexDirection: "row", flexWrap: "wrap" },
  skill: { width: "50%", paddingRight: 12, marginBottom: 4, fontFamily: "Helvetica-Bold", fontSize: 9.3 },
  entry: { marginBottom: 9 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  title: { maxWidth: "74%", fontFamily: "Helvetica-Bold", fontSize: 10.2 },
  dates: { fontSize: 8.8, color: "#575057" },
  meta: { marginBottom: 3, fontSize: 9.2, color: "#4D474B" },
  bullet: { flexDirection: "row", marginBottom: 1.5 },
  mark: { width: 10, color: plum },
  bulletText: { flex: 1, fontSize: 9.3, lineHeight: 1.42 },
});

export default function CareerPivotTemplate({ data }: { data: ResumePdfData }) {
  const hasCredentials = data.certifications.length > 0 || data.licences.length > 0;
  return (
    <Document title={`${data.fullName || "Resume"} — Career Pivot Resume`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}><Text style={styles.name}>{data.fullName || "Your Name"}</Text>{data.headline ? <Text style={styles.headline}>{data.headline}</Text> : null}{contactParts(data) ? <Text style={styles.contact}>{contactParts(data)}</Text> : null}</View>
        {data.summary ? <View><Text style={styles.heading}>Career Profile</Text><Text style={styles.summary}>{data.summary}</Text></View> : null}
        {data.skills.length ? <View><Text style={styles.heading}>Transferable Capabilities</Text><View style={styles.skills}>{data.skills.map((skill) => <Text key={skill} style={styles.skill}>• {skill}</Text>)}</View></View> : null}
        {data.workExperience.length ? <View><Text style={styles.heading}>Relevant Experience</Text>{data.workExperience.map((entry) => <View key={entry.id} style={styles.entry} wrap={false}><View style={styles.row}><Text style={styles.title}>{entry.jobTitle || "Role"}{entry.employer ? ` — ${entry.employer}` : ""}</Text><Text style={styles.dates}>{formatDateRange(entry.startMonth, entry.startYear, entry.endMonth, entry.endYear, entry.current)}</Text></View>{entry.location ? <Text style={styles.meta}>{entry.location}</Text> : null}{entry.bullets.filter(Boolean).map((bullet, index) => <View key={index} style={styles.bullet}><Text style={styles.mark}>•</Text><Text style={styles.bulletText}>{bullet}</Text></View>)}</View>)}</View> : null}
        {data.education.length ? <View><Text style={styles.heading}>Education & Training</Text>{data.education.map((entry) => <View key={entry.id} style={styles.entry} wrap={false}><View style={styles.row}><Text style={styles.title}>{entry.qualification || "Qualification"}</Text><Text style={styles.dates}>{entry.inProgress ? "In progress" : entry.completionYear}</Text></View><Text style={styles.meta}>{[entry.institution, entry.location].filter(Boolean).join(" — ")}{entry.grade ? ` · ${entry.grade}` : ""}</Text></View>)}</View> : null}
        {hasCredentials ? <View><Text style={styles.heading}>Credentials & Licences</Text>{data.certifications.map((entry) => <Text key={entry.id} style={styles.meta}>• {entry.name}{entry.issuer ? ` — ${entry.issuer}` : ""}{entry.year ? ` (${entry.year})` : ""}</Text>)}{data.licences.map((entry) => <Text key={entry.id} style={styles.meta}>• {entry.name}{entry.expiry ? ` — expires ${entry.expiry}` : ""}</Text>)}</View> : null}
        {data.references.length ? <View><Text style={styles.heading}>References</Text>{data.references.map((entry) => <Text key={entry.id} style={styles.meta}>{entry.name}{entry.relationship ? ` — ${entry.relationship}` : ""}{entry.company ? `, ${entry.company}` : ""}</Text>)}</View> : null}
      </Page>
    </Document>
  );
}
