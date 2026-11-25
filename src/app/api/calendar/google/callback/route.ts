import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { exchangeCodeForTokens } from "@/lib/calendar";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const tutorId = req.nextUrl.searchParams.get("state");

  if (!code || !tutorId) {
    return NextResponse.redirect(
      new URL("/calendar?error=missing_params", process.env.NEXT_PUBLIC_SITE_URL!)
    );
  }

  try {
    const tokens = await exchangeCodeForTokens(code);

    const supabase = createServiceClient();
    await supabase
      .from("tutors")
      .update({
        calendar_provider: "google",
        calendar_tokens: tokens as unknown as Record<string, unknown>,
        calendar_id: "primary",
      })
      .eq("id", tutorId);

    return NextResponse.redirect(
      new URL("/calendar?calendar=connected", process.env.NEXT_PUBLIC_SITE_URL!)
    );
  } catch (err) {
    console.error("Google Calendar OAuth error:", err);
    return NextResponse.redirect(
      new URL("/calendar?error=oauth_failed", process.env.NEXT_PUBLIC_SITE_URL!)
    );
  }
}
