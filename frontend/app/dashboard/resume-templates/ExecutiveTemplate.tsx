import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { formatDateRange } from "../../../lib/resumeBuilderContent";
import { contactParts } from "./shared";
import type { ResumePdfData } from "./types";

const gold = "#7A5B20";
const styles = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 9.5, lineHeight: 1.4, color: "#171717", padding: "40pt 46pt" },
  header: { paddingBottom: 12, borderBottom: `2pt solid ${gold}` },
  name: { fontFamily: "Helvetica-Bold", fontSize: 24, letterSpacing: -.3 },
  headline: { marginTop: 4, fontFamily: "Helvetica-Bold", fontSize: 11, color: gold, textTransform: "uppercase", letterSpacing: .7 },
  contact: { marginTop: 7, fontSize: 8.8, color: "#444" },
  heading: { marginTop: 13, marginBottom: 5, fontFamily: "Helvetica-Bold", fontSize: 10, color: gold, textTransform: "uppercase", letterSpacing: .8 },
  summary: { fontSize: 10, lineHeight: 1.5 },
  capabilities: { flexDirection: "row", flexWrap: "wrap", padding: "7pt 9pt", backgroundColor: "#F5F1E8" },
  capability: { width: "33.33%", marginBottom: 3, paddingRight: 7, fontFamily: "Helvetica-Bold", fontSize: 8.8 },
  entry: { marginBottom: 9 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  role: { maxWidth: "75%", fontFamily: "Helvetica-Bold", fontSize: 10.2 },
  dates: { fontSize: 8.8, color: "#555" },
  meta: { marginTop: 1, marginBottom: 3, fontSize: 9, color: gold },
  bullet: { flexDirection: "row", marginBottom: 1.5 },
  mark: { width: 10, color: gold },
  bulletText: { flex: 1, fontSize: 9.2, lineHeight: 1.4 },
  credential: { fontSize: 9.2, marginBottom: 2 },
});

export default function ExecutiveTemplate({ data }: { data: ResumePdfData }) {
  const credentials = [...data.certifications.map((item) => `${item.name}${item.issuer ? ` — ${item.issuer}` : ""}${item.year ? ` (${item.year})` : ""}`), ...data.licences.map((item) => `${item.name}${item.expiry ? ` — expires ${item.expiry}` : ""}`)];
  return (
    <Document title={`${data.fullName || "Resume"} — Executive Resume`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.name}>{data.fullName || "Your Name"}</Text>
          {data.headline ? <Text style={styles.headline}>{data.headline}</Text> : null}
          {contactParts(data) ? <Text style={styles.contact}>{contactParts(data)}</Text> : null}
        </View>
        {data.summary ? <View><Text style={styles.heading}>Executive Profile</Text><Text style={styles.summary}>{data.summary}</Text></View> : null}
        {data.skills.length ? <View><Text style={styles.heading}>Leadership Capabilities</Text><View style={styles.capabilities}>{data.skills.map((skill) => <Text key={skill} style={styles.capability}>{skill}</Text>)}</View></View> : null}
        {data.workExperience.length ? <View><Text style={styles.heading}>Career Impact</Text>{data.workExperience.map((entry) => <View key={entry.id} style={styles.entry} wrap={false}><View style={styles.row}><Text style={styles.role}>{entry.jobTitle || "Role"}{entry.employer ? ` — ${entry.employer}` : ""}</Text><Text style={styles.dates}>{formatDateRange(entry.startMonth, entry.startYear, entry.endMonth, entry.endYear, entry.current)}</Text></View>{entry.location ? <Text style={styles.meta}>{entry.location}</Text> : null}{entry.bullets.filter(Boolean).map((bullet, index) => <View key={index} style={styles.bullet}><Text style={styles.mark}>•</Text><Text style={styles.bulletText}>{bullet}</Text></View>)}</View>)}</View> : null}
        {data.education.length ? <View><Text style={styles.heading}>Education</Text>{data.education.map((entry) => <View key={entry.id} style={styles.entry} wrap={false}><View style={styles.row}><Text style={styles.role}>{entry.qualification || "Qualification"}</Text><Text style={styles.dates}>{entry.inProgress ? "In progress" : entry.completionYear}</Text></View><Text style={styles.meta}>{[entry.institution, entry.location].filter(Boolean).join(" — ")}</Text></View>)}</View> : null}
        {credentials.length ? <View><Text style={styles.heading}>Professional Credentials</Text>{credentials.map((item) => <Text key={item} style={styles.credential}>• {item}</Text>)}</View> : null}
        {data.references.length ? <View><Text style={styles.heading}>References</Text>{data.references.map((entry) => <Text key={entry.id} style={styles.credential}>{entry.name}{entry.relationship ? ` — ${entry.relationship}` : ""}{entry.company ? `, ${entry.company}` : ""}</Text>)}</View> : null}
      </Page>
    </Document>
  );
}
