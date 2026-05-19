"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

type WorkExperience = {
  job_title: string;
  company: string;
  start_date: string;
  end_date: string;
  description: string;
};

type Education = {
  institution: string;
  qualification: string;
  year: string;
};

type Certification = {
  name: string;
  provider: string;
  expiry_date: string;
};

type Reference = {
  type: string;
  name: string;
  position: string;
  company: string;
  contact: string;
};

const emptyWorkExperience: WorkExperience = {
  job_title: "",
  company: "",
  start_date: "",
  end_date: "",
  description: "",
};

const emptyEducation: Education = {
  institution: "",
  qualification: "",
  year: "",
};

const emptyCertification: Certification = {
  name: "",
  provider: "",
  expiry_date: "",
};

const emptyReference: Reference = {
  type: "Available upon request",
  name: "",
  position: "",
  company: "",
  contact: "",
};

export default function ProfilePage() {
  const router = useRouter();

  const [userId, setUserId] = useState("");
  const [resumeProfileId, setResumeProfileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const [fullName, setFullName] = useState("");
  const [targetRole, setTargetRole] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [location, setLocation] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [website, setWebsite] = useState("");
  const [profileSummary, setProfileSummary] = useState("");
  const [skillsText, setSkillsText] = useState("");
  const [workExperience, setWorkExperience] = useState<WorkExperience[]>([{ ...emptyWorkExperience }]);
  const [education, setEducation] = useState<Education[]>([{ ...emptyEducation }]);
  const [certifications, setCertifications] = useState<Certification[]>([{ ...emptyCertification }]);
  const [workRights, setWorkRights] = useState("");
  const [references, setReferences] = useState<Reference[]>([{ ...emptyReference }]);

  useEffect(() => {
    async function loadProfile() {
      const { data } = await supabase.auth.getUser();

      if (!data.user) {
        router.push("/login");
        return;
      }

      setUserId(data.user.id);
      setEmail(data.user.email || "");

      const { data: profileRow } = await supabase
        .from("profiles")
        .select("full_name, email, phone, location")
        .eq("id", data.user.id)
        .maybeSingle();

      if (profileRow) {
        setFullName(profileRow.full_name || "");
        setEmail(profileRow.email || data.user.email || "");
        setPhone(profileRow.phone || "");
        setLocation(profileRow.location || "");
      }

      const { data: resumeRow } = await supabase
        .from("resume_profiles")
        .select("*")
        .eq("profile_id", data.user.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (resumeRow) {
        setResumeProfileId(resumeRow.id);
        setFullName(resumeRow.full_name || profileRow?.full_name || "");
        setTargetRole(resumeRow.target_role || "");
        setPhone(resumeRow.phone || profileRow?.phone || "");
        setEmail(resumeRow.email || profileRow?.email || data.user.email || "");
        setLocation(resumeRow.location || profileRow?.location || "");
        setLinkedin(resumeRow.linkedin || "");
        setWebsite(resumeRow.website_or_portfolio || "");
        setProfileSummary(resumeRow.profile_summary || "");
        setSkillsText(Array.isArray(resumeRow.skills) ? resumeRow.skills.join("\n") : "");
        setWorkExperience(Array.isArray(resumeRow.work_experience) && resumeRow.work_experience.length ? resumeRow.work_experience : [{ ...emptyWorkExperience }]);
        setEducation(Array.isArray(resumeRow.education_locked) && resumeRow.education_locked.length ? resumeRow.education_locked : [{ ...emptyEducation }]);
        setCertifications(Array.isArray(resumeRow.certifications_locked) && resumeRow.certifications_locked.length ? resumeRow.certifications_locked : [{ ...emptyCertification }]);
        setWorkRights(resumeRow.work_rights_locked?.status || "");
        setReferences(Array.isArray(resumeRow.references_locked) && resumeRow.references_locked.length ? resumeRow.references_locked : [{ ...emptyReference }]);
      }

      setLoading(false);
    }

    loadProfile();
  }, [router]);

  function updateWorkExperience(index: number, key: keyof WorkExperience, value: string) {
    setWorkExperience((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item));
  }

  function updateEducation(index: number, key: keyof Education, value: string) {
    setEducation((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item));
  }

  function updateCertification(index: number, key: keyof Certification, value: string) {
    setCertifications((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item));
  }

  function updateReference(index: number, key: keyof Reference, value: string) {
    setReferences((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item));
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  async function saveResumeProfile() {
    setSaving(true);
    setMessage("");

    const skills = skillsText
      .split("\n")
      .map((skill) => skill.trim())
      .filter(Boolean);

    const payload = {
      profile_id: userId,
      full_name: fullName,
      target_role: targetRole,
      phone,
      email,
      location,
      linkedin,
      website_or_portfolio: website,
      profile_summary: profileSummary,
      skills,
      work_experience: workExperience,
      education_locked: education,
      certifications_locked: certifications,
      licences_locked: [],
      work_rights_locked: { status: workRights },
      references_locked: references,
      updated_at: new Date().toISOString(),
    };

    try {
      const { error: profileError } = await supabase.from("profiles").upsert({
        id: userId,
        full_name: fullName,
        email,
        phone,
        location,
      });

      if (profileError) throw profileError;

      if (resumeProfileId) {
        const { error } = await supabase
          .from("resume_profiles")
          .update(payload)
          .eq("id", resumeProfileId);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("resume_profiles")
          .insert(payload)
          .select("id")
          .single();

        if (error) throw error;
        setResumeProfileId(data.id);
      }

      setMessage("Resume profile saved. You can now match jobs and generate application kits.");
    } catch (error: any) {
      setMessage(error.message || "Could not save resume profile.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <main style={styles.main}>Loading your Applix profile...</main>;
  }

  return (
    <main style={styles.main}>
      <section style={styles.card}>
        <div style={styles.topBar}>
          <Link href="/" style={styles.backLink}>← Home</Link>
          <button onClick={handleLogout} style={styles.logoutButton}>Logout</button>
        </div>

        <p style={styles.badge}>Base Resume Profile</p>
        <h1 style={styles.title}>Fill your resume details once.</h1>
        <p style={styles.subtitle}>
          Applix saves this as your source of truth. AI can rewrite the profile, skills, and experience wording later, but locked verified details stay unchanged.
        </p>

        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Personal details</h2>
          <div style={styles.formGrid}>
            <Field label="Full name" value={fullName} onChange={setFullName} placeholder="Your full name" />
            <Field label="Target role" value={targetRole} onChange={setTargetRole} placeholder="Support Worker, Admin Assistant..." />
            <Field label="Phone" value={phone} onChange={setPhone} placeholder="0430..." />
            <Field label="Email" value={email} onChange={setEmail} placeholder="you@example.com" />
            <Field label="Location" value={location} onChange={setLocation} placeholder="Sydney NSW" />
            <Field label="LinkedIn" value={linkedin} onChange={setLinkedin} placeholder="https://linkedin.com/in/..." />
            <Field label="Portfolio / website" value={website} onChange={setWebsite} placeholder="https://..." />
          </div>
        </section>

        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>AI-editable resume sections</h2>
          <label style={styles.fieldWide}>
            Profile summary
            <textarea style={styles.textarea} value={profileSummary} onChange={(event) => setProfileSummary(event.target.value)} placeholder="Write a short summary about your experience, strengths, and career goal." />
          </label>
          <label style={styles.fieldWide}>
            Skills - one per line
            <textarea style={styles.textarea} value={skillsText} onChange={(event) => setSkillsText(event.target.value)} placeholder={"NDIS support\nPersonal care\nCommunity access"} />
          </label>
        </section>

        <section style={styles.section}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>Work experience</h2>
            <button onClick={() => setWorkExperience([...workExperience, { ...emptyWorkExperience }])} style={styles.smallButton}>Add job</button>
          </div>

          {workExperience.map((item, index) => (
            <div key={index} style={styles.repeatCard}>
              <div style={styles.formGrid}>
                <Field label="Job title" value={item.job_title} onChange={(value) => updateWorkExperience(index, "job_title", value)} placeholder="Support Worker" />
                <Field label="Company" value={item.company} onChange={(value) => updateWorkExperience(index, "company", value)} placeholder="Company name" />
                <Field label="Start date" value={item.start_date} onChange={(value) => updateWorkExperience(index, "start_date", value)} placeholder="2023" />
                <Field label="End date" value={item.end_date} onChange={(value) => updateWorkExperience(index, "end_date", value)} placeholder="Present" />
              </div>
              <label style={styles.fieldWide}>
                Description
                <textarea style={styles.textarea} value={item.description} onChange={(event) => updateWorkExperience(index, "description", event.target.value)} placeholder="Describe your duties, achievements, and responsibilities." />
              </label>
            </div>
          ))}
        </section>

        <section style={styles.lockedSection}>
          <h2 style={styles.sectionTitle}>Locked verified details</h2>
          <p style={styles.lockedText}>These sections are saved as facts. Applix should not regenerate them with AI.</p>

          <div style={styles.sectionHeader}>
            <h3 style={styles.subTitle}>Education</h3>
            <button onClick={() => setEducation([...education, { ...emptyEducation }])} style={styles.smallButton}>Add education</button>
          </div>
          {education.map((item, index) => (
            <div key={index} style={styles.formGrid}>
              <Field label="Institution" value={item.institution} onChange={(value) => updateEducation(index, "institution", value)} placeholder="TAFE NSW" />
              <Field label="Qualification" value={item.qualification} onChange={(value) => updateEducation(index, "qualification", value)} placeholder="Certificate III in Individual Support" />
              <Field label="Year" value={item.year} onChange={(value) => updateEducation(index, "year", value)} placeholder="2023" />
            </div>
          ))}

          <div style={styles.sectionHeader}>
            <h3 style={styles.subTitle}>Certifications and licences</h3>
            <button onClick={() => setCertifications([...certifications, { ...emptyCertification }])} style={styles.smallButton}>Add certificate</button>
          </div>
          {certifications.map((item, index) => (
            <div key={index} style={styles.formGrid}>
              <Field label="Certificate / licence" value={item.name} onChange={(value) => updateCertification(index, "name", value)} placeholder="First Aid, CPR, Driver Licence" />
              <Field label="Provider" value={item.provider} onChange={(value) => updateCertification(index, "provider", value)} placeholder="Provider name" />
              <Field label="Expiry date" value={item.expiry_date} onChange={(value) => updateCertification(index, "expiry_date", value)} placeholder="2026" />
            </div>
          ))}

          <label style={styles.fieldWide}>
            Work rights
            <input style={styles.input} value={workRights} onChange={(event) => setWorkRights(event.target.value)} placeholder="Australian citizen, permanent resident, valid work visa..." />
          </label>

          <div style={styles.sectionHeader}>
            <h3 style={styles.subTitle}>References</h3>
            <button onClick={() => setReferences([...references, { ...emptyReference }])} style={styles.smallButton}>Add reference</button>
          </div>
          {references.map((item, index) => (
            <div key={index} style={styles.formGrid}>
              <Field label="Reference type" value={item.type} onChange={(value) => updateReference(index, "type", value)} placeholder="Available upon request" />
              <Field label="Name" value={item.name} onChange={(value) => updateReference(index, "name", value)} placeholder="Reference name" />
              <Field label="Position" value={item.position} onChange={(value) => updateReference(index, "position", value)} placeholder="Manager" />
              <Field label="Company" value={item.company} onChange={(value) => updateReference(index, "company", value)} placeholder="Company" />
              <Field label="Contact" value={item.contact} onChange={(value) => updateReference(index, "contact", value)} placeholder="Phone or email" />
            </div>
          ))}
        </section>

        <div style={styles.actions}>
          <button onClick={saveResumeProfile} disabled={saving} style={styles.primaryButton}>{saving ? "Saving..." : "Save resume profile"}</button>
          <Link href="/matching" style={styles.secondaryButton}>Go to job matches</Link>
        </div>

        {message && <p style={message.includes("saved") ? styles.successMessage : styles.errorMessage}>{message}</p>}
      </section>
    </main>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <label style={styles.field}>
      {label}
      <input style={styles.input} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  );
}

const styles = {
  main: {
    minHeight: "100vh",
    background: "#f8fafc",
    fontFamily: "Arial, Helvetica, sans-serif",
    padding: 24,
    color: "#111827",
  },
  card: {
    maxWidth: 980,
    margin: "0 auto",
    background: "white",
    borderRadius: 30,
    padding: 28,
    boxShadow: "0 20px 60px rgba(15,23,42,0.08)",
  },
  topBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  backLink: {
    color: "#111827",
    textDecoration: "none",
    fontWeight: 900,
  },
  logoutButton: {
    border: "1px solid #e5e7eb",
    background: "white",
    borderRadius: 999,
    padding: "10px 14px",
    fontWeight: 900,
    cursor: "pointer",
  },
  badge: {
    display: "inline-block",
    marginTop: 40,
    padding: "8px 12px",
    borderRadius: 999,
    background: "#eef2ff",
    color: "#4338ca",
    fontWeight: 900,
  },
  title: {
    maxWidth: 720,
    margin: "18px 0 12px",
    fontSize: "clamp(36px, 7vw, 64px)",
    lineHeight: 0.98,
    letterSpacing: -2,
  },
  subtitle: {
    maxWidth: 760,
    color: "#64748b",
    lineHeight: 1.7,
    fontSize: 18,
  },
  section: {
    marginTop: 30,
    paddingTop: 24,
    borderTop: "1px solid #e5e7eb",
  },
  lockedSection: {
    marginTop: 30,
    padding: 20,
    borderRadius: 24,
    background: "#f8fafc",
    border: "1px solid #e5e7eb",
  },
  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginTop: 20,
  },
  sectionTitle: {
    margin: "0 0 14px",
    fontSize: 24,
  },
  subTitle: {
    margin: "0 0 12px",
    fontSize: 18,
  },
  lockedText: {
    color: "#64748b",
    lineHeight: 1.6,
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
    gap: 14,
    marginTop: 14,
  },
  field: {
    display: "grid",
    gap: 8,
    color: "#334155",
    fontWeight: 900,
  },
  fieldWide: {
    display: "grid",
    gap: 8,
    color: "#334155",
    fontWeight: 900,
    marginTop: 14,
  },
  input: {
    border: "1px solid #e5e7eb",
    borderRadius: 16,
    padding: 14,
    fontSize: 16,
  },
  textarea: {
    border: "1px solid #e5e7eb",
    borderRadius: 16,
    padding: 14,
    fontSize: 16,
    minHeight: 120,
    resize: "vertical" as const,
  },
  repeatCard: {
    marginTop: 14,
    padding: 16,
    border: "1px solid #e5e7eb",
    borderRadius: 22,
    background: "white",
  },
  smallButton: {
    border: 0,
    borderRadius: 999,
    background: "#111827",
    color: "white",
    padding: "10px 14px",
    fontWeight: 900,
    cursor: "pointer",
  },
  actions: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 12,
    marginTop: 26,
  },
  primaryButton: {
    border: 0,
    borderRadius: 999,
    background: "#111827",
    color: "white",
    padding: "15px 20px",
    fontWeight: 900,
    fontSize: 16,
    cursor: "pointer",
  },
  secondaryButton: {
    borderRadius: 999,
    background: "white",
    color: "#111827",
    border: "1px solid #e5e7eb",
    padding: "15px 20px",
    fontWeight: 900,
    textDecoration: "none",
  },
  successMessage: {
    marginTop: 18,
    color: "#166534",
    background: "#dcfce7",
    padding: 14,
    borderRadius: 16,
    fontWeight: 800,
  },
  errorMessage: {
    marginTop: 18,
    color: "#991b1b",
    background: "#fee2e2",
    padding: 14,
    borderRadius: 16,
    fontWeight: 800,
  },
};
