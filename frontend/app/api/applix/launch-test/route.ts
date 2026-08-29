import { NextResponse } from "next/server";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://bnshgtrqbfuphhhdgccs.supabase.co";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const accessToken = body.access_token;
    const campaignId = body.campaign_id;
    const batchSize = Math.max(1, Math.min(10, Number(body.batch_size || 10)));

    if (!accessToken) {
      return NextResponse.json({ ok: false, error: "Missing access token. Please sign in again." }, { status: 401 });
    }

    if (!campaignId) {
      return NextResponse.json({ ok: false, error: "Missing campaign_id." }, { status: 400 });
    }

    const response = await fetch(`${SUPABASE_URL}/functions/v1/launch-applix-test`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`,
        ...(SUPABASE_ANON_KEY ? { "apikey": SUPABASE_ANON_KEY } : {}),
      },
      body: JSON.stringify({
        campaign_id: campaignId,
        target_email_count: batchSize,
        user_identifier: body.user_identifier,
      }),
    });

    const data = await response.json().catch(() => ({}));

    return NextResponse.json({
      ok: Boolean(response.ok && data.ok),
      message: response.ok && data.ok ? "Launch test finished." : "Launch test finished with issues.",
      result: data,
    }, { status: response.ok ? 200 : response.status });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Could not launch Applix test.",
    }, { status: 500 });
  }
}
