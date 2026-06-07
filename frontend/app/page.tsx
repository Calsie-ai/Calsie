"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const CACHE_KEY = "applixChatLaunchCache";

type Plan = "gentle" | "full";
type Message = { role: "applix" | "user"; text: string };
type ChatState = {
  targetRole: string;
  companyType: string;
  targetArea: string;
  radiusKm: number;
  fullName: string;
  email: string;
  phone: string;
  resumeSummary: string;
  skills: string;
  experience: string;
  certificates: string;
  plan: Plan;
  aiConsent: boolean;
  emailConsent: boolean;
  readyToLaunch: boolean;
  messages: Message[];
};

const defaultMessages: Message[] = [
  { role: "applix", text: "I am Applix, the job-hunt symbiote from ASSI. Talk to me normally. Tell me what work you want, where you want to apply, and what resume details I should remember." },
];

const defaultState: ChatState = {
  targetRole: "",
  companyType: "",
  targetArea: "",
  radiusKm: 20,
  fullName: "",
  email: "",
  phone: "",
  resumeSummary: "",
  skills: "",
  experience: "",
  certificates: "",
  plan: "gentle",
  aiConsent: false,
  emailConsent: false,
  readyToLaunch: false,
  messages: defaultMessages,
};

function normalizeCache(value: any): ChatState {
  return {
    ...defaultState,
    ...value,
    plan: value?.plan === "full" ? "full" : "gentle",
    radiusKm: Number(value?.radiusKm) || 20,
    messages: Array.isArray(value?.messages) && value.messages.length ? value.messages.slice(-60) : defaultMessages,
    readyToLaunch: Boolean(value?.readyToLaunch),
  };
}

