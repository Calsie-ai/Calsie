import { google } from "googleapis";
import { NextRequest, NextResponse } from "next/server";

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");

  if (!code) {
    return NextResponse.json({ error: "No code received from Google" }, { status: 400 });
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);

    return NextResponse.json({
      success: true,
      message: "Gmail connected successfully.",
      has_access_token: Boolean(tokens.access_token),
      has_refresh_token: Boolean(tokens.refresh_token),
      tokens,
    });
  } catch (error) {
    console.error("Google callback error:", error);

    return NextResponse.json(
      { error: "Failed to connect Gmail" },
      { status: 500 }
    );
  }
}
