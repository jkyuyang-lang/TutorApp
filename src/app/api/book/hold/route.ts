import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const {
    tutor_id,
    learner_id,
    subject_id,
    tutor_subject_id,
    starts_at,
    ends_at,
    format,
    focus_notes,
  } = body;

  if (!tutor_id || !learner_id || !subject_id || !starts_at || !ends_at) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Get the booker's profile (use service client to bypass RLS for new users)
  const admin = createServiceClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 400 });
  }

  // Verify the learner belongs to this user
  const { data: learner } = await admin
    .from("learners")
    .select("id")
    .eq("id", learner_id)
    .eq("account_holder_id", profile.id)
    .single();

  if (!learner) {
    return NextResponse.json({ error: "Learner not found" }, { status: 400 });
  }

  // Check if client is blocked by this tutor
  const { data: tcRecord } = await admin
    .from("tutor_clients")
    .select("status")
    .eq("tutor_id", tutor_id)
    .eq("account_holder_id", profile.id)
    .single();

  if (tcRecord?.status === "blocked") {
    return NextResponse.json(
      { error: "You are unable to book with this tutor." },
      { status: 403 }
    );
  }

  // Clean up expired holds for this tutor before inserting
  await admin
    .from("lessons")
    .update({ status: "canceled" })
    .eq("tutor_id", tutor_id)
    .eq("status", "held")
    .lt("hold_expires_at", new Date().toISOString());

  // Hold expires in 10 minutes
  const holdExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  // Get tutor meeting link
  const { data: tutor } = await admin
    .from("tutors")
    .select("meeting_link")
    .eq("id", tutor_id)
    .single();

  // Insert lesson with held status — exclusion constraint prevents double-booking
  const { data: lesson, error } = await admin
    .from("lessons")
    .insert({
      tutor_id,
      learner_id,
      booked_by: profile.id,
      subject_id,
      tutor_subject_id: tutor_subject_id || null,
      starts_at,
      ends_at,
      format: format || "online",
      status: "held",
      hold_expires_at: holdExpiresAt,
      focus_notes: focus_notes || null,
      meeting_link: tutor?.meeting_link || null,
    })
    .select("id")
    .single();

  if (error) {
    // exclusion constraint violation = double booking
    if (error.code === "23P01") {
      return NextResponse.json(
        { error: "This time slot is no longer available. Please choose another." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ lesson_id: lesson.id, hold_expires_at: holdExpiresAt });
}
