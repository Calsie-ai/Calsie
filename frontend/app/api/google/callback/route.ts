import { createClient } from "@supabase/supabase-js";
import { google } from "googleapis";
import { NextRequest, NextResponse } from "next/server";

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY || process.env.APPLIX_SERVICE_ROLE_KEY;

function html(message: string, detail: string, status = 200) {
  return new NextResponse(
    `<!doctype html><html><body style="font-family: system-ui; padding: 32px;"><h2>${message}</h2><p>${detail}</p></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } }
  );
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");

  if (!code) {
    return NextResponse.json({ error: "No code received from Google" }, { status: 400 });
  }

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Missing Supabase server configuration" }, { status: 500 });
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const profile = await oauth2.userinfo.get();
    const gmailEmail = profile.data.email;
    const userId = state || gmailEmail;

    if (!gmailEmail || !userId) {
      return NextResponse.json({ error: "Could not identify Gmail user" }, { status: 400 });
    }

    if (!tokens.refresh_token) {
      return NextResponse.json(
        {
          error: "No refresh token received. Reconnect Gmail with prompt=consent and access_type=offline.",
          gmail_email: gmailEmail,
          has_access_token: Boolean(tokens.access_token),
          has_refresh_token: false,
        },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    const { error } = await supabase.from("gmail_connections").upsert(
      {
        user_id: userId,
        user_identifier: userId,
        gmail_email: gmailEmail,
        google_email: gmailEmail,
        access_token: tokens.access_token || null,
        refresh_token: tokens.refresh_token,
        expires_at: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
        expiry_date: tokens.expiry_date || null,
        scope: tokens.scope || null,
        token_type: tokens.token_type || null,
        status: "connected",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    if (error) {
      console.error("Failed to save Gmail connection:", error);
      return NextResponse.json({ error: "Gmail connected but save failed", details: error.message }, { status: 500 });
    }

    return html("Gmail connected successfully.", "You can close this tab and return to Applix.");
  } catch (error) {
    console.error("Google callback error:", error);
    return NextResponse.json({ error: "Failed to connect Gmail" }, { status: 500 });
  }
}
