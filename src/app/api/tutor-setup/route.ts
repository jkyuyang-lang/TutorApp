import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  try {
    const { token, password } = await req.json();

    if (!token || !password) {
      return NextResponse.json({ error: "Token and password are required" }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Look up application by invite token
    const { data: app } = await supabase
      .from("tutor_applications")
      .select("*")
      .eq("invite_token", token)
      .eq("status", "approved")
      .single();

    if (!app) {
      return NextResponse.json({ error: "Invalid or expired invitation link" }, { status: 404 });
    }

    // Check if account already created
    const { data: existingUser } = await supabase.auth.admin.listUsers();
    const alreadyExists = existingUser?.users?.find((u) => u.email === app.email);
    if (alreadyExists) {
      return NextResponse.json({ error: "An account with this email already exists. Please log in instead." }, { status: 409 });
    }

    // Create auth user
    const fullName = `${app.first_name} ${app.last_name}`;
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: app.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (authError || !authData.user) {
      return NextResponse.json({ error: authError?.message || "Failed to create account" }, { status: 500 });
    }

    // Create profile
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .insert({
        user_id: authData.user.id,
        role: "tutor",
        full_name: fullName,
        phone: app.phone,
        time_zone: "America/New_York",
      })
      .select("id")
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: "Failed to create profile" }, { status: 500 });
    }

    // Generate slug from name
    const slug = fullName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    // Create tutor record
    const { error: tutorError } = await supabase
      .from("tutors")
      .insert({
        profile_id: profile.id,
        bio: app.why_good_fit || null,
        education: app.college,
        credentials: app.degree_level,
        slug,
        buffer_minutes: 10,
        min_notice_hours: 12,
        booking_window_days: 60,
      });

    if (tutorError) {
      return NextResponse.json({ error: "Failed to create tutor record" }, { status: 500 });
    }

    // Mark application as completed
    await supabase
      .from("tutor_applications")
      .update({ status: "onboarded", updated_at: new Date().toISOString() })
      .eq("id", app.id);

    return NextResponse.json({ success: true, email: app.email });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
