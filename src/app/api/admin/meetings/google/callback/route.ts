import { NextRequest, NextResponse } from "next/server";
import { requireSuperadmin } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/admin";
import { google } from "googleapis";

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_SITE_URL}/api/admin/meetings/google/callback`
  );
}

export async function GET(req: NextRequest) {
  const auth = await requireSuperadmin();
  if (!auth) {
    return NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_SITE_URL!));
  }

  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(
      new URL("/admin/settings?error=missing_code", process.env.NEXT_PUBLIC_SITE_URL!)
    );
  }

  try {
    const client = getOAuth2Client();
    const { tokens } = await client.getToken(code);

    console.log("Google OAuth tokens received, scopes:", tokens.scope);

    // Get the email of the connected account
    client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: "v2", auth: client });
    const { data: userInfo } = await oauth2.userinfo.get();

    const supabase = createServiceClient();

    // Store tokens in app_settings
    const { error: upsertError } = await supabase.from("app_settings").upsert({
      key: "google_meet_credentials",
      value: {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expiry_date: tokens.expiry_date ?? Date.now() + 3600 * 1000,
        email: userInfo.email,
        scope: tokens.scope,
      },
      updated_by: auth.profile.id,
    });

    if (upsertError) {
      console.error("Failed to save Google Meet credentials:", upsertError);
      return NextResponse.redirect(
        new URL("/admin/settings?error=save_failed", process.env.NEXT_PUBLIC_SITE_URL!)
      );
    }

    return NextResponse.redirect(
      new URL("/admin/settings?meet=connected", process.env.NEXT_PUBLIC_SITE_URL!)
    );
  } catch (err) {
    console.error("Google Meet OAuth error:", err);
    return NextResponse.redirect(
      new URL("/admin/settings?error=oauth_failed", process.env.NEXT_PUBLIC_SITE_URL!)
    );
  }
}
