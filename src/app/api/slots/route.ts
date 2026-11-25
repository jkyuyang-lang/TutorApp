import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { generateSlots, type AvailabilityRule, type TimeOff, type ExistingLesson, type BookingRules } from "@/lib/slots";
import { getCalendarProvider } from "@/lib/calendar";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const tutorId = req.nextUrl.searchParams.get("tutor_id");
  const duration = Number(req.nextUrl.searchParams.get("duration") || "60");

  if (!tutorId) {
    return NextResponse.json({ error: "Missing tutor_id" }, { status: 400 });
  }

  const supabase = createServiceClient();

  const [tutorRes, rulesRes, timeOffRes, lessonsRes] = await Promise.all([
    supabase
      .from("tutors")
      .select("buffer_minutes, min_notice_hours, booking_window_days, max_lessons_per_day, calendar_provider, profiles(time_zone)")
      .eq("id", tutorId)
      .single(),
    supabase
      .from("availability_rules")
      .select("*")
      .eq("tutor_id", tutorId),
    supabase
      .from("time_off")
      .select("*")
      .eq("tutor_id", tutorId)
      .gte("ends_at", new Date().toISOString()),
    supabase
      .from("lessons")
      .select("starts_at, ends_at, status, hold_expires_at")
      .eq("tutor_id", tutorId)
      .not("status", "in", '("canceled","late_cancel")')
      .gte("starts_at", new Date().toISOString()),
  ]);

  // Filter out expired holds
  const nowIso = new Date().toISOString();
  const activeLessons = (lessonsRes.data ?? []).filter((l) => {
    if (l.status === "held" && l.hold_expires_at && l.hold_expires_at < nowIso) {
      return false; // expired hold, ignore
    }
    return true;
  });

  if (!tutorRes.data) {
    return NextResponse.json({ error: "Tutor not found" }, { status: 404 });
  }

  const tutor = tutorRes.data;
  const profile = tutor.profiles as unknown as { time_zone: string };
  const timeZone = profile?.time_zone || "America/New_York";

  // Merge Google Calendar busy times into time-off ranges
  const timeOffs = (timeOffRes.data ?? []) as TimeOff[];

  if (tutor.calendar_provider && tutor.calendar_provider !== "none") {
    try {
      const calProvider = await getCalendarProvider(tutorId);
      if (calProvider) {
        const now = new Date();
        const windowEnd = new Date(now.getTime() + (tutor.min_notice_hours + tutor.booking_window_days * 24) * 60 * 60 * 1000);
        const busyTimes = await calProvider.getBusyTimes(now, windowEnd, timeZone);

        // Add calendar busy times as synthetic time-off entries
        for (const busy of busyTimes) {
          timeOffs.push({
            starts_at: busy.start.toISOString(),
            ends_at: busy.end.toISOString(),
          });
        }
      }
    } catch (err) {
      console.error("Failed to fetch calendar busy times:", err);
      // Continue without calendar data rather than failing
    }
  }

  const bookingRules = {
    buffer_minutes: tutor.buffer_minutes,
    min_notice_hours: tutor.min_notice_hours,
    booking_window_days: tutor.booking_window_days,
    max_lessons_per_day: tutor.max_lessons_per_day,
  } as BookingRules;

  const slots = generateSlots(
    (rulesRes.data ?? []) as AvailabilityRule[],
    timeOffs,
    activeLessons as ExistingLesson[],
    bookingRules,
    duration,
    timeZone
  );

  return NextResponse.json({
    slots: slots.map((s) => ({
      starts_at: s.starts_at.toISOString(),
      ends_at: s.ends_at.toISOString(),
      format: s.format,
    })),
  });
}
