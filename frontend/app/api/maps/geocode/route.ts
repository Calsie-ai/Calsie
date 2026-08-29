import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address")?.trim();
  const key = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!address) {
    return NextResponse.json({ error: "Address is required" }, { status: 400 });
  }

  if (!key) {
    return NextResponse.json({ error: "Missing GOOGLE_MAPS_API_KEY" }, { status: 500 });
  }

  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", address);
  url.searchParams.set("key", key);

  const response = await fetch(url.toString(), { cache: "no-store" });
  const payload = await response.json();
  const result = payload.results?.[0];

  if (!result) {
    return NextResponse.json({ error: "No location found" }, { status: 404 });
  }

  return NextResponse.json({
    selectedAddress: result.formatted_address,
    placeId: result.place_id,
    latitude: result.geometry.location.lat,
    longitude: result.geometry.location.lng,
    raw: result,
  });
}
