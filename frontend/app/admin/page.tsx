"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "../../lib/supabaseClient";
import styles from "./admin.module.css";

type TemplateRow = {
  id: string;
  slug: string;
  title: string;
  campaign_name: string;
  role: string;
  location: string;
  description: string;
  category: string;
  image_url: string | null;
  image_path: string | null;
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
  campaign_name: "",
  role: "",
  location: "Sydney NSW",
  description: "",
  category: "General",
  image_url: null,
  image_path: null,
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

const splitList = (value: string) => value.split("\n").map((item) => item.trim()).filter(Boolean);
const joinList = (value: string[]) => (value || []).join("\n");
const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function AdminPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [form, setForm] = useState<TemplateForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [userId, setUserId] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => { void loadAdmin(); }, []);

  async function loadAdmin() {
    setLoading(true);
    try {
      const supabase = getSupabaseClient();
      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user;
      if (!user) { router.replace("/login?next=/admin"); return; }

      const { data: admin, error: adminError } = await supabase
        .from("applix_admin_users")
        .select("user_id,role")
        .eq("user_id", user.id)
        .maybeSingle();
      if (adminError) throw adminError;
      if (!admin) { router.replace("/dashboard"); return; }
      setUserId(user.id);

      const { data, error } = await supabase.from("campaign_templates").select("*").order("updated_at", { ascending: false });
      if (error) throw error;
      setTemplates((data || []) as TemplateRow[]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load admin templates.");
    } finally {
      setLoading(false);
    }
  }

  function editTemplate(item: TemplateRow) {
    const { id, updated_at, ...nextForm } = item;
    setEditingId(id);
    setForm(nextForm);
    setImageFile(null);
    setMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setImageFile(null);
    setMessage("");
  }

  async function uploadImage(slug: string) {
    if (!imageFile) return { image_url: form.image_url, image_path: form.image_path };
    const supabase = getSupabaseClient();
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Please sign in again.");

    const body = new FormData();
    body.append("file", imageFile);
    body.append("slug", slug);
    body.append("previous_path", form.image_path || "");
    const response = await fetch("/api/admin/template-image", { method: "POST", headers: { authorization: `Bearer ${token}` }, body });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Image upload failed.");
    return { image_url: result.image_url as string, image_path: result.image_path as string };
  }

  async function saveTemplate() {
    if (!form.title.trim() || !form.role.trim()) { setMessage("Template name and target role are required."); return; }
    setSaving(true); setMessage("");
    try {
      const supabase = getSupabaseClient();
      const slug = form.slug.trim() || slugify(form.title);
      const media = await uploadImage(slug);
      const payload = {
        ...form,
        ...media,
        slug,
        title: form.title.trim(),
        campaign_name: form.campaign_name.trim() || `${form.title.trim()} Campaign`,
        role: form.role.trim(),
        location: form.location.trim() || "Sydney NSW",
        description: form.description.trim(),
        category: form.category.trim() || "General",
        updated_by: userId,
      };

      if (editingId) {
        const { error } = await supabase.from("campaign_templates").update(payload).eq("id", editingId);
        if (error) throw error;
        setMessage("Template updated.");
      } else {
        const { error } = await supabase.from("campaign_templates").insert({ ...payload, created_by: userId });
        if (error) throw error;
        setMessage("Template created.");
      }
      resetForm();
      await loadAdmin();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save template.");
    } finally { setSaving(false); }
  }

  async function toggleTemplate(item: TemplateRow) {
    const supabase = getSupabaseClient();
    const { error } = await supabase.from("campaign_templates").update({ is_active: !item.is_active, updated_by: userId }).eq("id", item.id);
    if (error) setMessage(error.message); else await loadAdmin();
  }

  async function deleteTemplate(item: TemplateRow) {
    if (!window.confirm(`Delete ${item.title}?`)) return;
    setMessage("");
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.from("campaign_templates").delete().eq("id", item.id);
      if (error) throw error;
      if (item.image_path) {
        const { data } = await supabase.auth.getSession();
        await fetch("/api/admin/template-image", {
          method: "DELETE",
          headers: { "content-type": "application/json", authorization: `Bearer ${data.session?.access_token || ""}` },
          body: JSON.stringify({ image_path: item.image_path }),
        });
      }
      setMessage("Template deleted.");
      await loadAdmin();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not delete template."); }
  }

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return templates.filter((item) => !needle || `${item.title} ${item.campaign_name} ${item.role} ${item.category}`.toLowerCase().includes(needle));
  }, [query, templates]);

  if (loading) return <main className={styles.shell}>Loading template manager...</main>;

  return <main className={styles.shell}>
    <header className={styles.topbar}>
      <div><p className={styles.eyebrow}>Calsie administration</p><h1>Template manager</h1><p>Add campaign templates, photos, categories, descriptions, and search rules.</p></div>
      <Link className={styles.back} href="/dashboard">Back to dashboard</Link>
    </header>
    {message && <div className={styles.message}>{message}</div>}

    <section className={styles.layout}>
      <div className={styles.panel}>
        <div className={styles.panelHead}><div><p className={styles.eyebrow}>{editingId ? "Editing" : "New template"}</p><h2>{editingId ? form.title : "Create template"}</h2></div>{editingId && <button className={styles.secondary} onClick={resetForm}>Cancel edit</button>}</div>
        <div className={styles.grid}>
          <Field label="Template title" value={form.title} onChange={(value) => setForm({ ...form, title: value, slug: form.slug || slugify(value), campaign_name: form.campaign_name || `${value} Campaign` })} />
          <Field label="Campaign name" value={form.campaign_name} onChange={(value) => setForm({ ...form, campaign_name: value })} />
          <Field label="Category" value={form.category} onChange={(value) => setForm({ ...form, category: value })} />
          <Field label="Target role" value={form.role} onChange={(value) => setForm({ ...form, role: value })} />
          <Field label="Location" value={form.location} onChange={(value) => setForm({ ...form, location: value })} />
          <Field label="Slug" value={form.slug} onChange={(value) => setForm({ ...form, slug: slugify(value) })} />
          <label className={`${styles.field} ${styles.wide}`}>Description<textarea rows={4} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
        </div>

        <div className={styles.mediaRow}>
          <div className={styles.preview}>{imageFile ? <img src={URL.createObjectURL(imageFile)} alt="New template preview" /> : form.image_url ? <img src={form.image_url} alt="Template preview" /> : "Template photo preview"}</div>
          <div className={styles.uploadBox}><strong>Template photo</strong><span>JPG, PNG, or WebP · maximum 5 MB</span><label className={styles.uploadButton}>Choose photo<input hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setImageFile(event.target.files?.[0] || null)} /></label>{(form.image_url || imageFile) && <button className={styles.secondary} onClick={() => { setImageFile(null); setForm({ ...form, image_url: null, image_path: null }); }}>Remove photo</button>}</div>
        </div>

        <details className={styles.details}><summary>Advanced search and campaign settings</summary>
          <div className={styles.listGrid}>
            <ListField label="Search phrases" value={form.query_terms} onChange={(value) => setForm({ ...form, query_terms: value })} />
            <ListField label="Accepted job titles" value={form.include_title_terms} onChange={(value) => setForm({ ...form, include_title_terms: value })} />
            <ListField label="Blocked job titles" value={form.exclude_title_terms} onChange={(value) => setForm({ ...form, exclude_title_terms: value })} />
            <ListField label="Description keywords" value={form.description_keywords} onChange={(value) => setForm({ ...form, description_keywords: value })} />
            <ListField label="Job types" value={form.job_types} onChange={(value) => setForm({ ...form, job_types: value })} />
          </div>
          <div className={styles.grid}>
            <NumberField label="Posted within days" value={form.posted_within_days} onChange={(value) => setForm({ ...form, posted_within_days: value })} />
            <NumberField label="Jobs per day" value={form.daily_job_limit} onChange={(value) => setForm({ ...form, daily_job_limit: value })} />
            <NumberField label="Emails per day" value={form.daily_email_limit} onChange={(value) => setForm({ ...form, daily_email_limit: value })} />
            <NumberField label="Emails per hour" value={form.hourly_email_limit} onChange={(value) => setForm({ ...form, hourly_email_limit: value })} />
            <NumberField label="Campaign days" value={form.campaign_days} onChange={(value) => setForm({ ...form, campaign_days: value })} />
            <NumberField label="Total cap" value={form.total_cap} onChange={(value) => setForm({ ...form, total_cap: value })} />
          </div>
        </details>

        <label className={styles.checkbox}><input type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} />Active and visible to users</label>
        <div className={styles.actions}><button className={styles.primary} disabled={saving} onClick={() => void saveTemplate()}>{saving ? "Saving..." : editingId ? "Save changes" : "Create template"}</button><button className={styles.secondary} onClick={resetForm}>Clear form</button></div>
      </div>

      <aside className={styles.panel}>
        <div className={styles.panelHead}><div><p className={styles.eyebrow}>Library</p><h2>{templates.length} templates</h2></div></div>
        <div className={styles.exportRow}><button className={styles.secondary} onClick={() => downloadJson("calsie-campaign-templates.json", templates)}>Download all JSON</button></div>
        <input className={styles.search} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search templates" />
        <div className={styles.list}>{filtered.map((item) => <article className={styles.card} key={item.id}>
          <div className={styles.cardTop}><div><span className={styles.category}>{item.category}</span><h3>{item.title}</h3></div><span className={styles.badge}>{item.is_active ? "Active" : "Paused"}</span></div>
          {item.image_url && <img className={styles.thumb} src={item.image_url} alt="" />}
          <p className={styles.meta}><b>{item.campaign_name || item.title}</b><br />{item.role} · {item.location}</p>
          <p className={styles.meta}>{item.description}</p>
          <div className={styles.cardActions}><button className={styles.secondary} onClick={() => editTemplate(item)}>Edit</button><button className={styles.secondary} onClick={() => void toggleTemplate(item)}>{item.is_active ? "Pause" : "Activate"}</button><button className={styles.secondary} onClick={() => downloadJson(`${item.slug}.json`, item)}>Download</button><button className={styles.danger} onClick={() => void deleteTemplate(item)}>Delete</button></div>
        </article>)}{filtered.length === 0 && <p>No templates match your search.</p>}</div>
      </aside>
    </section>
  </main>;
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className={styles.field}>{label}<input value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}
function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label className={styles.field}>{label}<input type="number" min={1} value={value} onChange={(event) => onChange(Math.max(1, Number(event.target.value) || 1))} /></label>;
}
function ListField({ label, value, onChange }: { label: string; value: string[]; onChange: (value: string[]) => void }) {
  return <label className={styles.field}>{label}<textarea rows={5} value={joinList(value)} onChange={(event) => onChange(splitList(event.target.value))} /></label>;
}