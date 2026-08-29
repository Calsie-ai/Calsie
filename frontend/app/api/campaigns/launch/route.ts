import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const scraperUrl = process.env.RENDER_SCRAPER_URL;

export async function POST(request: NextRequest) {
  try {
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: "Missing Supabase server environment variables." }, { status: 500 });
    }

    const body = await request.json();
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const requiredFields = ["targetRole", "industry", "selectedAddress", "latitude", "longitude", "radiusKm"];
    for (const field of requiredFields) {
      if (body[field] === undefined || body[field] === null || body[field] === "") {
        return NextResponse.json({ error: `${field} is required.` }, { status: 400 });
      }
    }

    const campaignPayload = {
      user_id: body.userId || null,
      status: "queued",
      target_role: body.targetRole,
      industry: body.industry,
      selected_address: body.selectedAddress,
      google_place_id: body.placeId || null,
      latitude: body.latitude,
      longitude: body.longitude,
      radius_km: body.radiusKm,
      resume_source: body.resumeSource || "applix_profile",
      uploaded_resume_name: body.resumeName || null,
      daily_limit: body.dailyLimit || 25,
      campaign_days: body.campaignDays || 30,
      total_target: (body.dailyLimit || 25) * (body.campaignDays || 30),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: campaign, error } = await supabase
      .from("campaigns")
      .insert(campaignPayload)
      .select("id,status,target_role,industry,selected_address,radius_km,daily_limit,campaign_days,total_target")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (scraperUrl) {
      fetch(`${scraperUrl.replace(/\/$/, "")}/scrape-campaign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaign_id: campaign.id, ...campaignPayload }),
      }).catch(() => undefined);
    }

    return NextResponse.json({ campaign, queued: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Could not launch campaign." }, { status: 500 });
  }
}
