"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "../providers/AuthProvider";
import { getSupabaseClient } from "../../lib/supabaseClient";

type Category = "disability" | "aged_care" | "childcare";
type Agent = { id: string; category: Category; name: string; status: "active" | "paused" };
const OPTIONS: Array<{ category: Category; title: string; description: string }> = [
  { category: "disability", title: "Disability Agent", description: "Disability support and NDIS jobs" },
  { category: "aged_care", title: "Aged Care Agent", description: "Aged care and support jobs" },
  { category: "childcare", title: "Childcare Agent", description: "Childcare and early learning jobs" },
];

export default function IndependentDashboard() {
  const { status, user, signOut } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const panel = searchParams.get("panel") || "agents";
  const [agents, setAgents] = useState<Agent[]>([]);
  const [fullName, setFullName] = useState("");
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login?next=%2Fdashboard");
    if (status !== "authenticated" || !user) return;
    const db = getSupabaseClient();
    void Promise.all([
      db.from("calsie_agents").select("id,category,name,status").eq("user_id", user.id),
      db.from("calsie_profiles").select("full_name,location").eq("id", user.id).maybeSingle(),
    ]).then(([agentResult, profileResult]) => {
      if (agentResult.error || profileResult.error) {
        setError(agentResult.error?.message || profileResult.error?.message || "Could not load your account.");
        return;
      }
      setAgents((agentResult.data || []) as Agent[]);
      setFullName(profileResult.data?.full_name || user.user_metadata?.full_name || "");
      setLocation(profileResult.data?.location || "");
    });
  }, [router, status, user]);

  async function chooseAgent(category: Category, title: string) {
    if (!user) return;
    setBusy(category); setError(""); setNotice("");
    const db = getSupabaseClient();
    const { data, error: saveError } = await db.from("calsie_agents")
      .upsert({ user_id: user.id, category, name: title, status: "active" }, { onConflict: "user_id,category" })
      .select("id,category,name,status").single();
    if (saveError) setError(saveError.message);
    else {
      setAgents((current) => [...current.filter((item) => item.category !== category), data as Agent]);
      window.localStorage.setItem(`calsie:agent-campaign:${user.id}`, data.id);
      router.push("/dashboard?panel=approve");
    }
    setBusy("");
  }

  async function saveProfile() {
    if (!user) return;
    setBusy("profile"); setError(""); setNotice("");
    const { error: saveError } = await getSupabaseClient().from("calsie_profiles")
      .upsert({ id: user.id, full_name: fullName.trim(), location: location.trim(), updated_at: new Date().toISOString() });
    if (saveError) setError(saveError.message);
    else setNotice("Profile saved.");
    setBusy("");
  }

  if (status === "loading" || status === "unauthenticated") return <main style={{ padding: 40 }}>Opening Calsie…</main>;
  const review = panel === "approve" || panel === "tracker" || panel === "history";
  return (
    <main style={{ minHeight: "100vh", background: "#f7f7f8", color: "#161616", padding: "28px clamp(18px,4vw,56px)", fontFamily: "Arial, sans-serif" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <Link href="/dashboard" style={{ color: "#f97316", fontSize: 24, fontWeight: 900, textDecoration: "none" }}>Calsie Jobs</Link>
        <nav style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
          <Link href="/dashboard">Agents</Link><Link href="/dashboard?panel=approve">Smash or Pass</Link>
          <Link href="/dashboard?panel=tracker">Tracker</Link><Link href="/dashboard?panel=history">History</Link>
          <Link href="/dashboard?panel=profile">Profile</Link>
          <button type="button" onClick={() => void signOut().then(() => router.replace("/login"))}>Log out</button>
        </nav>
      </header>
      <div style={{ margin: "44px auto 0", maxWidth: 1240 }}>
        {error && <p role="alert" style={{ color: "#b91c1c" }}>{error}</p>}
        {notice && <p role="status" style={{ color: "#166534" }}>{notice}</p>}
        {review ? (
          <>
            <h1 style={{ fontSize: 36 }}>{panel === "approve" ? "Smash or Pass" : panel === "tracker" ? "Your tracker" : "Review history"}</h1>
            <iframe title="Calsie agent jobs" src={`/tracker?embedded=1&view=${panel === "approve" ? "review" : panel}`} style={{ display: "block", width: "100%", minHeight: "900px", border: 0 }} />
          </>
        ) : panel === "profile" ? (
          <section style={{ maxWidth: 540 }}>
            <h1>Your profile</h1><p>{user?.email}</p>
            <label style={{ display: "block", margin: "24px 0" }}>Full name<br /><input value={fullName} onChange={(event) => setFullName(event.target.value)} style={{ width: "100%", padding: 12 }} /></label>
            <label style={{ display: "block", marginBottom: 24 }}>Location<br /><input value={location} onChange={(event) => setLocation(event.target.value)} style={{ width: "100%", padding: 12 }} /></label>
            <button type="button" disabled={busy === "profile"} onClick={() => void saveProfile()}>Save profile</button>
          </section>
        ) : (
          <>
            <h1 style={{ fontSize: 40, marginBottom: 8 }}>Choose your job agent</h1>
            <p style={{ color: "#666", marginBottom: 30 }}>Each agent reviews jobs from its own category pool.</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", gap: 20 }}>
              {OPTIONS.map((option) => {
                const existing = agents.find((item) => item.category === option.category);
                return <article key={option.category} style={{ background: "white", borderRadius: 20, padding: 28, boxShadow: "0 12px 30px rgba(0,0,0,.06)" }}>
                  <h2>{option.title}</h2><p style={{ color: "#666", minHeight: 52 }}>{option.description}</p>
                  <button type="button" disabled={busy === option.category} onClick={() => void chooseAgent(option.category, option.title)} style={{ background: "#f97316", color: "white", border: 0, borderRadius: 12, padding: "12px 18px", fontWeight: 700, cursor: "pointer" }}>
                    {busy === option.category ? "Opening…" : existing ? "Open agent" : "Choose agent"}
                  </button>
                </article>;
              })}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
