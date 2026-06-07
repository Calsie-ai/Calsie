"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const CACHE_KEY = "applixChatLaunchCache";

type Plan = "gentle" | "full";
type Message = { role: "applix" | "user"; text: string };
type ChatState = {
  step: number;
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
  messages: Message[];
};

const questions = [
  "What work do you want? Example: Support Worker, Admin Assistant, Social Worker.",
  "What kind of companies should I look for? Example: NDIS providers, aged care, healthcare, offices.",
  "Where should I hunt? Type a city, suburb, or area. Example: Burwood NSW, Parramatta, Melbourne CBD.",
  "How far should I look? Type 5km, 10km, 20km, 30km, or 50km.",
  "Tell me your full name.",
  "What email should companies reply to?",
  "What phone number should appear on your resume/contact details?",
  "Write a short resume summary. Tell me who you are and what kind of work you can do.",
  "List your main skills. Example: personal care, NDIS support, documentation, communication, teamwork.",
  "Tell me your experience. Include where you worked, what you did, and anything important.",
  "Add your certificates or checks. Example: First Aid, CPR, Police Check, WWCC, NDIS module. Type none if not applicable.",
  "Choose your Applix level: type 10 for 10 applications/day, or 100 for 100 applications/day. Both run for 10 days.",
  "Do I have permission to use AI to prepare email drafts and tailor editable resume wording while keeping your facts locked? Reply yes.",
  "Later, Applix will ask Gmail permission to send only emails you approve. Do you consent to that email access request later? Reply yes.",
];

const defaultState: ChatState = {
  step: 0,
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
  messages: [
    { role: "applix", text: "I am Applix, the job-hunt symbiote from ASSI. I will ask everything step by step." },
    { role: "applix", text: questions[0] },
  ],
};

function readCache(): ChatState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    return raw ? { ...defaultState, ...JSON.parse(raw) } : null;
  } catch {
    return null;
  }
}

function parseRadius(text: string) {
  const match = text.match(/\d+/);
  const value = match ? Number(match[0]) : 20;
  if (value <= 5) return 5;
  if (value <= 10) return 10;
  if (value <= 20) return 20;
  if (value <= 30) return 30;
  return 50;
}

function yes(text: string) {
  return ["yes", "y", "ok", "okay", "agree", "allow", "consent"].some((word) => text.toLowerCase().includes(word));
}

