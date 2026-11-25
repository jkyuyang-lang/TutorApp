import { NextResponse } from "next/server";
import { requireSuperadmin } from "@/lib/admin";
import { google } from "googleapis";

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_SITE_URL}/api/admin/meetings/google/callback`
  );
}

export async function GET() {
  const auth = await requireSuperadmin();
  if (!auth) {
    return NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_SITE_URL!));
  }

  const client = getOAuth2Client();
  const authUrl = client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/userinfo.email",
    ],
    include_granted_scopes: true,
    state: "admin_meet_connect",
  });

  return NextResponse.redirect(authUrl);
}
