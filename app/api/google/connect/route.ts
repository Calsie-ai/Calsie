import { google } from "googleapis";
import { NextResponse } from "next/server";

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

export async function GET() {
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/gmail.send"],
    prompt: "consent",
  });

  return NextResponse.redirect(url);
}