function readCache(): ChatState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    return raw ? normalizeCache(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function parseRadius(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 20;
  if (number <= 5) return 5;
  if (number <= 10) return 10;
  if (number <= 20) return 20;
  if (number <= 30) return 30;
  return 50;
}

function applyUpdates(base: ChatState, updates: any) {
  const next = { ...base };
  if (!updates || typeof updates !== "object") return next;
  if (typeof updates.targetRole === "string" && updates.targetRole.trim()) next.targetRole = updates.targetRole.trim();
  if (typeof updates.companyType === "string" && updates.companyType.trim()) next.companyType = updates.companyType.trim();
  if (typeof updates.targetArea === "string" && updates.targetArea.trim()) next.targetArea = updates.targetArea.trim();
  if (updates.radiusKm !== null && updates.radiusKm !== undefined) next.radiusKm = parseRadius(updates.radiusKm);
  if (typeof updates.fullName === "string" && updates.fullName.trim()) next.fullName = updates.fullName.trim();
  if (typeof updates.email === "string" && /^\S+@\S+\.\S+$/.test(updates.email)) next.email = updates.email.trim().toLowerCase();
  if (typeof updates.phone === "string" && updates.phone.trim()) next.phone = updates.phone.trim();
  if (typeof updates.resumeSummary === "string" && updates.resumeSummary.trim()) next.resumeSummary = updates.resumeSummary.trim();
  if (typeof updates.skills === "string" && updates.skills.trim()) next.skills = updates.skills.trim();
  if (typeof updates.experience === "string" && updates.experience.trim()) next.experience = updates.experience.trim();
  if (typeof updates.certificates === "string" && updates.certificates.trim()) next.certificates = updates.certificates.trim();
  if (updates.plan === "full" || updates.plan === "gentle") next.plan = updates.plan;
  if (updates.aiConsent === true) next.aiConsent = true;
  if (updates.emailConsent === true) next.emailConsent = true;
  return next;
}

function localReady(state: ChatState) {
  return Boolean(
    state.targetRole &&
    state.companyType &&
    state.targetArea &&
    state.fullName &&
    state.email &&
    state.phone &&
    state.resumeSummary &&
    state.skills &&
    state.experience &&
    state.certificates &&
    state.aiConsent &&
    state.emailConsent
  );
}

export default function HomePage() {
  const router = useRouter();
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<ChatState>(defaultState);
  const [input, setInput] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState("Chat autosaves in this browser.");
  const [thinking, setThinking] = useState(false);

  const dailyLimit = state.plan === "gentle" ? 10 : 100;
  const canLaunch = state.readyToLaunch || localReady(state);

  useEffect(() => {
    const saved = readCache();
    if (saved) {
      setState(saved);
      setStatus("Restored your saved Applix chat.");
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded || typeof window === "undefined") return;
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(state));
  }, [loaded, state]);

  useEffect(() => {
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: "smooth" });
  }, [state.messages.length, thinking]);

  const summary = useMemo(
    () => [
      ["Work", state.targetRole || "—"],
      ["Companies", state.companyType || "—"],
      ["Area", state.targetArea ? `${state.targetArea} (${state.radiusKm}km)` : "—"],
      ["Name", state.fullName || "—"],
      ["Email", state.email || "—"],
      ["Phone", state.phone || "—"],
      ["Level", `${dailyLimit}/day for 10 days`],
      ["Consent", state.aiConsent && state.emailConsent ? "Ready" : "Waiting"],
    ],
    [state, dailyLimit]
  );

  async function send(text: string) {
    const value = text.trim();
    if (!value || thinking) return;

    setInput("");
    setThinking(true);
    setStatus("Applix is thinking...");

    const userMessage: Message = { role: "user", text: value };
    const withUser = { ...state, messages: [...state.messages, userMessage] };
    setState(withUser);

    try {
      const response = await fetch("/api/applix/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userMessage: value,
          setup: withUser,
          history: withUser.messages,
        }),
      });
      const data = await response.json();
      const updated = applyUpdates(withUser, data?.updates);
      const ready = Boolean(data?.readyToLaunch) || localReady(updated);
      const assistantText = data?.assistantMessage || "I saved that. Tell me the next detail for your Applix setup.";

      setState({
        ...updated,
        readyToLaunch: ready,
        messages: [...withUser.messages, { role: "applix", text: assistantText }],
      });
      setStatus(data?.source === "openai" ? "Applix used OpenAI and saved campaign memory." : "Saved in this browser. Fallback used.");
    } catch {
      setState({
        ...withUser,
        messages: [...withUser.messages, { role: "applix", text: "I had trouble thinking for a second. Tell me the target role, area, or resume details and I will keep building the campaign." }],
      });
      setStatus("OpenAI route unavailable. Chat saved locally.");
    } finally {
      setThinking(false);
    }
  }

  function launch() {
    const draft = {
      targetRole: state.targetRole,
      industry: state.companyType,
      selectedAddress: state.targetArea,
      placeId: "chat-area",
      latitude: null,
      longitude: null,
      radiusKm: state.radiusKm,
      resumeName: state.fullName || "Applix resume",
      resumeSource: "chat_form",
      resumeSnapshot: {
        fullName: state.fullName,
        email: state.email,
        phone: state.phone,
        location: state.targetArea,
        summary: state.resumeSummary,
        skills: state.skills,
        experience: state.experience,
        certificates: state.certificates,
      },
      dailyLimit,
      campaignDays: 10,
      emailConsent: state.emailConsent,
      createdAt: new Date().toISOString(),
    };
    sessionStorage.setItem("applixCampaignDraft", JSON.stringify(draft));
    router.push("/login?next=/dashboard");
  }

  function clearChat() {
    localStorage.removeItem(CACHE_KEY);
    sessionStorage.removeItem("applixCampaignDraft");
    setState(defaultState);
    setInput("");
    setStatus("Chat cleared.");
  }

  return (
    <main style={styles.main}>
      <header style={styles.header}>
        <Link href="/" style={styles.logo}>A</Link>
        <span style={styles.headerText}>ARTIFICIAL SYMBIOTIC SUPER INTELLIGENCE</span>
        <Link href="/login" style={styles.navLink}>Applix Account</Link>
      </header>

      <section style={styles.shell}>
        <aside style={styles.side}>
          <p style={styles.eyebrow}>ASSI ECOSYSTEM / APPLIX SYMBIOTE</p>
          <h1 style={styles.title}>Talk to Applix.</h1>
          <p style={styles.copy}>Chat naturally. Applix listens, remembers the campaign details, asks for what is missing, and prepares the job hunt under your control.</p>
          <div style={styles.statusBox}><span>{status}</span><button type="button" style={styles.clearButton} onClick={clearChat}>Clear chat</button></div>
          <div style={styles.summaryBox}>{summary.map(([label, value]) => <div key={label} style={styles.summaryRow}><strong>{label}</strong><span>{value}</span></div>)}</div>
        </aside>

        <section style={styles.chatCard}>
          <div style={styles.dots}><span style={{ ...styles.dot, background: "#ff8a3d" }} /><span style={{ ...styles.dot, background: "#5ee7ff" }} /><span style={{ ...styles.dot, background: "#8b5cf6" }} /></div>
          <div style={styles.progress}>{canLaunch ? "READY TO LAUNCH" : "APPLIX CHAT"}</div>
          <div ref={messagesRef} style={styles.messages}>
            {state.messages.map((message, index) => <div key={`${message.role}-${index}`} style={message.role === "applix" ? styles.applixBubble : styles.userBubble}>{message.text}</div>)}
            {thinking && <div style={styles.applixBubble}>Applix is thinking...</div>}
          </div>

          <div style={styles.quickGrid}>
            <button type="button" style={styles.quickButton} onClick={() => send("I want a 10 applications per day plan")}>10/day</button>
            <button type="button" style={styles.quickButton} onClick={() => send("I want a 100 applications per day plan")}>100/day</button>
            <button type="button" style={styles.quickButtonGhost} onClick={() => send("yes, I consent to AI writing support and Gmail access request later, with my approval before sending")}>Consent</button>
          </div>

          <form style={styles.inputRow} onSubmit={(event) => { event.preventDefault(); send(input); }}>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  send(input);
                }
              }}
              placeholder="Talk to Applix like ChatGPT..."
              style={styles.textInput}
              disabled={thinking}
            />
            <div style={styles.sendStack}>
              <button type="submit" style={styles.sendButton} disabled={thinking}>{thinking ? "Wait" : "Send"}</button>
              <button type="button" style={canLaunch ? styles.launchSmallButton : styles.disabledButton} onClick={launch} disabled={!canLaunch}>Launch</button>
            </div>
          </form>
        </section>
      </section>
    </main>
  );
}

