import { NextResponse } from "next/server";

type ChatPayload = {
  step: number;
  userMessage: string;
  currentQuestion: string;
  setup: Record<string, unknown>;
};

const fallbackQuestions = [
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

function fallbackReply(step: number) {
  const nextStep = Math.min(step + 1, fallbackQuestions.length);
  return nextStep >= fallbackQuestions.length
    ? "All set. Review the summary, then launch Applix and create your account."
    : fallbackQuestions[nextStep];
}

function extractJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ChatPayload;
    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

    if (!apiKey) {
      return NextResponse.json({
        ok: true,
        source: "fallback",
        assistantMessage: fallbackReply(body.step),
        updates: {},
        confidence: 0,
        warning: "OPENAI_API_KEY is missing. Using local fallback question flow.",
      });
    }

    const systemPrompt = `You are Applix, the job-hunt symbiote from ASSI.
Your job is to guide a normal person through launching a job outreach campaign.
Keep replies short, warm, direct, and non-technical.
You must keep the source of truth factual. Do not invent resume facts.
You may interpret the user's answer into structured fields for the campaign.
Do not say emails will be sent automatically. Always say user approval is required.
Return JSON only with this shape:
{
  "assistantMessage": "short next message to show in chat",
  "updates": {
    "targetRole": "",
    "companyType": "",
    "targetArea": "",
    "radiusKm": null,
    "fullName": "",
    "email": "",
    "phone": "",
    "resumeSummary": "",
    "skills": "",
    "experience": "",
    "certificates": "",
    "plan": "gentle or full",
    "aiConsent": null,
    "emailConsent": null
  },
  "confidence": 0.0
}
Only include update values when the user's latest message clearly provides that information.`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: JSON.stringify({
              currentStep: body.step,
              currentQuestion: body.currentQuestion,
              latestUserMessage: body.userMessage,
              existingSetup: body.setup,
              nextFallbackQuestion: fallbackReply(body.step),
            }),
          },
        ],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json({
        ok: true,
        source: "fallback",
        assistantMessage: fallbackReply(body.step),
        updates: {},
        confidence: 0,
        warning: `OpenAI request failed: ${text.slice(0, 220)}`,
      });
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content || "";
    const parsed = extractJson(content);

    if (!parsed) {
      return NextResponse.json({
        ok: true,
        source: "fallback",
        assistantMessage: fallbackReply(body.step),
        updates: {},
        confidence: 0,
        warning: "OpenAI returned non-JSON content. Used fallback.",
      });
    }

    return NextResponse.json({
      ok: true,
      source: "openai",
      assistantMessage: parsed.assistantMessage || fallbackReply(body.step),
      updates: parsed.updates || {},
      confidence: Number(parsed.confidence || 0),
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "Applix chat route failed" }, { status: 500 });
  }
}
