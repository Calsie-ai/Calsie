import { NextResponse } from "next/server";

// Authorization must begin with an authenticated, consent-bearing POST.
export async function GET() {
  return NextResponse.json({ error: "Open Gmail connection in your Calsie dashboard." }, { status: 410, headers: { "Cache-Control": "no-store" } });
}
