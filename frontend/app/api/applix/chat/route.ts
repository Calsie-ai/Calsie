import { NextResponse } from "next/server";

type ChatPayload = {
  userMessage: string;
  setup: Record<string, unknown>;
  history?: Array<{ role: "applix" | "user"; text: string }>;
};

const requiredCampaignFields = [
  "targetRole",
  "companyType",
  "targetArea",
  "plan",
  "aiConsent",
  "emailConsent",
];

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

function fallbackMissing(setup: Record<string, unknown>) {
  return requiredCampaignFields.filter((field) => {
    const value = setup[field];
    if (typeof value === "boolean") return value !== true;
    return !value;
  });
}

function fallbackAssistantMessage(setup: Record<string, unknown>) {
  const missing = fallbackMissing(setup);
  const first = missing[0];

  if (!first) {
    return "Your campaign target is ready. Now complete the Master Resume Canvas on the right, then launch Applix when you are ready.";
  }

  const questions: Record<string, string> = {
    targetRole: "What work do you want Applix to hunt for?",
    companyType: "What kind of companies should Applix look for?",
    targetArea: "Which city, suburb, or area should Applix focus on?",
    plan: "Choose your pace: 10 applications per day or 100 applications per day?",
    aiConsent: "Do you consent to AI draft support while your Master Resume facts stay locked?",
    emailConsent: "Do you consent to Applix asking for Gmail access later, only to send emails you approve?",
  };

  return questions[first] || "Tell me the next campaign detail for your Applix setup.";
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ChatPayload;
    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const setup = body.setup || {};

    if (!apiKey) {
      return NextResponse.json({
        ok: true,
        source: "fallback",
        assistantMessage: fallbackAssistantMessage(setup),
        updates: {},
        missingFields: fallbackMissing(setup),
        readyToLaunch: fallbackMissing(setup).length === 0,
        warning: "OPENAI_API_KEY is missing. Using local fallback.",
      });
    }

    const systemPrompt = `You are Applix, a job-hunt symbiote from ASSI.
Talk naturally like ChatGPT, but stay focused on building a job outreach campaign.
The user can answer in any order, ask questions, or provide multiple campaign details at once.

Important product rule:
The user fills their resume in the Master Resume Canvas on the page.
Do NOT ask for phone number, resume summary, skills, experience, certificates, or other resume fields in chat.
If resume details are missing, tell the user to complete the Master Resume Canvas on the right.

Your chat job:
1. Extract campaign details from the latest message.
2. Ask only for missing campaign details: target role, company type, area, pace, and consent.
3. Keep replies brief and conversational.
4. Never force a numbered form.
5. Never invent resume facts.
6. Never promise automatic sending. Always approval first.
7. If campaign target is ready, say: complete the Master Resume Canvas on the right, then launch Applix.

Campaign fields:
- targetRole
- companyType
- targetArea
- radiusKm
- plan: gentle means 10/day, full means 100/day
- aiConsent
- emailConsent

Resume canvas fields may be present in currentSetup, but you should not ask for them in chat:
- fullName
- email
- phone
- resumeSummary
- skills
- experience
- certificates

You must respond with valid JSON only. The JSON object must have this shape:
{
  "assistantMessage": "natural chat reply",
  "updates": {
    "targetRole": "",
    "companyType": "",
    "targetArea": "",
    "radiusKm": null,
    "plan": "gentle or full",
    "aiConsent": null,
    "emailConsent": null
  },
  "missingFields": ["campaign field names still missing"],
  "readyToLaunch": false,
  "confidence": 0.0
}
Only include updates that are clearly supported by the user message or existing setup.`;

    const recentHistory = (body.history || []).slice(-10).map((message) => ({
      role: message.role === "user" ? "user" : "assistant",
      content: message.text,
    }));

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          ...recentHistory,
          {
            role: "user",
            content: JSON.stringify({
              latestUserMessage: body.userMessage,
              currentSetup: setup,
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
        assistantMessage: fallbackAssistantMessage(setup),
        updates: {},
        missingFields: fallbackMissing(setup),
        readyToLaunch: fallbackMissing(setup).length === 0,
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
        assistantMessage: fallbackAssistantMessage(setup),
        updates: {},
        missingFields: fallbackMissing(setup),
        readyToLaunch: fallbackMissing(setup).length === 0,
        warning: "OpenAI returned non-JSON content. Used fallback.",
        openaiPreview: content.slice(0, 300),
      });
    }

    return NextResponse.json({
      ok: true,
      source: "openai",
      assistantMessage: parsed.assistantMessage || fallbackAssistantMessage(setup),
      updates: parsed.updates || {},
      missingFields: Array.isArray(parsed.missingFields) ? parsed.missingFields : fallbackMissing(setup),
      readyToLaunch: Boolean(parsed.readyToLaunch),
      confidence: Number(parsed.confidence || 0),
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "Applix chat route failed" }, { status: 500 });
  }
}
