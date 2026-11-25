import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getGoogleAuthUrl } from "@/lib/calendar";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_SITE_URL!));
  }

  // Get tutor ID
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 400 });
  }

  const { data: tutor } = await supabase
    .from("tutors")
    .select("id")
    .eq("profile_id", profile.id)
    .single();

  if (!tutor) {
    return NextResponse.json({ error: "Tutor not found" }, { status: 400 });
  }

  const authUrl = getGoogleAuthUrl(tutor.id);
  return NextResponse.redirect(authUrl);
}
