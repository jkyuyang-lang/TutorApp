import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

// POST /api/auth/ensure-profile — find or create profile for the authenticated user
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email_confirmed_at) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const admin = createServiceClient();

  // Check if profile already exists (using service role to bypass RLS)
  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (existing) {
    // Load learners too
    const { data: learners } = await admin
      .from("learners")
      .select("id, full_name, is_self")
      .eq("account_holder_id", existing.id);

    return NextResponse.json({
      profile_id: existing.id,
      learners: learners ?? [],
    });
  }

  // Create profile
  const fullName = user.user_metadata?.full_name || "New User";
  const phone = user.user_metadata?.phone || null;
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";

  const { data: newProfile, error: insertErr } = await admin
    .from("profiles")
    .insert({
      user_id: user.id,
      role: "client",
      full_name: fullName,
      phone,
      time_zone: timeZone,
    })
    .select("id")
    .single();

  if (insertErr) {
    // Race condition — profile was created between check and insert
    if (insertErr.code === "23505") {
      const { data: raceProfile } = await admin
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (raceProfile) {
        return NextResponse.json({
          profile_id: raceProfile.id,
          learners: [],
        });
      }
    }
    console.error("[ensure-profile] insert error:", insertErr);
    return NextResponse.json({ error: "Failed to create profile" }, { status: 500 });
  }

  return NextResponse.json({
    profile_id: newProfile.id,
    learners: [],
  });
}
