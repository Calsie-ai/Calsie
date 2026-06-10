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

function getLines(text: string) {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function findBlock(lines: string[], names: string[]) {
  const lowerNames = names.map((name) => name.toLowerCase());
  const stopNames = ["profile", "summary", "skills", "experience", "employment", "education", "certificates", "certifications", "checks", "training", "referees", "references"];
  const start = lines.findIndex((line) => lowerNames.includes(line.toLowerCase().replace(/:$/, "")));
  if (start < 0) return "";
  const collected: string[] = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const clean = lines[index].toLowerCase().replace(/:$/, "");
    if (stopNames.includes(clean)) break;
    collected.push(lines[index]);
  }
  return collected.join("\n").slice(0, 3000);
}

function extractBasic(text: string): ParsedResume {
  const parsed = emptyParsedResume();
  const lines = getLines(text);
  parsed.fullName = lines.find((line) => !line.includes("@") && !/\d/.test(line) && line.length > 2 && line.length < 60) || "";
  parsed.email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || "";
  parsed.phone = text.match(/(?:\+?61|0)\s?4\d{2}\s?\d{3}\s?\d{3}|\+?\d[\d\s().-]{7,}\d/)?.[0] || "";
  parsed.resumeSummary = findBlock(lines, ["profile", "summary", "professional summary", "objective"]) || lines.slice(0, 8).join(" ").slice(0, 900);
  parsed.skills = findBlock(lines, ["skills", "key skills", "technical skills", "core skills"]);
  parsed.experience = findBlock(lines, ["experience", "work experience", "employment", "employment history", "work history"]);
  parsed.certificates = findBlock(lines, ["certificates", "certifications", "checks", "training"]);
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
  try {
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
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes("dommatrix")) {
      throw new Error("This PDF parser needs DOMMatrix and failed in the server runtime. For this MVP test, upload DOCX or TXT, or copy the resume text into the editable Master Resume fields.");
    }
    throw error;
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

function mergeParsed(aiParsed: any, fallback: ParsedResume): ParsedResume {
  return {
    fullName: String(aiParsed?.fullName || fallback.fullName || ""),
    email: String(aiParsed?.email || fallback.email || ""),
    phone: String(aiParsed?.phone || fallback.phone || ""),
    location: String(aiParsed?.location || fallback.location || ""),
    resumeSummary: String(aiParsed?.resumeSummary || fallback.resumeSummary || ""),
    skills: String(aiParsed?.skills || fallback.skills || ""),
    experience: String(aiParsed?.experience || fallback.experience || ""),
    certificates: String(aiParsed?.certificates || fallback.certificates || ""),
  };
}

function countFilled(parsed: ParsedResume) {
  return Object.values(parsed).filter((value) => String(value || "").trim()).length;
}

async function parseWithOpenAI(rawText: string): Promise<{ parsed: ParsedResume; usedOpenAI: boolean; openAIError: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const fallback = extractBasic(rawText);

  if (!apiKey) return { parsed: fallback, usedOpenAI: false, openAIError: "OPENAI_API_KEY missing" };

  const systemPrompt = `You parse resume text into a clean master resume canvas. Do not invent facts. Return valid JSON only with: fullName, email, phone, location, resumeSummary, skills, experience, certificates.`;

  try {
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

    if (!response.ok) return { parsed: fallback, usedOpenAI: false, openAIError: await response.text() };

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content || "";
    const aiParsed = cleanJson(content);
    if (!aiParsed) return { parsed: fallback, usedOpenAI: false, openAIError: "OpenAI returned non-JSON" };

    return { parsed: mergeParsed(aiParsed, fallback), usedOpenAI: true, openAIError: "" };
  } catch (error: any) {
    return { parsed: fallback, usedOpenAI: false, openAIError: error?.message || "OpenAI parse failed" };
  }
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

    const result = await parseWithOpenAI(rawText);

    return NextResponse.json({
      ok: true,
      filename: file.name,
      textLength: rawText.length,
      textPreview: rawText.slice(0, 700),
      usedOpenAI: result.usedOpenAI,
      openAIError: result.openAIError,
      filledCount: countFilled(result.parsed),
      parsed: result.parsed,
      rawText,
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "Resume parsing failed." }, { status: 500 });
  }
}
