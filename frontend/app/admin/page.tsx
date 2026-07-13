"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "../../lib/supabaseClient";

type TemplateRow = {
  id: string;
  slug: string;
  title: string;
  role: string;
  location: string;
  description: string;
  category: string;
  query_terms: string[];
  include_title_terms: string[];
  exclude_title_terms: string[];
  description_keywords: string[];
  job_types: string[];
  posted_within_days: number;
  daily_job_limit: number;
  daily_email_limit: number;
  hourly_email_limit: number;
  campaign_days: number;
  total_cap: number;
  is_active: boolean;
  updated_at: string;
};

type TemplateForm = Omit<TemplateRow, "id" | "updated_at">;

const EMPTY_FORM: TemplateForm = {
  slug: "",
  title: "",
  role: "",
  location: "Sydney NSW",
  description: "",
  category: "General",
  query_terms: [],
  include_title_terms: [],
  exclude_title_terms: [],
  description_keywords: [],
  job_types: ["Casual", "Part-time", "Full-time"],
  posted_within_days: 30,
  daily_job_limit: 24,
  daily_email_limit: 24,
  hourly_email_limit: 1,
  campaign_days: 30,
  total_cap: 720,
  is_active: true,
};

function splitList(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function joinList(value: string[]) {
  return (value || []).join("\n");
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function AdminPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [form, setForm] = useState<TemplateForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    void loadAdmin();
  }, []);

  async function loadAdmin() {
    setLoading(true);
    setMessage("");

    try {
      const supabase = getSupabaseClient();
      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user;

      if (!user) {
        router.replace("/login?next=/admin");
        return;
      }

      const { data: admin, error: adminError } = await supabase
        .from("applix_admin_users")
        .select("user_id,role")
        .eq("user_id", user.id)
        .maybeSingle();

      if (adminError) throw adminError;
      if (!admin) {
        router.replace("/dashboard");
        return;
      }

      const { data, error } = await supabase
        .from("campaign_templates")
        .select("*")
        .order("updated_at", { ascending: false });

      if (error) throw error;
      setTemplates((data || []) as TemplateRow[]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load the admin panel.");
    } finally {
      setLoading(false);
    }
  }

  function editTemplate(item: TemplateRow) {
    const { id, updated_at, ...nextForm } = item;
    setEditingId(id);
    setForm(nextForm);
    setMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setMessage("");
  }

  async function saveTemplate() {
    if (!form.title.trim() || !form.role.trim()) {
      setMessage("Template name and target role are required.");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const supabase = getSupabaseClient();
      const slug = form.slug.trim() || slugify(form.title);
      const payload = {
        ...form,
        slug,
        title: form.title.trim(),
        role: form.role.trim(),
        location: form.location.trim(),
        description: form.description.trim(),
        category: form.category.trim() || "General",
      };

      if (editingId) {
        const { error } = await supabase
          .from("campaign_templates")
          .update(payload)
          .eq("id", editingId);
        if (error) throw error;
        setMessage("Template updated successfully.");
      } else {
        const { error } = await supabase.from("campaign_templates").insert(payload);
        if (error) throw error;
        setMessage("Template created successfully.");
      }

      setEditingId(null);
      setForm(EMPTY_FORM);
      await loadAdmin();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save the template.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleTemplate(item: TemplateRow) {
    setMessage("");
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from("campaign_templates")
      .update({ is_active: !item.is_active })
      .eq("id", item.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    await loadAdmin();
  }

  const filteredTemplates = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return templates;
    return templates.filter((item) =>
      `${item.title} ${item.role} ${item.category} ${item.location}`.toLowerCase().includes(needle),
    );
  }, [query, templates]);

  if (loading) {
    return <main style={styles.shell}><p>Loading Applix admin...</p></main>;
  }

  return (
    <main style={styles.shell}>
      <header style={styles.topbar}>
        <div>
          <p style={styles.eyebrow}>Applix administration</p>
          <h1 style={styles.heading}>Campaign template control room</h1>
          <p style={styles.subheading}>Create the job-search recipe users will select when starting a campaign.</p>
        </div>
        <Link href="/dashboard" style={styles.backLink}>Back to workspace</Link>
      </header>

      {message && <div style={styles.message}>{message}</div>}

      <section style={styles.layout}>
        <div style={styles.formCard}>
          <div style={styles.sectionHeading}>
            <div>
              <p style={styles.eyebrow}>{editingId ? "Editing template" : "New template"}</p>
              <h2 style={styles.cardTitle}>{editingId ? form.title : "Create a campaign template"}</h2>
            </div>
            {editingId && <button style={styles.secondaryButton} onClick={resetForm}>Cancel edit</button>}
          </div>

          <div style={styles.grid}>
            <Field label="Template name" value={form.title} onChange={(value) => setForm({ ...form, title: value, slug: form.slug || slugify(value) })} />
            <Field label="Slug" value={form.slug} onChange={(value) => setForm({ ...form, slug: slugify(value) })} />
            <Field label="Target role" value={form.role} onChange={(value) => setForm({ ...form, role: value })} />
            <Field label="Location" value={form.location} onChange={(value) => setForm({ ...form, location: value })} />
            <Field label="Category" value={form.category} onChange={(value) => setForm({ ...form, category: value })} />
            <NumberField label="Jobs posted within days" value={form.posted_within_days} onChange={(value) => setForm({ ...form, posted_within_days: value })} />
          </div>

          <label style={styles.field}>
            Description
            <textarea style={styles.textarea} rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
          </label>

          <div style={styles.listGrid}>
            <ListField label="Search phrases" hint="One search phrase per line" value={form.query_terms} onChange={(value) => setForm({ ...form, query_terms: value })} />
            <ListField label="Accept job titles" hint="A title must match one of these" value={form.include_title_terms} onChange={(value) => setForm({ ...form, include_title_terms: value })} />
            <ListField label="Reject job titles" hint="These titles are blocked first" value={form.exclude_title_terms} onChange={(value) => setForm({ ...form, exclude_title_terms: value })} />
            <ListField label="Description keywords" hint="Used for scoring after title matching" value={form.description_keywords} onChange={(value) => setForm({ ...form, description_keywords: value })} />
            <ListField label="Job types" hint="Casual, Part-time, Full-time" value={form.job_types} onChange={(value) => setForm({ ...form, job_types: value })} />
          </div>

          <div style={styles.grid}>
            <NumberField label="Jobs per day" value={form.daily_job_limit} onChange={(value) => setForm({ ...form, daily_job_limit: value })} />
            <NumberField label="Emails per day" value={form.daily_email_limit} onChange={(value) => setForm({ ...form, daily_email_limit: value })} />
            <NumberField label="Emails per hour" value={form.hourly_email_limit} onChange={(value) => setForm({ ...form, hourly_email_limit: value })} />
            <NumberField label="Campaign days" value={form.campaign_days} onChange={(value) => setForm({ ...form, campaign_days: value })} />
            <NumberField label="Maximum applications" value={form.total_cap} onChange={(value) => setForm({ ...form, total_cap: value })} />
          </div>

          <label style={styles.checkboxRow}>
            <input type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} />
            Active and visible to users
          </label>

          <button style={styles.primaryButton} onClick={() => void saveTemplate()} disabled={saving}>
            {saving ? "Saving..." : editingId ? "Save template changes" : "Create template"}
          </button>
        </div>

        <aside style={styles.listCard}>
          <div style={styles.sectionHeading}>
            <div>
              <p style={styles.eyebrow}>Template library</p>
              <h2 style={styles.cardTitle}>{templates.length} templates</h2>
            </div>
          </div>

          <input style={styles.searchInput} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search templates" />

          <div style={styles.templateList}>
            {filteredTemplates.map((item) => (
              <article key={item.id} style={styles.templateCard}>
                <div style={styles.templateHeader}>
                  <div>
                    <small style={styles.category}>{item.category}</small>
                    <h3 style={styles.templateTitle}>{item.title}</h3>
                  </div>
                  <span style={item.is_active ? styles.activeBadge : styles.pausedBadge}>{item.is_active ? "Active" : "Paused"}</span>
                </div>
                <p style={styles.templateText}>{item.role} · {item.location}</p>
                <p style={styles.templateText}>{item.query_terms.length} searches · {item.include_title_terms.length} accepted title rules · {item.exclude_title_terms.length} blocked title rules</p>
                <div style={styles.actions}>
                  <button style={styles.secondaryButton} onClick={() => editTemplate(item)}>Edit</button>
                  <button style={styles.secondaryButton} onClick={() => void toggleTemplate(item)}>{item.is_active ? "Pause" : "Activate"}</button>
                </div>
              </article>
            ))}
            {filteredTemplates.length === 0 && <p style={styles.empty}>No templates match this search.</p>}
          </div>
        </aside>
      </section>
    </main>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label style={styles.field}>{label}<input style={styles.input} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label style={styles.field}>{label}<input style={styles.input} type="number" min={1} value={value} onChange={(event) => onChange(Math.max(1, Number(event.target.value) || 1))} /></label>;
}

function ListField({ label, hint, value, onChange }: { label: string; hint: string; value: string[]; onChange: (value: string[]) => void }) {
  return <label style={styles.field}>{label}<small style={styles.hint}>{hint}</small><textarea style={styles.textarea} rows={5} value={joinList(value)} onChange={(event) => onChange(splitList(event.target.value))} /></label>;
}

const styles = {
  shell: { minHeight: "100vh", background: "#f4f7fb", color: "#111827", padding: 28, fontFamily: "Arial, Helvetica, sans-serif" },
  topbar: { maxWidth: 1500, margin: "0 auto 24px", display: "flex", justifyContent: "space-between", gap: 24, alignItems: "flex-start" },
  eyebrow: { margin: 0, color: "#6366f1", textTransform: "uppercase" as const, letterSpacing: 1.5, fontSize: 12, fontWeight: 900 },
  heading: { margin: "8px 0", fontSize: 40, letterSpacing: -1.2 },
  subheading: { margin: 0, color: "#64748b", lineHeight: 1.6 },
  backLink: { background: "#111827", color: "white", textDecoration: "none", borderRadius: 999, padding: "12px 18px", fontWeight: 800 },
  message: { maxWidth: 1500, margin: "0 auto 18px", background: "#eef2ff", color: "#3730a3", borderRadius: 16, padding: 14, fontWeight: 800 },
  layout: { maxWidth: 1500, margin: "0 auto", display: "grid", gridTemplateColumns: "minmax(0, 1.35fr) minmax(340px, 0.65fr)", gap: 22, alignItems: "start" },
  formCard: { background: "white", borderRadius: 24, padding: 24, boxShadow: "0 18px 55px rgba(15,23,42,0.08)", display: "grid", gap: 20 },
  listCard: { background: "#111827", color: "white", borderRadius: 24, padding: 22, boxShadow: "0 18px 55px rgba(15,23,42,0.16)", position: "sticky" as const, top: 20 },
  sectionHeading: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 },
  cardTitle: { margin: "6px 0 0", fontSize: 26 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 14 },
  listGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 },
  field: { display: "grid", gap: 7, fontSize: 13, fontWeight: 900, color: "#334155" },
  hint: { color: "#94a3b8", fontWeight: 600 },
  input: { width: "100%", boxSizing: "border-box" as const, border: "1px solid #dbe2ea", borderRadius: 14, padding: "12px 13px", fontSize: 15, background: "white" },
  textarea: { width: "100%", boxSizing: "border-box" as const, border: "1px solid #dbe2ea", borderRadius: 14, padding: "12px 13px", fontSize: 14, lineHeight: 1.5, resize: "vertical" as const },
  checkboxRow: { display: "flex", gap: 10, alignItems: "center", fontWeight: 800, color: "#334155" },
  primaryButton: { border: 0, borderRadius: 999, background: "#4f46e5", color: "white", padding: "15px 20px", fontWeight: 900, fontSize: 15, cursor: "pointer" },
  secondaryButton: { border: "1px solid #cbd5e1", borderRadius: 999, background: "white", color: "#111827", padding: "9px 14px", fontWeight: 800, cursor: "pointer" },
  searchInput: { width: "100%", boxSizing: "border-box" as const, margin: "18px 0", border: "1px solid #334155", borderRadius: 14, padding: "12px 13px", fontSize: 15, background: "#1f2937", color: "white" },
  templateList: { display: "grid", gap: 12, maxHeight: "70vh", overflowY: "auto" as const, paddingRight: 4 },
  templateCard: { background: "#1f2937", border: "1px solid #334155", borderRadius: 18, padding: 16 },
  templateHeader: { display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start" },
  category: { color: "#a5b4fc", fontWeight: 900 },
  templateTitle: { margin: "5px 0", fontSize: 19 },
  templateText: { color: "#cbd5e1", fontSize: 13, lineHeight: 1.5 },
  activeBadge: { background: "#dcfce7", color: "#166534", borderRadius: 999, padding: "6px 9px", fontWeight: 900, fontSize: 11 },
  pausedBadge: { background: "#fee2e2", color: "#991b1b", borderRadius: 999, padding: "6px 9px", fontWeight: 900, fontSize: 11 },
  actions: { display: "flex", gap: 8, marginTop: 12 },
  empty: { color: "#cbd5e1" },
} as const;