export default function HomePage() {
  const router = useRouter();
  const [state, setState] = useState<ChatState>(defaultState);
  const [input, setInput] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState("Chat autosaves in this browser.");

  const isComplete = state.step >= questions.length;
  const dailyLimit = state.plan === "gentle" ? 10 : 100;

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
    setStatus("Saved in this browser.");
  }, [loaded, state]);

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

  function addMessages(next: ChatState, userText: string, applixText?: string) {
    setState({
      ...next,
      messages: [
        ...state.messages,
        { role: "user", text: userText },
        ...(applixText ? [{ role: "applix" as const, text: applixText }] : []),
      ],
    });
  }

  function answer(text: string) {
    const value = text.trim();
    if (!value) return;

    const next = { ...state };
    const step = state.step;

    if (step === 0) next.targetRole = value;
    if (step === 1) next.companyType = value;
    if (step === 2) next.targetArea = value;
    if (step === 3) next.radiusKm = parseRadius(value);
    if (step === 4) next.fullName = value;
    if (step === 5) {
      if (!value.includes("@")) {
        addMessages(state, value, "That does not look like an email. Please type your email address.");
        setInput("");
        return;
      }
      next.email = value;
    }
    if (step === 6) next.phone = value;
    if (step === 7) next.resumeSummary = value;
    if (step === 8) next.skills = value;
    if (step === 9) next.experience = value;
    if (step === 10) next.certificates = value;
    if (step === 11) next.plan = value.includes("100") ? "full" : "gentle";
    if (step === 12) {
      if (!yes(value)) {
        addMessages(state, value, "I need a yes before using AI to write drafts or tailor editable wording. Reply yes when ready.");
        setInput("");
        return;
      }
      next.aiConsent = true;
    }
    if (step === 13) {
      if (!yes(value)) {
        addMessages(state, value, "I need a yes before asking for Gmail access later. Nothing sends without your approval. Reply yes when ready.");
        setInput("");
        return;
      }
      next.emailConsent = true;
    }

    next.step = Math.min(step + 1, questions.length);
    const nextText = next.step >= questions.length ? "All set. Review the summary, then launch Applix and create your account." : questions[next.step];
    addMessages(next, value, nextText);
    setInput("");
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
          <h1 style={styles.title}>Tell Applix what work you want.</h1>
          <p style={styles.copy}>Applix asks everything like a conversation, remembers your answers, prepares the approach, and keeps you in control.</p>
          <div style={styles.statusBox}>{status}<button style={styles.clearButton} onClick={clearChat}>Clear chat</button></div>
          <div style={styles.summaryBox}>{summary.map(([label, value]) => <div key={label} style={styles.summaryRow}><strong>{label}</strong><span>{value}</span></div>)}</div>
        </aside>

        <section style={styles.chatCard}>
          <div style={styles.dots}><span /><span /><span /></div>
          <div style={styles.progress}>QUESTION {Math.min(state.step + 1, questions.length)} / {questions.length}</div>
          <div style={styles.messages}>
            {state.messages.map((message, index) => <div key={`${message.role}-${index}`} style={message.role === "applix" ? styles.applixBubble : styles.userBubble}>{message.text}</div>)}
          </div>

          {!isComplete && state.step === 11 && <div style={styles.quickGrid}><button onClick={() => answer("10 applications per day")}>10/day for 10 days</button><button onClick={() => answer("100 applications per day")}>100/day for 10 days</button></div>}
          {!isComplete && state.step >= 12 && <div style={styles.quickGrid}><button onClick={() => answer("yes")}>Yes, I consent</button><button onClick={() => answer("not yet")}>Not yet</button></div>}

          {!isComplete ? (
            <form style={styles.inputRow} onSubmit={(event) => { event.preventDefault(); answer(input); }}>
              <textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder="Type your answer here..." style={styles.textInput} />
              <button type="submit" style={styles.sendButton}>Send</button>
            </form>
          ) : (
            <button style={styles.launchButton} onClick={launch}>Launch Applix & sign up</button>
          )}
        </section>
      </section>
    </main>
  );
}

