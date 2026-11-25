import { createClient } from "@/lib/supabase/server";
import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") || "";

  const supabase = await createClient();

  let authenticated = false;

  // Handle OAuth / PKCE code exchange
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      authenticated = true;
    } else {
      // If code exchange fails (e.g. PKCE verifier missing because email link
      // opened in a different browser), the email was still verified by Supabase
      // server-side. Redirect to login with a success message.
      return NextResponse.redirect(`${origin}/login?verified=true`);
    }
  }

  // Handle email OTP / token_hash verification (email confirmation links)
  if (!authenticated && token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      authenticated = true;
    }
  }

  if (!authenticated) {
    return NextResponse.redirect(`${origin}/login?error=auth`);
  }

  // Check if user has a profile (completed onboarding)
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("user_id", user.id)
      .single();

    if (profile) {
      // Already onboarded — go to final destination based on role
      if (next) {
        return NextResponse.redirect(`${origin}${next}`);
      }
      if (profile.role === "tutor" || profile.role === "superadmin") {
        return NextResponse.redirect(`${origin}/dashboard`);
      }
      return NextResponse.redirect(`${origin}/lessons`);
    }
  }

  // New user — go to onboarding, passing the final redirect
  const onboardingUrl = new URL("/onboarding", origin);
  if (next) onboardingUrl.searchParams.set("redirect", next);
  return NextResponse.redirect(onboardingUrl.toString());
}
