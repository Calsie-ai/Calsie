import { NextResponse } from "next/server";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://bnshgtrqbfuphhhdgccs.supabase.co";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const accessToken = body.access_token;
    const returnTo = body.return_to;

    if (!accessToken) {
      return NextResponse.json({ ok: false, error: "Missing access token. Please sign in again." }, { status: 401 });
    }

    const response = await fetch(`${SUPABASE_URL}/functions/v1/connect-gmail`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`,
        ...(SUPABASE_ANON_KEY ? { "apikey": SUPABASE_ANON_KEY } : {}),
      },
      body: JSON.stringify({ return_to: returnTo }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return NextResponse.json({ ok: false, error: data.error || `Connect Gmail failed with ${response.status}`, details: data }, { status: response.status });
    }

    return NextResponse.json({ ok: true, ...data });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not connect Gmail." }, { status: 500 });
  }
}
