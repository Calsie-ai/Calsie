import { NextResponse } from "next/server";

export const runtime = "nodejs";

type ParsedResume = {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  resumeSummary: string;
  skills: string;
  experience: string;
  certificates: string;
};

function emptyParsedResume(): ParsedResume {
  return {
    fullName: "",
    email: "",
    phone: "",
    location: "",
    resumeSummary: "",
    skills: "",
    experience: "",
    certificates: "",
  };
}

function extractBasic(text: string): ParsedResume {
  const parsed = emptyParsedResume();
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  parsed.fullName = lines[0] || "";
  parsed.email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || "";
  parsed.phone = text.match(/(?:\+?61|0)\s?4\d{2}\s?\d{3}\s?\d{3}|\+?\d[\d\s().-]{7,}\d/)?.[0] || "";
  parsed.resumeSummary = lines.slice(0, 6).join(" ").slice(0, 700);
  return parsed;
}

function cleanJson(text: string) {
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

async function extractPdfText(buffer: Buffer) {
  const pdfModule: any = await import("pdf-parse");

  if (typeof pdfModule.default === "function") {
    const data = await pdfModule.default(buffer);
    return data.text || "";
  }

  if (typeof pdfModule === "function") {
    const data = await pdfModule(buffer);
    return data.text || "";
  }

  if (typeof pdfModule.PDFParse === "function") {
    const parser = new pdfModule.PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return result.text || "";
    } finally {
      if (typeof parser.destroy === "function") await parser.destroy();
    }
  }

  throw new Error("PDF parser could not read this file. Try DOCX or TXT, or upload a text-based PDF.");
}

async function extractText(file: File) {
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();

  if (type.includes("pdf") || name.endsWith(".pdf")) {
    return extractPdfText(buffer);
  }

  if (name.endsWith(".docx") || type.includes("wordprocessingml")) {
    const mammoth = await import("mammoth");
    const data = await mammoth.extractRawText({ buffer });
    return data.value || "";
  }

  if (name.endsWith(".txt") || type.includes("text")) {
    return buffer.toString("utf8");
  }

  throw new Error("Unsupported file type. Upload PDF, DOCX, or TXT for now.");
}

async function parseWithOpenAI(rawText: string): Promise<ParsedResume> {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const fallback = extractBasic(rawText);

  if (!apiKey) return fallback;

  const systemPrompt = `You parse resume text into a clean master resume canvas.
Do not invent facts. Only use information present in the resume text.
Return valid JSON only with this exact shape:
{
  "fullName": "",
  "email": "",
  "phone": "",
  "location": "",
  "resumeSummary": "",
  "skills": "",
  "experience": "",
  "certificates": ""
}
Keep experience resume-like with company/role/date/bullets when possible.
For certificates, include certificate names, checks, licences, clearances, or training modules. If none found, return empty string.`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: rawText.slice(0, 30000) },
      ],
    }),
  });

  if (!response.ok) return fallback;

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content || "";
  const parsed = cleanJson(content);
  if (!parsed) return fallback;

  return {
    fullName: String(parsed.fullName || fallback.fullName || ""),
    email: String(parsed.email || fallback.email || ""),
    phone: String(parsed.phone || fallback.phone || ""),
    location: String(parsed.location || ""),
    resumeSummary: String(parsed.resumeSummary || fallback.resumeSummary || ""),
    skills: String(parsed.skills || ""),
    experience: String(parsed.experience || ""),
    certificates: String(parsed.certificates || ""),
  };
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("resume");

    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "Upload a resume file." }, { status: 400 });
    }

    if (file.size > 8 * 1024 * 1024) {
      return NextResponse.json({ ok: false, error: "Resume file is too large. Please upload under 8MB." }, { status: 400 });
    }

    const rawText = await extractText(file);
    if (!rawText.trim()) {
      return NextResponse.json({ ok: false, error: "Could not read text from this resume. Try DOCX, TXT, or a text-based PDF." }, { status: 400 });
    }

    const parsed = await parseWithOpenAI(rawText);

    return NextResponse.json({
      ok: true,
      filename: file.name,
      textLength: rawText.length,
      parsed,
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "Resume parsing failed." }, { status: 500 });
  }
}
