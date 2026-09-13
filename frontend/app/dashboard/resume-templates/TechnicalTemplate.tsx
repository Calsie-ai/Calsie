import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { formatDateRange } from "../../../lib/resumeBuilderContent";
import type { ResumePdfData } from "./types";

const blue = "#155E75";
const styles = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 9.5, lineHeight: 1.4, color: "#152126", padding: "39pt 44pt" },
  header: { padding: "13pt 15pt", backgroundColor: "#EAF3F5" },
  name: { fontFamily: "Helvetica-Bold", fontSize: 22 },
  headline: { marginTop: 3, fontFamily: "Helvetica-Bold", fontSize: 10.5, color: blue },
  contact: { marginTop: 7, fontSize: 8.8, color: "#3E5057" },
  portfolio: { marginTop: 3, fontFamily: "Helvetica-Bold", fontSize: 8.8, color: blue },
  heading: { marginTop: 12, marginBottom: 5, fontFamily: "Helvetica-Bold", fontSize: 10, color: blue, textTransform: "uppercase", letterSpacing: .75 },
  summary: { fontSize: 9.8, lineHeight: 1.45 },
  skills: { flexDirection: "row", flexWrap: "wrap", paddingTop: 6, borderTop: `1pt solid ${blue}` },
  skill: { marginRight: 9, marginBottom: 4, padding: "3pt 5pt", backgroundColor: "#EAF3F5", fontFamily: "Helvetica-Bold", fontSize: 8.6 },
  entry: { marginBottom: 8 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  title: { maxWidth: "74%", fontFamily: "Helvetica-Bold", fontSize: 10.1 },
  dates: { fontSize: 8.7, color: "#53636A" },
  meta: { marginBottom: 3, fontSize: 9, color: blue },
  bullet: { flexDirection: "row", marginBottom: 1.5 },
  mark: { width: 10, color: blue },
  bulletText: { flex: 1, fontSize: 9.2, lineHeight: 1.38 },
});

export default function TechnicalTemplate({ data }: { data: ResumePdfData }) {
  const contact = [data.phone, data.email, data.location, data.linkedin].map((part) => part.trim()).filter(Boolean).join("   •   ");
  const hasCredentials = data.certifications.length > 0 || data.licences.length > 0;
  return (
    <Document title={`${data.fullName || "Resume"} — Technical Resume`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}><Text style={styles.name}>{data.fullName || "Your Name"}</Text>{data.headline ? <Text style={styles.headline}>{data.headline}</Text> : null}{contact ? <Text style={styles.contact}>{contact}</Text> : null}{data.websiteOrPortfolio ? <Text style={styles.portfolio}>Portfolio: {data.websiteOrPortfolio}</Text> : null}</View>
        {data.summary ? <View><Text style={styles.heading}>Technical Profile</Text><Text style={styles.summary}>{data.summary}</Text></View> : null}
        {data.skills.length ? <View><Text style={styles.heading}>Technical Skills</Text><View style={styles.skills}>{data.skills.map((skill) => <Text key={skill} style={styles.skill}>{skill}</Text>)}</View></View> : null}
        {data.workExperience.length ? <View><Text style={styles.heading}>Technical Experience</Text>{data.workExperience.map((entry) => <View key={entry.id} style={styles.entry} wrap={false}><View style={styles.row}><Text style={styles.title}>{entry.jobTitle || "Role"}{entry.employer ? ` — ${entry.employer}` : ""}</Text><Text style={styles.dates}>{formatDateRange(entry.startMonth, entry.startYear, entry.endMonth, entry.endYear, entry.current)}</Text></View>{entry.location ? <Text style={styles.meta}>{entry.location}</Text> : null}{entry.bullets.filter(Boolean).map((bullet, index) => <View key={index} style={styles.bullet}><Text style={styles.mark}>•</Text><Text style={styles.bulletText}>{bullet}</Text></View>)}</View>)}</View> : null}
        {hasCredentials ? <View><Text style={styles.heading}>Technical Certifications</Text>{data.certifications.map((entry) => <Text key={entry.id} style={styles.meta}>• {entry.name}{entry.issuer ? ` — ${entry.issuer}` : ""}{entry.year ? ` (${entry.year})` : ""}</Text>)}{data.licences.map((entry) => <Text key={entry.id} style={styles.meta}>• {entry.name}{entry.expiry ? ` — expires ${entry.expiry}` : ""}</Text>)}</View> : null}
        {data.education.length ? <View><Text style={styles.heading}>Education</Text>{data.education.map((entry) => <View key={entry.id} style={styles.entry} wrap={false}><View style={styles.row}><Text style={styles.title}>{entry.qualification || "Qualification"}</Text><Text style={styles.dates}>{entry.inProgress ? "In progress" : entry.completionYear}</Text></View><Text style={styles.meta}>{[entry.institution, entry.location].filter(Boolean).join(" — ")}{entry.grade ? ` · ${entry.grade}` : ""}</Text></View>)}</View> : null}
        {data.references.length ? <View><Text style={styles.heading}>References</Text>{data.references.map((entry) => <Text key={entry.id} style={styles.meta}>{entry.name}{entry.relationship ? ` — ${entry.relationship}` : ""}{entry.company ? `, ${entry.company}` : ""}</Text>)}</View> : null}
      </Page>
    </Document>
  );
}
