import { NextResponse } from "next/server";

export async function GET() {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  if (!apiKey) {
    return NextResponse.json({
      ok: false,
      reason: "OPENAI_API_KEY is missing at runtime",
      hasKey: false,
      model,
    });
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "Reply with exactly OK." },
          { role: "user", content: "test" },
        ],
        max_tokens: 5,
        temperature: 0,
      }),
    });

    const text = await response.text();

    return NextResponse.json({
      ok: response.ok,
      hasKey: true,
      model,
      status: response.status,
      statusText: response.statusText,
      openaiReplyPreview: text.slice(0, 500),
    });
  } catch (error: any) {
    return NextResponse.json({
      ok: false,
      hasKey: true,
      model,
      reason: error?.message || "OpenAI request failed",
    });
  }
}
