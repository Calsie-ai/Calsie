"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
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
  "How far should I look? Choose 5km, 10km, 20km, 30km, or 50km.",
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

const defaultMessages: Message[] = [
  { role: "applix", text: "I am Applix, the job-hunt symbiote from ASSI. Tell me what work you want and I will build the campaign with you." },
  { role: "applix", text: questions[0] },
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
  messages: defaultMessages,
};

function normalizeCache(value: any): ChatState {
  const step = typeof value?.step === "number" ? Math.min(Math.max(value.step, 0), questions.length) : 0;
  let messages = Array.isArray(value?.messages) && value.messages.length ? value.messages : defaultMessages;
  const editSpamCount = messages.filter((message: Message) => message?.text?.startsWith("Let's edit that")).length;

  if (editSpamCount > 2 || messages.length > 80) {
    messages = defaultMessages;
  }

  return {
    ...defaultState,
    ...value,
    step,
    plan: value?.plan === "full" ? "full" : "gentle",
    radiusKm: Number(value?.radiusKm) || 20,
    messages,
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
  const clean = text.toLowerCase().trim();
  return ["yes", "y", "ok", "okay", "agree", "allow", "consent", "sure"].some((word) => clean === word || clean.includes(word));
}

function isOnlyGreeting(text: string) {
  const clean = text.toLowerCase().trim();
  return ["hi", "hello", "hey", "hi ai", "hello ai", "hey ai"].includes(clean);
}

function nextQuestion(step: number) {
  const nextStep = Math.min(step + 1, questions.length);
  return nextStep >= questions.length ? "All set. Review the summary, then launch Applix and create your account." : questions[nextStep];
}

export default function HomePage() {
  const router = useRouter();
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<ChatState>(defaultState);
  const [input, setInput] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState("Chat autosaves in this browser.");
  const [aiThinking, setAiThinking] = useState(false);

  const isComplete = state.step >= questions.length;
  const dailyLimit = state.plan === "gentle" ? 10 : 100;
  const currentQuestion = questions[state.step] || "All set. Review the summary, then launch Applix.";

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
    setStatus(aiThinking ? "Applix is reading your answer..." : "Saved in this browser.");
  }, [loaded, state, aiThinking]);

  useEffect(() => {
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: "smooth" });
  }, [state.messages.length, aiThinking]);

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

  function updateByStep(base: ChatState, value: string) {
    const next = { ...base };
    const step = base.step;
    if (step === 0) next.targetRole = value;
    if (step === 1) next.companyType = value;
    if (step === 2) next.targetArea = value;
    if (step === 3) next.radiusKm = parseRadius(value);
    if (step === 4) next.fullName = value;
    if (step === 5) next.email = value.toLowerCase();
    if (step === 6) next.phone = value;
    if (step === 7) next.resumeSummary = value;
    if (step === 8) next.skills = value;
    if (step === 9) next.experience = value;
    if (step === 10) next.certificates = value;
    if (step === 11) next.plan = value.includes("100") ? "full" : "gentle";
    if (step === 12) next.aiConsent = true;
    if (step === 13) next.emailConsent = true;
    return next;
  }

  function applyOpenAiUpdates(base: ChatState, updates: any) {
    const next = { ...base };
    if (!updates || typeof updates !== "object") return next;
    if (typeof updates.targetRole === "string" && updates.targetRole.trim()) next.targetRole = updates.targetRole.trim();
    if (typeof updates.companyType === "string" && updates.companyType.trim()) next.companyType = updates.companyType.trim();
    if (typeof updates.targetArea === "string" && updates.targetArea.trim()) next.targetArea = updates.targetArea.trim();
    if (typeof updates.radiusKm === "number" && updates.radiusKm > 0) next.radiusKm = parseRadius(String(updates.radiusKm));
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

  function validateLocal(value: string) {
    if (state.step === 0 && isOnlyGreeting(value)) {
      return "Tell me the job or work you want, for example: Support Worker, Admin Assistant, or Social Worker.";
    }
    if (state.step === 3 && !/\d+/.test(value)) {
      return "Choose a radius like 5km, 10km, 20km, 30km, or 50km.";
    }
    if (state.step === 5 && !/^\S+@\S+\.\S+$/.test(value)) {
      return "That does not look like a full email. Please type it like name@gmail.com.";
    }
    if ((state.step === 12 || state.step === 13) && !yes(value)) {
      return state.step === 12
        ? "I need a clear yes before using AI to write drafts or tailor editable wording. Reply yes when ready."
        : "I need a clear yes before asking for Gmail access later. Nothing sends without your approval. Reply yes when ready.";
    }
    return "";
  }

  async function answer(text: string) {
    const value = text.trim();
    if (!value || isComplete || aiThinking) return;

    const validation = validateLocal(value);
    if (validation) {
      setState((current) => ({
        ...current,
        messages: [...current.messages, { role: "user", text: value }, { role: "applix", text: validation }],
      }));
      setInput("");
      return;
    }

    const baseUpdated = updateByStep(state, value);
    const nextStep = Math.min(state.step + 1, questions.length);
    const controlledNextMessage = nextQuestion(state.step);

    setState((current) => ({ ...baseUpdated, messages: [...current.messages, { role: "user", text: value }] }));
    setInput("");
    setAiThinking(true);

    try {
      const response = await fetch("/api/applix/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: state.step,
          userMessage: value,
          currentQuestion,
          setup: baseUpdated,
        }),
      });
      const data = await response.json();
      const openAiUpdated = applyOpenAiUpdates(baseUpdated, data?.updates);

      setState((current) => ({
        ...openAiUpdated,
        step: nextStep,
        messages: [...current.messages, { role: "applix", text: controlledNextMessage }],
      }));
      setStatus(data?.source === "openai" ? "Applix used OpenAI to understand the answer, then followed the setup flow." : "Saved in this browser. OpenAI fallback used.");
    } catch {
      setState((current) => ({
        ...baseUpdated,
        step: nextStep,
        messages: [...current.messages, { role: "applix", text: controlledNextMessage }],
      }));
      setStatus("Saved in this browser. OpenAI route was unavailable, fallback used.");
    } finally {
      setAiThinking(false);
    }
  }

  function goBackOne() {
    if (state.step <= 0 || aiThinking) return;
    setState((current) => {
      const nextStep = Math.max(current.step - 1, 0);
      const cleanedMessages = current.messages.slice(0, Math.max(2, current.messages.length - 2));
      return {
        ...current,
        step: nextStep,
        messages: [...cleanedMessages, { role: "applix", text: questions[nextStep] }],
      };
    });
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
          <div style={styles.statusBox}><span>{status}</span><button type="button" style={styles.clearButton} onClick={clearChat}>Clear chat</button></div>
          <div style={styles.summaryBox}>{summary.map(([label, value]) => <div key={label} style={styles.summaryRow}><strong>{label}</strong><span>{value}</span></div>)}</div>
        </aside>

        <section style={styles.chatCard}>
          <div style={styles.dots}><span style={{ ...styles.dot, background: "#ff8a3d" }} /><span style={{ ...styles.dot, background: "#5ee7ff" }} /><span style={{ ...styles.dot, background: "#8b5cf6" }} /></div>
          <div style={styles.progress}>QUESTION {Math.min(state.step + 1, questions.length)} / {questions.length}</div>
          <div ref={messagesRef} style={styles.messages}>
            {state.messages.map((message, index) => <div key={`${message.role}-${index}`} style={message.role === "applix" ? styles.applixBubble : styles.userBubble}>{message.text}</div>)}
            {aiThinking && <div style={styles.applixBubble}>Applix is reading that...</div>}
          </div>

          {!isComplete && state.step === 3 && <div style={styles.quickGrid}><button type="button" style={styles.quickButton} onClick={() => answer("5km")}>5km</button><button type="button" style={styles.quickButton} onClick={() => answer("10km")}>10km</button><button type="button" style={styles.quickButton} onClick={() => answer("20km")}>20km</button><button type="button" style={styles.quickButton} onClick={() => answer("30km")}>30km</button><button type="button" style={styles.quickButton} onClick={() => answer("50km")}>50km</button></div>}
          {!isComplete && state.step === 11 && <div style={styles.quickGrid}><button type="button" style={styles.quickButton} onClick={() => answer("10 applications per day")}>10/day for 10 days</button><button type="button" style={styles.quickButton} onClick={() => answer("100 applications per day")}>100/day for 10 days</button></div>}
          {!isComplete && state.step >= 12 && <div style={styles.quickGrid}><button type="button" style={styles.quickButton} onClick={() => answer("yes")}>Yes, I consent</button><button type="button" style={styles.quickButtonGhost} onClick={() => answer("not yet")}>Not yet</button></div>}

          {!isComplete ? (
            <form style={styles.inputRow} onSubmit={(event) => { event.preventDefault(); answer(input); }}>
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    answer(input);
                  }
                }}
                placeholder={currentQuestion}
                style={styles.textInput}
                disabled={aiThinking}
              />
              <div style={styles.sendStack}>
                <button type="submit" style={styles.sendButton} disabled={aiThinking}>{aiThinking ? "Wait" : "Send"}</button>
                <button type="button" style={styles.backButton} onClick={goBackOne} disabled={aiThinking}>Back</button>
              </div>
            </form>
          ) : (
            <div style={styles.launchArea}>
              <button style={styles.launchButton} onClick={launch}>Launch Applix & sign up</button>
              <button type="button" style={styles.backButtonWide} onClick={goBackOne}>Edit last answer</button>
            </div>
          )}
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
  title: { maxWidth: 620, margin: 0, fontSize: "clamp(42px, 7vw, 76px)", lineHeight: .9, letterSpacing: -3, textTransform: "uppercase" as const, textShadow: "4px 4px 0 rgba(255,138,61,.25),-3px -2px 0 rgba(94,231,255,.18)" },
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
  textInput: { minHeight: 72, resize: "vertical" as const, border: "1px solid rgba(255,138,61,.26)", borderRadius: 16, padding: 14, color: "#fff", background: "rgba(2,6,23,.75)", fontWeight: 800, fontFamily: "Arial, Helvetica, sans-serif", minWidth: 0 },
  sendStack: { display: "grid", gap: 8 },
  sendButton: { border: 0, borderRadius: 16, padding: "0 20px", background: "linear-gradient(135deg,#ff8a3d,#5ee7ff)", color: "#090d18", fontWeight: 900, cursor: "pointer" },
  backButton: { border: "1px solid rgba(255,255,255,.14)", borderRadius: 16, padding: "10px 14px", background: "transparent", color: "#cbd5e1", fontWeight: 900, cursor: "pointer" },
  backButtonWide: { width: "calc(100% - 36px)", margin: "0 18px 18px", border: "1px solid rgba(255,255,255,.14)", borderRadius: 999, padding: "13px 18px", background: "transparent", color: "#cbd5e1", fontWeight: 900, cursor: "pointer" },
  quickGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, padding: "0 18px 18px" },
  quickButton: { border: 0, borderRadius: 999, padding: "13px 14px", background: "linear-gradient(135deg,#ff8a3d,#ffd08a)", color: "#090d18", fontWeight: 900, cursor: "pointer" },
  quickButtonGhost: { border: "1px solid rgba(255,255,255,.16)", borderRadius: 999, padding: "13px 14px", background: "rgba(255,255,255,.04)", color: "#cbd5e1", fontWeight: 900, cursor: "pointer" },
  launchArea: { display: "grid", gap: 10 },
  launchButton: { margin: 18, width: "calc(100% - 36px)", padding: "17px 24px", border: 0, borderRadius: 999, background: "linear-gradient(135deg,#ff8a3d,#5ee7ff)", color: "#090d18", fontWeight: 900, fontSize: 18, cursor: "pointer" },
};
