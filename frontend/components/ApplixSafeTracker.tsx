"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "../lib/supabaseClient";

type Row = {
  id: string;
  campaign_id: string | null;
  company: string | null;
  title: string | null;
  location: string | null;
  source: string | null;
  apply_url: string | null;
  apply_method: string | null;
  status: string | null;
  state: string | null;
  user_decision: string | null;
  created_at: string | null;
  description: string | null;
};

type Props = { campaignId?: string };

const pageSize = 100;
const statusTabs = ["all", "new", "approved", "applied", "skipped"];

function clean(value: string | null | undefined, fallback = "Not saved") {
  return value && value.trim() ? value : fallback;
}

function statusOf(row: Row) {
  return clean(row.status, "new").toLowerCase();
}

function safeContactStatus(row: Row) {
  return row.apply_method === "email" ? "Contact found" : "Not shown";
}

export default function ApplixSafeTracker({ campaignId }: Props) {
  const supabase = getSupabaseClient();
  const [rows, setRows] = useState<Row[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("all");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    let request = supabase
      .from("jobs")
      .select("id,campaign_id,company,title,location,source,apply_url,apply_method,status,state,user_decision,created_at,description")
      .order("created_at", { ascending: false })
      .limit(1000);

    if (campaignId) request = request.eq("campaign_id", campaignId);
    const { data, error } = await request;
    if (!error) setRows((data || []) as Row[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [campaignId]);

  const filtered = useMemo(() => {
    const needle = query.toLowerCase().trim();
    return rows.filter((row) => {
      const haystack = [row.company, row.title, row.location, row.source, row.status].join(" ").toLowerCase();
      const matchSearch = !needle || haystack.includes(needle);
      const matchTab = tab === "all" || statusOf(row) === tab;
      return matchSearch && matchTab;
    });
  }, [rows, query, tab]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice(page * pageSize, page * pageSize + pageSize);
  const selected = rows.find((row) => row.id === selectedId) || visible[0] || null;

  async function decide(row: Row, decision: "approved" | "skipped") {
    const { error } = await supabase
      .from("jobs")
      .update({ status: decision, state: decision, user_decision: decision, reviewed_at: new Date().toISOString() })
      .eq("id", row.id);

    if (!error) {
      setRows((current) => current.map((item) => (item.id === row.id ? { ...item, status: decision, state: decision, user_decision: decision } : item)));
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
      <section className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-4 text-white">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-emerald-300">Private contact safe</p>
            <h2 className="text-3xl font-black">Applix Tracker Workbook</h2>
            <p className="mt-1 text-sm text-white/55">Excel-style tracker. Employer contact details are hidden from users.</p>
          </div>
          <button type="button" onClick={load} className="rounded-full bg-white/10 px-4 py-2 text-sm font-bold">Reload</button>
        </div>

        <div className="mt-4 flex flex-col gap-3 md:flex-row">
          <input value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }} placeholder="Search tracker" className="flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none" />
          <div className="flex flex-wrap gap-2">
            {statusTabs.map((item) => (
              <button type="button" key={item} onClick={() => { setTab(item); setPage(0); }} className={`rounded-full px-3 py-2 text-xs font-bold uppercase ${tab === item ? "bg-pink-500" : "bg-white/10"}`}>{item}</button>
            ))}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-white/60">
          <span>{filtered.length} records</span>
          <div className="flex items-center gap-2">
            <button type="button" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} className="rounded-full bg-white/10 px-3 py-1 disabled:opacity-30">Prev</button>
            <span>Day {page + 1} / {pageCount}</span>
            <button type="button" disabled={page + 1 >= pageCount} onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} className="rounded-full bg-white/10 px-3 py-1 disabled:opacity-30">Next</button>
          </div>
        </div>

        {loading ? <p className="p-6 text-white/60">Loading tracker...</p> : (
          <div className="mt-4 overflow-auto rounded-2xl border border-white/10">
            <table className="min-w-[950px] w-full border-collapse text-left text-xs">
              <thead className="bg-slate-950 text-white/50">
                <tr>
                  <th className="px-3 py-3">#</th>
                  <th className="px-3 py-3">Company</th>
                  <th className="px-3 py-3">Opportunity</th>
                  <th className="px-3 py-3">Location</th>
                  <th className="px-3 py-3">Source</th>
                  <th className="px-3 py-3">Contact Status</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Decision</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row, index) => (
                  <tr key={row.id} onClick={() => setSelectedId(row.id)} className="cursor-pointer border-t border-white/10 hover:bg-white/[0.04]">
                    <td className="px-3 py-3 text-white/45">{page * pageSize + index + 1}</td>
                    <td className="px-3 py-3 font-bold">{clean(row.company, "Company not saved")}</td>
                    <td className="px-3 py-3">{clean(row.title, "Untitled role")}</td>
                    <td className="px-3 py-3 text-white/65">{clean(row.location)}</td>
                    <td className="px-3 py-3">{clean(row.source, "Indeed")}</td>
                    <td className="px-3 py-3"><span className="rounded-full bg-emerald-400/10 px-2 py-1 text-emerald-200">{safeContactStatus(row)}</span></td>
                    <td className="px-3 py-3"><span className="rounded-full bg-white/10 px-2 py-1">{clean(row.status, "new")}</span></td>
                    <td className="px-3 py-3">
                      <div className="flex gap-2">
                        <button type="button" onClick={(e) => { e.stopPropagation(); decide(row, "approved"); }} className="rounded-full bg-emerald-500/20 px-2 py-1 text-emerald-200">Approve</button>
                        <button type="button" onClick={(e) => { e.stopPropagation(); decide(row, "skipped"); }} className="rounded-full bg-rose-500/20 px-2 py-1 text-rose-200">Skip</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <aside className="rounded-[2rem] border border-white/10 bg-slate-950/80 p-5 text-white">
        <p className="text-xs font-black uppercase tracking-[0.3em] text-pink-300">Selected job</p>
        {selected ? (
          <div className="mt-4 space-y-4">
            <div>
              <h3 className="text-2xl font-black">{clean(selected.title, "Untitled role")}</h3>
              <p className="mt-1 text-pink-200">{clean(selected.company, "Company not saved")}</p>
              <p className="text-sm text-white/55">{clean(selected.location)}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-white/40">Private contact</p>
              <p className="mt-2 font-bold text-emerald-200">{safeContactStatus(selected)}</p>
              <p className="mt-1 text-xs text-white/50">Actual employer contact details are stored privately and not displayed here.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-white/40">Short description</p>
              <p className="mt-2 max-h-64 overflow-auto text-sm leading-6 text-white/70">{clean(selected.description, "No description saved yet")}</p>
            </div>
            {selected.apply_url && <a href={selected.apply_url} target="_blank" rel="noreferrer" className="block rounded-2xl bg-white px-4 py-3 text-center text-sm font-black text-slate-950">Open job post</a>}
          </div>
        ) : <p className="mt-4 text-sm text-white/60">Select a row to preview details.</p>}
      </aside>
    </div>
  );
}
