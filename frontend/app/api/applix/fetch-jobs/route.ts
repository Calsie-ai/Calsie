import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json({
    ok: false,
    error: "Real job fetching is wired to the dashboard, but the provider route still needs the job API key and save logic added.",
  }, { status: 501 });
}
