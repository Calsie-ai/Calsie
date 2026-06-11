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

    const launchPlan = {
      test_mode: true,
      real_recipients: false,
      test_email_pattern: "sajan3310giri+applix{{number}}@gmail.com",
      subject_prefix: "[APPLIX TEST #{{number}}]",
      batch_size: batchSize,
    };

    const response = await fetch(`${SUPABASE_URL}/functions/v1/generate-outreach-drafts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`,
        ...(SUPABASE_ANON_KEY ? { "apikey": SUPABASE_ANON_KEY } : {}),
      },
      body: JSON.stringify({
        campaign_id: campaignId,
        limit: batchSize,
        dry_run: false,
        min_lead_score: 0,
        test_mode: true,
        real_recipients: false,
        test_email_base: "sajan3310giri",
        test_email_domain: "gmail.com",
        test_alias_prefix: "applix",
        subject_prefix: "[APPLIX TEST #{{number}}]",
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return NextResponse.json({
        ok: false,
        error: data.error || `Launch test failed with ${response.status}`,
        details: data,
        launch_plan: launchPlan,
      }, { status: response.status });
    }

    return NextResponse.json({
      ok: true,
      message: `Launch test created for ${batchSize} emails. Real recipients are OFF.`,
      launch_plan: launchPlan,
      result: data,
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Could not launch Applix test.",
    }, { status: 500 });
  }
}
