import { NextResponse } from "next/server";

export const runtime = "nodejs";

const DECISION_URL = "https://bnshgtrqbfuphhhdgccs.supabase.co/functions/v1/calsie-agent-decision";

export async function POST(req: Request) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return NextResponse.json({ ok: false, error: "Please sign in again." }, { status: 401 });
  try {
    const response = await fetch(DECISION_URL, {
      method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: await req.text(), cache: "no-store",
    });
    const result = await response.json().catch(() => ({ ok: false, error: "Decision service returned an invalid response." }));
    return NextResponse.json(result, { status: response.status, headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "Decision service is temporarily unavailable." }, { status: 502 });
  }
}