const styles = {
  main: { minHeight: "100vh", background: "radial-gradient(circle at 18% 14%, rgba(255,138,61,.18), transparent 24%), radial-gradient(circle at 72% 24%, rgba(94,231,255,.1), transparent 26%), linear-gradient(135deg,#080403,#050914 42%,#07070b)", color: "#f8fafc", fontFamily: "Arial, Helvetica, sans-serif", padding: "clamp(18px, 4vw, 34px)" },
  header: { maxWidth: 1180, margin: "0 auto 34px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" as const },
  logo: { display: "grid", placeItems: "center", width: 30, height: 30, borderRadius: 9, background: "#17100b", border: "1px solid rgba(255,154,76,.7)", color: "#ffc27a", textDecoration: "none", fontWeight: 900 },
  headerText: { fontSize: 10, letterSpacing: 2, fontWeight: 900, color: "#cbd5e1" },
  navLink: { marginLeft: "auto", color: "#cbd5e1", textDecoration: "none", fontSize: 12, fontWeight: 900 },
  shell: { maxWidth: 1180, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))", gap: 28, alignItems: "start" },
  side: { position: "sticky" as const, top: 24 },
  eyebrow: { margin: "0 0 18px", color: "#7dd3fc", fontSize: 11, fontWeight: 900, letterSpacing: 2.2 },
  title: { maxWidth: 620, margin: 0, fontSize: "clamp(48px, 8vw, 86px)", lineHeight: .9, letterSpacing: -3, textTransform: "uppercase" as const, textShadow: "4px 4px 0 rgba(255,138,61,.25),-3px -2px 0 rgba(94,231,255,.18)" },
  copy: { maxWidth: 560, margin: "22px 0", color: "#cbd5e1", fontSize: 17, lineHeight: 1.6, fontWeight: 700 },
  statusBox: { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", padding: 14, borderRadius: 18, background: "rgba(15,23,42,.72)", border: "1px solid rgba(94,231,255,.18)", color: "#cbd5e1", fontWeight: 800, fontSize: 12 },
  clearButton: { border: "1px solid rgba(255,255,255,.14)", background: "transparent", color: "#ffd08a", borderRadius: 999, padding: "7px 10px", fontWeight: 900, cursor: "pointer" },
  summaryBox: { marginTop: 16, display: "grid", gap: 8, padding: 16, borderRadius: 18, background: "rgba(15,23,42,.72)", border: "1px solid rgba(255,138,61,.28)" },
  summaryRow: { display: "grid", gridTemplateColumns: "92px 1fr", gap: 12, color: "#cbd5e1", fontSize: 13, lineHeight: 1.4, wordBreak: "break-word" as const },
  chatCard: { borderRadius: 22, background: "linear-gradient(180deg,rgba(13,18,31,.98),rgba(8,12,20,.98))", boxShadow: "0 30px 90px rgba(0,0,0,.38)", border: "1px solid rgba(255,138,61,.45)", overflow: "hidden", minWidth: 0 },
  dots: { display: "flex", gap: 6, padding: "12px 14px", borderBottom: "1px solid rgba(255,138,61,.28)" },
  dot: { display: "block", width: 8, height: 8, borderRadius: 999 },
  progress: { padding: "12px 18px", color: "#5ee7ff", fontSize: 11, letterSpacing: 1.8, fontWeight: 900, borderBottom: "1px solid rgba(94,231,255,.14)" },
  messages: { height: "min(58vh, 560px)", minHeight: 360, overflowY: "auto" as const, padding: 20, display: "flex", flexDirection: "column" as const, gap: 12, scrollBehavior: "smooth" as const },
  applixBubble: { maxWidth: "88%", alignSelf: "flex-start", padding: "14px 16px", borderRadius: "18px 18px 18px 4px", background: "rgba(255,138,61,.12)", border: "1px solid rgba(255,138,61,.28)", color: "#fff", lineHeight: 1.5, fontWeight: 800, whiteSpace: "pre-wrap" as const },
  userBubble: { maxWidth: "88%", alignSelf: "flex-end", padding: "14px 16px", borderRadius: "18px 18px 4px 18px", background: "rgba(94,231,255,.12)", border: "1px solid rgba(94,231,255,.28)", color: "#e0fbff", lineHeight: 1.5, fontWeight: 800, whiteSpace: "pre-wrap" as const },
  inputRow: { display: "grid", gridTemplateColumns: "1fr auto", gap: 10, padding: 18, borderTop: "1px solid rgba(255,138,61,.18)" },
  textInput: { minHeight: 78, resize: "vertical" as const, border: "1px solid rgba(255,138,61,.26)", borderRadius: 16, padding: 14, color: "#fff", background: "rgba(2,6,23,.75)", fontWeight: 800, fontFamily: "Arial, Helvetica, sans-serif", minWidth: 0 },
  sendStack: { display: "grid", gap: 8 },
  sendButton: { border: 0, borderRadius: 16, padding: "0 20px", background: "linear-gradient(135deg,#ff8a3d,#5ee7ff)", color: "#090d18", fontWeight: 900, cursor: "pointer" },
  launchSmallButton: { border: 0, borderRadius: 16, padding: "10px 16px", background: "linear-gradient(135deg,#ff8a3d,#ffd08a)", color: "#090d18", fontWeight: 900, cursor: "pointer" },
  disabledButton: { border: "1px solid rgba(255,255,255,.12)", borderRadius: 16, padding: "10px 16px", background: "rgba(255,255,255,.04)", color: "#64748b", fontWeight: 900, cursor: "not-allowed" },
  quickGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 10, padding: "0 18px 18px" },
  quickButton: { border: 0, borderRadius: 999, padding: "13px 14px", background: "linear-gradient(135deg,#ff8a3d,#ffd08a)", color: "#090d18", fontWeight: 900, cursor: "pointer" },
  quickButtonGhost: { border: "1px solid rgba(255,255,255,.16)", borderRadius: 999, padding: "13px 14px", background: "rgba(255,255,255,.04)", color: "#cbd5e1", fontWeight: 900, cursor: "pointer" },
};
