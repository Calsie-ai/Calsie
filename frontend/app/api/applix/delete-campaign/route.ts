import { NextResponse } from "next/server";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://bnshgtrqbfuphhhdgccs.supabase.co";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

type DeleteCampaignBody = {
  access_token?: string;
  campaign_id?: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as DeleteCampaignBody;
    const accessToken = body.access_token;
    const campaignId = body.campaign_id;

    if (!accessToken) {
      return NextResponse.json({ ok: false, error: "Missing access token. Please sign in again." }, { status: 401 });
    }

    if (!campaignId) {
      return NextResponse.json({ ok: false, error: "Missing campaign_id." }, { status: 400 });
    }

    if (!SUPABASE_ANON_KEY) {
      return NextResponse.json({ ok: false, error: "Missing NEXT_PUBLIC_SUPABASE_ANON_KEY." }, { status: 500 });
    }

    const response = await fetch(`${SUPABASE_URL}/rest/v1/campaigns?id=eq.${encodeURIComponent(campaignId)}`, {
      method: "DELETE",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "apikey": SUPABASE_ANON_KEY,
        "Prefer": "return=representation",
      },
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      return NextResponse.json({ ok: false, error: "Could not delete campaign.", details: data }, { status: response.status });
    }

    const deletedCampaign = Array.isArray(data) ? data[0] : data;

    if (!deletedCampaign) {
      return NextResponse.json({ ok: false, error: "Campaign was not found or you do not have permission to delete it." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, campaign: deletedCampaign });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not delete campaign." }, { status: 500 });
  }
}
