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
  { role: "applix", text: "I am Applix. Tell me the job hunt you want: role, company type, area, and pace. Your Master Resume canvas is on the right — edit it directly and I will reuse it." },
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

function fallbackQuestion(state: ChatState) {
  if (!state.targetRole) return "What job should I hunt for? Example: Support Worker, Admin Assistant, Social Worker.";
  if (!state.companyType) return "What kind of companies should I look for? Example: NDIS providers, aged care, healthcare, local offices.";
  if (!state.targetArea) return "Where should I look? Give me a suburb, city, or area.";
  if (!state.aiConsent || !state.emailConsent) return "Do you consent to AI draft support and later Gmail access request, with you approving before anything sends?";
  return "Campaign memory is ready. Now make sure your Master Resume canvas is complete, then launch when ready.";
}

export default function HomePage() {
  const router = useRouter();
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<ChatState>(defaultState);
  const [input, setInput] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState("Saved locally");
  const [thinking, setThinking] = useState(false);

  const dailyLimit = state.plan === "gentle" ? 10 : 100;
  const canLaunch = state.readyToLaunch || localReady(state);

  useEffect(() => {
    const saved = readCache();
    if (saved) {
      setState(saved);
      setStatus("Restored saved chat");
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
    setStatus("Thinking...");

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
      const assistantText = data?.source === "openai"
        ? data?.assistantMessage || fallbackQuestion(updated)
        : fallbackQuestion(updated);

      setState({
        ...updated,
        readyToLaunch: ready,
        messages: [...withUser.messages, { role: "applix", text: assistantText }],
      });
      setStatus(data?.source === "openai" ? "OpenAI connected" : "Fallback: add OPENAI_API_KEY in Vercel");
    } catch {
      setState({
        ...withUser,
        messages: [...withUser.messages, { role: "applix", text: fallbackQuestion(withUser) }],
      });
      setStatus("Fallback: OpenAI route unavailable");
    } finally {
      setThinking(false);
    }
  }

  function updateResume(field: keyof ChatState, value: string) {
    setState((current) => ({ ...current, [field]: value }));
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
      resumeSource: "master_resume_canvas",
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
    setStatus("Chat cleared");
  }

  return (
    <main style={styles.main}>
      <header style={styles.topbar}>
        <Link href="/" style={styles.logo}>A</Link>
        <div>
          <strong style={styles.product}>Applix</strong>
          <span style={styles.subProduct}>ASSI job-hunt symbiote</span>
        </div>
        <div style={styles.topActions}>
          <span style={styles.statusPill}>{status}</span>
          <Link href="/login" style={styles.accountLink}>Account</Link>
        </div>
      </header>

      <section style={styles.appShell}>
        <section style={styles.chatPanel}>
          <div style={styles.chatHeader}>
            <div style={styles.dots}><span style={{ ...styles.dot, background: "#ff8a3d" }} /><span style={{ ...styles.dot, background: "#5ee7ff" }} /><span style={{ ...styles.dot, background: "#8b5cf6" }} /></div>
            <strong>{canLaunch ? "Ready to launch" : "Chat with Applix"}</strong>
          </div>

          <div ref={messagesRef} style={styles.messages}>
            {state.messages.map((message, index) => <div key={`${message.role}-${index}`} style={message.role === "applix" ? styles.applixBubble : styles.userBubble}>{message.text}</div>)}
            {thinking && <div style={styles.applixBubble}>Thinking...</div>}
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
              placeholder="Message Applix about target role, company type, area, or sending pace..."
              style={styles.textInput}
              disabled={thinking}
            />
            <button type="submit" style={styles.sendButton} disabled={thinking}>{thinking ? "..." : "Send"}</button>
          </form>
        </section>

        <aside style={styles.memoryPanel}>
          <div style={styles.memoryHeader}>
            <div>
              <p style={styles.eyebrow}>Campaign memory</p>
              <h1 style={styles.memoryTitle}>Applix remembers</h1>
            </div>
            <button type="button" style={styles.clearButton} onClick={clearChat}>Clear</button>
          </div>
          <div style={styles.summaryBox}>{summary.map(([label, value]) => <div key={label} style={styles.summaryRow}><strong>{label}</strong><span>{value}</span></div>)}</div>
          <button type="button" style={canLaunch ? styles.launchButton : styles.disabledLaunchButton} onClick={launch} disabled={!canLaunch}>Launch Applix</button>
          <p style={styles.helpText}>{canLaunch ? "You can launch and review in the dashboard." : "Chat about the job target and complete the Master Resume canvas."}</p>

          <section style={styles.resumeCanvas}>
            <p style={styles.eyebrow}>Master Resume Canvas</p>
            <h2 style={styles.resumeTitle}>Source of truth</h2>
            <p style={styles.resumeNote}>Edit this directly. Applix can tailor copies later, but this master resume stays reusable.</p>

            <label style={styles.canvasLabel}>Full name<input style={styles.canvasInput} value={state.fullName} onChange={(event) => updateResume("fullName", event.target.value)} placeholder="Your full name" /></label>
            <label style={styles.canvasLabel}>Email<input style={styles.canvasInput} value={state.email} onChange={(event) => updateResume("email", event.target.value)} placeholder="you@email.com" /></label>
            <label style={styles.canvasLabel}>Phone<input style={styles.canvasInput} value={state.phone} onChange={(event) => updateResume("phone", event.target.value)} placeholder="04xx xxx xxx" /></label>
            <label style={styles.canvasLabel}>Profile summary<textarea style={styles.canvasTextarea} value={state.resumeSummary} onChange={(event) => updateResume("resumeSummary", event.target.value)} placeholder="Short professional summary..." /></label>
            <label style={styles.canvasLabel}>Skills<textarea style={styles.canvasTextarea} value={state.skills} onChange={(event) => updateResume("skills", event.target.value)} placeholder="Skills separated by commas or lines..." /></label>
            <label style={styles.canvasLabel}>Experience<textarea style={styles.canvasTextareaLarge} value={state.experience} onChange={(event) => updateResume("experience", event.target.value)} placeholder="Work history, projects, responsibilities, achievements..." /></label>
            <label style={styles.canvasLabel}>Certificates / checks<textarea style={styles.canvasTextarea} value={state.certificates} onChange={(event) => updateResume("certificates", event.target.value)} placeholder="First Aid, CPR, Police Check, WWCC, licences, or none..." /></label>
          </section>
        </aside>
      </section>
    </main>
  );
}

const styles = {
  main: { minHeight: "100vh", background: "radial-gradient(circle at 18% 14%, rgba(255,138,61,.18), transparent 24%), radial-gradient(circle at 72% 24%, rgba(94,231,255,.1), transparent 26%), linear-gradient(135deg,#080403,#050914 42%,#07070b)", color: "#f8fafc", fontFamily: "Arial, Helvetica, sans-serif", padding: "18px" },
  topbar: { maxWidth: 1320, margin: "0 auto 18px", display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 18, background: "rgba(15,23,42,.62)", border: "1px solid rgba(255,138,61,.2)" },
  logo: { display: "grid", placeItems: "center", width: 34, height: 34, borderRadius: 10, background: "#17100b", border: "1px solid rgba(255,154,76,.7)", color: "#ffc27a", textDecoration: "none", fontWeight: 900 },
  product: { display: "block", fontSize: 18, letterSpacing: .3 },
  subProduct: { display: "block", color: "#94a3b8", fontSize: 12, fontWeight: 800 },
  topActions: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 },
  statusPill: { padding: "7px 10px", borderRadius: 999, background: "rgba(94,231,255,.1)", color: "#cbd5e1", fontSize: 12, fontWeight: 900 },
  accountLink: { color: "#ffd08a", textDecoration: "none", fontSize: 13, fontWeight: 900 },
  appShell: { maxWidth: 1320, margin: "0 auto", display: "grid", gridTemplateColumns: "minmax(0, 1fr) 430px", gap: 18, alignItems: "stretch" },
  chatPanel: { minWidth: 0, height: "calc(100vh - 104px)", borderRadius: 22, background: "linear-gradient(180deg,rgba(13,18,31,.98),rgba(8,12,20,.98))", border: "1px solid rgba(255,138,61,.38)", overflow: "hidden", display: "flex", flexDirection: "column" as const, boxShadow: "0 30px 90px rgba(0,0,0,.28)" },
  chatHeader: { display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: "1px solid rgba(255,138,61,.2)", color: "#5ee7ff", letterSpacing: 1.1, textTransform: "uppercase" as const, fontSize: 12 },
  dots: { display: "flex", gap: 6 },
  dot: { display: "block", width: 8, height: 8, borderRadius: 999 },
  messages: { flex: 1, overflowY: "auto" as const, padding: "22px", display: "flex", flexDirection: "column" as const, gap: 14, scrollBehavior: "smooth" as const },
  applixBubble: { maxWidth: "78%", alignSelf: "flex-start", padding: "14px 16px", borderRadius: "18px 18px 18px 4px", background: "rgba(255,138,61,.12)", border: "1px solid rgba(255,138,61,.28)", color: "#fff", lineHeight: 1.5, fontWeight: 800, whiteSpace: "pre-wrap" as const },
  userBubble: { maxWidth: "78%", alignSelf: "flex-end", padding: "14px 16px", borderRadius: "18px 18px 4px 18px", background: "rgba(94,231,255,.12)", border: "1px solid rgba(94,231,255,.28)", color: "#e0fbff", lineHeight: 1.5, fontWeight: 800, whiteSpace: "pre-wrap" as const },
  inputRow: { display: "grid", gridTemplateColumns: "1fr auto", gap: 10, padding: 16, borderTop: "1px solid rgba(255,138,61,.18)" },
  textInput: { minHeight: 58, maxHeight: 160, resize: "vertical" as const, border: "1px solid rgba(255,138,61,.26)", borderRadius: 16, padding: 14, color: "#fff", background: "rgba(2,6,23,.75)", fontWeight: 800, fontFamily: "Arial, Helvetica, sans-serif", minWidth: 0 },
  sendButton: { border: 0, borderRadius: 16, padding: "0 22px", background: "linear-gradient(135deg,#ff8a3d,#5ee7ff)", color: "#090d18", fontWeight: 900, cursor: "pointer" },
  memoryPanel: { height: "calc(100vh - 104px)", overflowY: "auto" as const, borderRadius: 22, background: "rgba(15,23,42,.72)", border: "1px solid rgba(94,231,255,.18)", padding: 18, boxShadow: "0 30px 90px rgba(0,0,0,.2)" },
  memoryHeader: { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" },
  eyebrow: { margin: 0, color: "#7dd3fc", fontSize: 11, fontWeight: 900, letterSpacing: 1.8, textTransform: "uppercase" as const },
  memoryTitle: { margin: "6px 0 0", fontSize: 28, lineHeight: 1, letterSpacing: -1, color: "#fff" },
  clearButton: { border: "1px solid rgba(255,255,255,.14)", background: "transparent", color: "#ffd08a", borderRadius: 999, padding: "9px 12px", fontWeight: 900, cursor: "pointer" },
  summaryBox: { marginTop: 18, display: "grid", gap: 10 },
  summaryRow: { display: "grid", gap: 5, padding: "12px", borderRadius: 14, background: "rgba(2,6,23,.46)", border: "1px solid rgba(255,255,255,.08)", color: "#cbd5e1", fontSize: 13, lineHeight: 1.35, wordBreak: "break-word" as const },
  launchButton: { width: "100%", marginTop: 18, border: 0, borderRadius: 999, padding: "15px 18px", background: "linear-gradient(135deg,#ff8a3d,#5ee7ff)", color: "#090d18", fontWeight: 900, cursor: "pointer" },
  disabledLaunchButton: { width: "100%", marginTop: 18, border: "1px solid rgba(255,255,255,.12)", borderRadius: 999, padding: "15px 18px", background: "rgba(255,255,255,.04)", color: "#64748b", fontWeight: 900, cursor: "not-allowed" },
  helpText: { color: "#94a3b8", lineHeight: 1.5, fontSize: 13, fontWeight: 800 },
  resumeCanvas: { marginTop: 22, paddingTop: 18, borderTop: "1px solid rgba(255,255,255,.1)" },
  resumeTitle: { margin: "6px 0 6px", fontSize: 24, letterSpacing: -0.8, color: "#ffffff" },
  resumeNote: { margin: "0 0 14px", color: "#94a3b8", lineHeight: 1.45, fontSize: 13, fontWeight: 800 },
  canvasLabel: { display: "grid", gap: 7, marginTop: 12, color: "#dbeafe", fontSize: 13, fontWeight: 900 },
  canvasInput: { width: "100%", border: "1px solid rgba(255,138,61,.26)", borderRadius: 14, padding: "12px 13px", color: "#ffffff", background: "rgba(2,6,23,.72)", fontWeight: 800, outline: "none" },
  canvasTextarea: { width: "100%", minHeight: 78, resize: "vertical" as const, border: "1px solid rgba(255,138,61,.26)", borderRadius: 14, padding: "12px 13px", color: "#ffffff", background: "rgba(2,6,23,.72)", fontWeight: 800, fontFamily: "Arial, Helvetica, sans-serif", outline: "none" },
  canvasTextareaLarge: { width: "100%", minHeight: 120, resize: "vertical" as const, border: "1px solid rgba(255,138,61,.26)", borderRadius: 14, padding: "12px 13px", color: "#ffffff", background: "rgba(2,6,23,.72)", fontWeight: 800, fontFamily: "Arial, Helvetica, sans-serif", outline: "none" },
};
