import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { lesson_id } = await req.json();
  if (!lesson_id) {
    return NextResponse.json({ error: "Missing lesson_id" }, { status: 400 });
  }

  // Get booker's profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 400 });
  }

  // Fetch the held lesson — must be owned by this user and still held
  const { data: lesson, error: fetchError } = await supabase
    .from("lessons")
    .select("id, status, hold_expires_at, tutor_id")
    .eq("id", lesson_id)
    .eq("booked_by", profile.id)
    .single();

  if (fetchError || !lesson) {
    return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
  }

  if (lesson.status !== "held") {
    return NextResponse.json({ error: "Lesson is not in held status" }, { status: 400 });
  }

  // Check if hold has expired
  if (lesson.hold_expires_at && new Date(lesson.hold_expires_at) < new Date()) {
    // Release the expired hold
    await supabase
      .from("lessons")
      .update({ status: "canceled", cancel_reason: "Hold expired" })
      .eq("id", lesson_id);
    return NextResponse.json(
      { error: "Your hold has expired. Please start a new booking." },
      { status: 410 }
    );
  }

  // TODO: When Stripe is configured, create checkout session here
  // For now, confirm directly (free / pay-later mode)

  const { error: updateError } = await supabase
    .from("lessons")
    .update({
      status: "confirmed",
      hold_expires_at: null,
    })
    .eq("id", lesson_id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Create a pending payment record (amount from tutor_subject pricing)
  const { data: lessonFull } = await supabase
    .from("lessons")
    .select("tutor_id, tutor_subject_id, starts_at, ends_at")
    .eq("id", lesson_id)
    .single();

  if (lessonFull?.tutor_subject_id) {
    const { data: ts } = await supabase
      .from("tutor_subjects")
      .select("prices, durations")
      .eq("id", lessonFull.tutor_subject_id)
      .single();

    if (ts) {
      const durationMin = Math.round(
        (new Date(lessonFull.ends_at).getTime() - new Date(lessonFull.starts_at).getTime()) /
          60000
      );
      const price = (ts.prices as Record<string, number>)?.[String(durationMin)];
      if (price) {
        await supabase.from("payments").insert({
          lesson_id,
          payer_id: profile.id,
          tutor_id: lessonFull.tutor_id,
          amount_cents: Math.round(price * 100),
          status: "pending",
        });
      }
    }
  }

  return NextResponse.json({ success: true, lesson_id });
}
