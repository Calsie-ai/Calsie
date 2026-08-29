import { google } from "googleapis";
import { NextResponse } from "next/server";

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

export async function GET() {
  const missing = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI"].filter((name) => !process.env[name]);

  if (missing.length) {
    return NextResponse.json({ error: `Missing Google OAuth env vars: ${missing.join(", ")}` }, { status: 500 });
  }

  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/gmail.compose"],
    prompt: "consent",
  });

  return NextResponse.redirect(url);
}
