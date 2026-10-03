import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";

/**
 * Cron endpoint to send lesson reminders.
 * Sends reminders 24h and 1h before lessons.
 * Call every 30 minutes via cron.
 */
export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!expected || authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const now = new Date();
  const sent: string[] = [];

  // 24-hour reminders: lessons starting between 23.5h and 24.5h from now
  const reminder24hStart = new Date(now.getTime() + 23.5 * 60 * 60 * 1000);
  const reminder24hEnd = new Date(now.getTime() + 24.5 * 60 * 60 * 1000);

  const { data: lessons24h } = await supabase
    .from("lessons")
    .select("id, starts_at, booked_by, tutor_id, subjects(name), learners(full_name), tutors(profiles(user_id))")
    .eq("status", "confirmed")
    .gte("starts_at", reminder24hStart.toISOString())
    .lt("starts_at", reminder24hEnd.toISOString());

  for (const lesson of lessons24h ?? []) {
    const subjectName = (lesson.subjects as unknown as { name: string })?.name || "Lesson";
    const startTime = new Date(lesson.starts_at);
    const timeStr = startTime.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    const dateStr = startTime.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

    // Notify student/parent
    const { data: bookerProfile } = await supabase
      .from("profiles").select("user_id").eq("id", lesson.booked_by).single();

    if (bookerProfile) {
      // Check if we already sent this reminder
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", bookerProfile.user_id)
        .eq("type", "lesson_reminder_24h")
        .contains("data", { lesson_id: lesson.id });

      if (!count || count === 0) {
        await supabase.from("notifications").insert({
          user_id: bookerProfile.user_id,
          type: "lesson_reminder_24h",
          title: "Lesson tomorrow",
          body: `${subjectName} on ${dateStr} at ${timeStr}`,
          data: { lesson_id: lesson.id },
        });
        sent.push(`24h-student-${lesson.id}`);
      }
    }

    // Notify tutor
    const tutorUserId = (lesson.tutors as unknown as { profiles: { user_id: string } })?.profiles?.user_id;
    if (tutorUserId) {
      const learnerName = (lesson.learners as unknown as { full_name: string })?.full_name || "Student";
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", tutorUserId)
        .eq("type", "lesson_reminder_24h")
        .contains("data", { lesson_id: lesson.id });

      if (!count || count === 0) {
        await supabase.from("notifications").insert({
          user_id: tutorUserId,
          type: "lesson_reminder_24h",
          title: "Lesson tomorrow",
          body: `${subjectName} with ${learnerName} at ${timeStr}`,
          data: { lesson_id: lesson.id },
        });
        sent.push(`24h-tutor-${lesson.id}`);
      }
    }
  }

  // 1-hour reminders: lessons starting between 0.5h and 1.5h from now
  const reminder1hStart = new Date(now.getTime() + 0.5 * 60 * 60 * 1000);
  const reminder1hEnd = new Date(now.getTime() + 1.5 * 60 * 60 * 1000);

  const { data: lessons1h } = await supabase
    .from("lessons")
    .select("id, starts_at, booked_by, tutor_id, subjects(name), learners(full_name), tutors(profiles(user_id))")
    .eq("status", "confirmed")
    .gte("starts_at", reminder1hStart.toISOString())
    .lt("starts_at", reminder1hEnd.toISOString());

  for (const lesson of lessons1h ?? []) {
    const subjectName = (lesson.subjects as unknown as { name: string })?.name || "Lesson";
    const startTime = new Date(lesson.starts_at);
    const timeStr = startTime.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

    const { data: bookerProfile } = await supabase
      .from("profiles").select("user_id").eq("id", lesson.booked_by).single();

    if (bookerProfile) {
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", bookerProfile.user_id)
        .eq("type", "lesson_reminder_1h")
        .contains("data", { lesson_id: lesson.id });

      if (!count || count === 0) {
        await supabase.from("notifications").insert({
          user_id: bookerProfile.user_id,
          type: "lesson_reminder_1h",
          title: "Lesson starting soon",
          body: `${subjectName} at ${timeStr} — get ready!`,
          data: { lesson_id: lesson.id },
        });
        sent.push(`1h-student-${lesson.id}`);
      }
    }

    const tutorUserId = (lesson.tutors as unknown as { profiles: { user_id: string } })?.profiles?.user_id;
    if (tutorUserId) {
      const learnerName = (lesson.learners as unknown as { full_name: string })?.full_name || "Student";
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", tutorUserId)
        .eq("type", "lesson_reminder_1h")
        .contains("data", { lesson_id: lesson.id });

      if (!count || count === 0) {
        await supabase.from("notifications").insert({
          user_id: tutorUserId,
          type: "lesson_reminder_1h",
          title: "Lesson starting soon",
          body: `${subjectName} with ${learnerName} at ${timeStr}`,
          data: { lesson_id: lesson.id },
        });
        sent.push(`1h-tutor-${lesson.id}`);
      }
    }
  }

  return NextResponse.json({ sent: sent.length, details: sent });
}
