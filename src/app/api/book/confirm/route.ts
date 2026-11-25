import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { syncLessonToCalendar } from "@/lib/calendar";
import { notify } from "@/lib/notify";
import { generateMeetingLink } from "@/lib/meetings";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { lesson_id, payment_intent_id, cancel } = await req.json();
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

  if (cancel) {
    await supabase
      .from("lessons")
      .update({ status: "canceled", cancel_reason: "User cancelled hold" })
      .eq("id", lesson_id);
    return NextResponse.json({ success: true, canceled: true });
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

  // Create a pending payment record using service client (bypasses RLS for reliable pricing)
  const adminClient = createServiceClient();
  const { data: lessonFull } = await adminClient
    .from("lessons")
    .select("tutor_id, tutor_subject_id, starts_at, ends_at")
    .eq("id", lesson_id)
    .single();

  if (lessonFull) {
    const durationMin = Math.round(
      (new Date(lessonFull.ends_at).getTime() - new Date(lessonFull.starts_at).getTime()) /
        60000
    );

    let price = 0;

    // Try tutor_subject pricing first
    if (lessonFull.tutor_subject_id) {
      const { data: ts } = await adminClient
        .from("tutor_subjects")
        .select("prices")
        .eq("id", lessonFull.tutor_subject_id)
        .single();
      price = (ts?.prices as Record<string, number>)?.[String(durationMin)] ?? 0;
    }

    // Fall back to tutor-level hourly rate
    if (!price) {
      const { data: tutor } = await adminClient
        .from("tutors")
        .select("hourly_rate")
        .eq("id", lessonFull.tutor_id)
        .single();
      const hourly = parseFloat(tutor?.hourly_rate) || 0;
      if (hourly > 0) {
        price = Math.round((hourly * durationMin) / 60 * 100) / 100;
      }
    }

    if (price > 0) {
      await adminClient.from("payments").insert({
        lesson_id,
        payer_id: profile.id,
        tutor_id: lessonFull.tutor_id,
        amount_cents: Math.round(price * 100),
        status: payment_intent_id ? "succeeded" : "pending",
        stripe_payment_intent_id: payment_intent_id || null,
      });
    }
  }

  // Generate meeting link (before calendar sync so the link is included in the event)
  if (lessonFull) {
    try {
      // Get tutor's timezone and email
      const { data: tutorProfile } = await adminClient
        .from("tutors")
        .select("profile_id")
        .eq("id", lessonFull.tutor_id)
        .single();
      const { data: tutorProfileData } = await adminClient
        .from("profiles")
        .select("time_zone, user_id")
        .eq("id", tutorProfile?.profile_id)
        .single();

      // Get tutor and student emails for attendees
      const attendeeEmails: string[] = [];
      if (tutorProfileData?.user_id) {
        const { data: tutorUser } = await adminClient.auth.admin.getUserById(tutorProfileData.user_id);
        if (tutorUser?.user?.email) attendeeEmails.push(tutorUser.user.email);
      }
      const { data: studentUser } = await adminClient.auth.admin.getUserById(user.id);
      if (studentUser?.user?.email) attendeeEmails.push(studentUser.user.email);

      const { data: lessonDetails } = await adminClient
        .from("lessons")
        .select("learners(full_name), tutor_subjects(subjects(name))")
        .eq("id", lesson_id)
        .single();

      const learnerName = (lessonDetails?.learners as unknown as { full_name: string } | null)?.full_name ?? "Student";
      const subjectName = (lessonDetails?.tutor_subjects as unknown as { subjects: { name: string } | null } | null)?.subjects?.name ?? "Tutoring";

      const meeting = await generateMeetingLink({
        tutorId: lessonFull.tutor_id,
        title: `${subjectName} - ${learnerName}`,
        startTime: new Date(lessonFull.starts_at),
        endTime: new Date(lessonFull.ends_at),
        timeZone: tutorProfileData?.time_zone || "America/New_York",
        attendeeEmails,
      });

      if (meeting) {
        await adminClient
          .from("lessons")
          .update({ meeting_link: meeting.link })
          .eq("id", lesson_id);
      }
    } catch (err) {
      console.error("Meeting link generation failed:", err);
    }
  }

  // Sync to tutor's connected calendar (fire-and-forget)
  syncLessonToCalendar(lesson_id).catch(() => {});

  // Email notification (fire-and-forget)
  notify("lesson_booked", { lesson_id });

  return NextResponse.json({ success: true, lesson_id });
}
