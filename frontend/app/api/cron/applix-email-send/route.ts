import { NextResponse } from "next/server";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "https://bnshgtrqbfuphhhdgccs.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const CRON_SECRET = process.env.CRON_SECRET || "";

function isAuthorized(req: Request) {
  if (!CRON_SECRET) return true;
  const authHeader = req.headers.get("authorization") || "";
  return authHeader === `Bearer ${CRON_SECRET}`;
}

export async function GET(req: Request) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ ok: false, error: "Unauthorized cron request." }, { status: 401 });
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ ok: false, error: "Missing Supabase service configuration." }, { status: 500 });
    }

    const response = await fetch(`${SUPABASE_URL}/functions/v1/applix-agent-email-scheduler`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: SUPABASE_SERVICE_ROLE_KEY,
      },
      body: JSON.stringify({
        test_recipient_email: "hostsajan@gmail.com",
        agent_days: 10,
        daily_limit: 100,
        hourly_limit: 4,
      }),
    });

    const data = await response.json().catch(() => ({}));
    return NextResponse.json({
      ok: response.ok && data?.ok !== false,
      bridge: "applix-email-send",
      scheduler_status: response.status,
      scheduler: data,
    }, { status: response.ok ? 200 : response.status });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      bridge: "applix-email-send",
      error: error instanceof Error ? error.message : "Cron bridge failed.",
    }, { status: 500 });
  }
}