const styles = {
  main: { minHeight: "100vh", background: "radial-gradient(circle at 18% 14%, rgba(255,138,61,.18), transparent 24%), radial-gradient(circle at 72% 24%, rgba(94,231,255,.1), transparent 26%), linear-gradient(135deg,#080403,#050914 42%,#07070b)", color: "#f8fafc", fontFamily: "Arial, Helvetica, sans-serif", padding: "34px 24px 64px" },
  header: { maxWidth: 1180, margin: "0 auto 42px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" as const },
  logo: { display: "grid", placeItems: "center", width: 30, height: 30, borderRadius: 9, background: "#17100b", border: "1px solid rgba(255,154,76,.7)", color: "#ffc27a", textDecoration: "none", fontWeight: 900 },
  headerText: { fontSize: 10, letterSpacing: 2, fontWeight: 900, color: "#cbd5e1" },
  navLink: { marginLeft: "auto", color: "#cbd5e1", textDecoration: "none", fontSize: 12, fontWeight: 900 },
  shell: { maxWidth: 1180, margin: "0 auto", display: "grid", gridTemplateColumns: "minmax(280px,.82fr) minmax(420px,1fr)", gap: 28, alignItems: "start" },
  side: { position: "sticky" as const, top: 24 },
  eyebrow: { margin: "0 0 18px", color: "#7dd3fc", fontSize: 11, fontWeight: 900, letterSpacing: 2.2 },
  title: { maxWidth: 620, margin: 0, fontSize: "clamp(44px,6vw,76px)", lineHeight: .9, letterSpacing: -3, textTransform: "uppercase" as const, textShadow: "4px 4px 0 rgba(255,138,61,.25),-3px -2px 0 rgba(94,231,255,.18)" },
  copy: { maxWidth: 560, margin: "22px 0", color: "#cbd5e1", fontSize: 17, lineHeight: 1.6, fontWeight: 700 },
  statusBox: { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", padding: 14, borderRadius: 18, background: "rgba(15,23,42,.72)", border: "1px solid rgba(94,231,255,.18)", color: "#cbd5e1", fontWeight: 800, fontSize: 12 },
  clearButton: { border: "1px solid rgba(255,255,255,.14)", background: "transparent", color: "#ffd08a", borderRadius: 999, padding: "7px 10px", fontWeight: 900, cursor: "pointer" },
  summaryBox: { marginTop: 16, display: "grid", gap: 8, padding: 16, borderRadius: 18, background: "rgba(15,23,42,.72)", border: "1px solid rgba(255,138,61,.28)" },
  summaryRow: { display: "grid", gridTemplateColumns: "92px 1fr", gap: 12, color: "#cbd5e1", fontSize: 13, lineHeight: 1.4 },
  chatCard: { borderRadius: 22, background: "linear-gradient(180deg,rgba(13,18,31,.98),rgba(8,12,20,.98))", boxShadow: "0 30px 90px rgba(0,0,0,.38)", border: "1px solid rgba(255,138,61,.45)", overflow: "hidden" },
  dots: { display: "flex", gap: 6, padding: "12px 14px", borderBottom: "1px solid rgba(255,138,61,.28)" },
  progress: { padding: "12px 18px", color: "#5ee7ff", fontSize: 11, letterSpacing: 1.8, fontWeight: 900, borderBottom: "1px solid rgba(94,231,255,.14)" },
  messages: { height: "min(58vh, 560px)", minHeight: 430, overflowY: "auto" as const, padding: 20, display: "flex", flexDirection: "column" as const, gap: 12 },
  applixBubble: { maxWidth: "84%", alignSelf: "flex-start", padding: "14px 16px", borderRadius: "18px 18px 18px 4px", background: "rgba(255,138,61,.12)", border: "1px solid rgba(255,138,61,.28)", color: "#fff", lineHeight: 1.5, fontWeight: 800 },
  userBubble: { maxWidth: "84%", alignSelf: "flex-end", padding: "14px 16px", borderRadius: "18px 18px 4px 18px", background: "rgba(94,231,255,.12)", border: "1px solid rgba(94,231,255,.28)", color: "#e0fbff", lineHeight: 1.5, fontWeight: 800 },
  inputRow: { display: "grid", gridTemplateColumns: "1fr auto", gap: 10, padding: 18, borderTop: "1px solid rgba(255,138,61,.18)" },
  textInput: { minHeight: 58, resize: "vertical" as const, border: "1px solid rgba(255,138,61,.26)", borderRadius: 16, padding: 14, color: "#fff", background: "rgba(2,6,23,.75)", fontWeight: 800, fontFamily: "Arial, Helvetica, sans-serif" },
  sendButton: { border: 0, borderRadius: 16, padding: "0 20px", background: "linear-gradient(135deg,#ff8a3d,#5ee7ff)", color: "#090d18", fontWeight: 900, cursor: "pointer" },
  quickGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "0 18px 18px" },
  launchButton: { margin: 18, width: "calc(100% - 36px)", padding: "17px 24px", border: 0, borderRadius: 999, background: "linear-gradient(135deg,#ff8a3d,#5ee7ff)", color: "#090d18", fontWeight: 900, fontSize: 18, cursor: "pointer" },
};
