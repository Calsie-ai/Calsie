import { NextResponse } from "next/server";

type ResumePayload = {
  job?: any;
  profile?: any;
};

const DEFAULT_MODEL = "gpt-4.1-mini";

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "Missing OPENAI_API_KEY in Vercel environment variables." },
      { status: 500 }
    );
  }

  let payload: ResumePayload;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const job = payload.job || {};
  const profile = payload.profile || {};

  const prompt = `Create a tailored Australian job application kit.

Return ONLY valid JSON with this exact shape:
{
  "summary": "short resume profile summary",
  "skills": ["skill 1", "skill 2"],
  "bullets": ["experience bullet 1", "experience bullet 2", "experience bullet 3"],
  "coverNote": "short email style cover note"
}

Rules:
- Use the candidate profile as source truth.
- Tailor wording to the job ad.
- Do not invent licences, certificates, degrees, employers, dates, or names.
- Keep it concise and ATS-friendly.
- Australian English.

Candidate profile:
${JSON.stringify(profile, null, 2)}

Job ad:
${JSON.stringify(job, null, 2)}`;

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
        input: prompt,
        temperature: 0.3,
        max_output_tokens: 900,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { ok: false, error: data?.error?.message || "OpenAI request failed." },
        { status: 500 }
      );
    }

    const outputText = extractOutputText(data);
    const draft = parseJsonDraft(outputText);

    return NextResponse.json({ ok: true, draft, model: process.env.OPENAI_MODEL || DEFAULT_MODEL });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Could not generate resume draft." },
      { status: 500 }
    );
  }
}

function extractOutputText(data: any) {
  if (typeof data.output_text === "string") return data.output_text;

  const chunks = data.output || [];
  const textParts: string[] = [];

  for (const item of chunks) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) textParts.push(content.text);
      if (content.type === "text" && content.text) textParts.push(content.text);
    }
  }

  return textParts.join("\n");
}

function parseJsonDraft(text: string) {
  const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
  const parsed = JSON.parse(cleaned);

  return {
    summary: String(parsed.summary || ""),
    skills: Array.isArray(parsed.skills) ? parsed.skills.map(String).slice(0, 10) : [],
    bullets: Array.isArray(parsed.bullets) ? parsed.bullets.map(String).slice(0, 6) : [],
    coverNote: String(parsed.coverNote || ""),
  };
}
