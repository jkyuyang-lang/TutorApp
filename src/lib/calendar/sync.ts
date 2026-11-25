import { createServiceClient } from "@/lib/supabase/admin";
import { createGoogleCalendarProvider } from "./google";
import type { CalendarProvider, CalendarTokens } from "./types";

/**
 * Build the calendar provider for a tutor, if connected.
 * Returns null if no calendar is connected.
 */
export async function getCalendarProvider(
  tutorId: string
): Promise<CalendarProvider | null> {
  const supabase = createServiceClient();

  const { data: tutor } = await supabase
    .from("tutors")
    .select("calendar_provider, calendar_tokens, calendar_id")
    .eq("id", tutorId)
    .single();

  if (!tutor?.calendar_provider || tutor.calendar_provider === "none") {
    return null;
  }

  if (tutor.calendar_provider === "google") {
    const tokens = tutor.calendar_tokens as CalendarTokens;
    if (!tokens?.refresh_token) return null;

    return createGoogleCalendarProvider(
      tokens,
      (tutor.calendar_id as string) || "primary",
      async (newTokens) => {
        await supabase
          .from("tutors")
          .update({ calendar_tokens: newTokens as unknown as Record<string, unknown> })
          .eq("id", tutorId);
      }
    );
  }

  // Future: add "outlook" etc. here
  return null;
}

/**
 * Push a lesson event to the tutor's connected calendar.
 * Stores the external event ID on the lesson row.
 */
export async function syncLessonToCalendar(lessonId: string): Promise<void> {
  const supabase = createServiceClient();

  const { data: lesson } = await supabase
    .from("lessons")
    .select(`
      id, starts_at, ends_at, tutor_id, meeting_link, calendar_event_id,
      learners(full_name),
      tutor_subjects(subjects(name))
    `)
    .eq("id", lessonId)
    .single();

  if (!lesson) return;

  const provider = await getCalendarProvider(lesson.tutor_id);
  if (!provider) return;

  // Get tutor timezone and meeting platform
  const { data: tutor } = await supabase
    .from("tutors")
    .select("profile_id, meeting_platform, meeting_link")
    .eq("id", lesson.tutor_id)
    .single();

  const { data: profile } = await supabase
    .from("profiles")
    .select("time_zone")
    .eq("id", tutor?.profile_id)
    .single();

  const timeZone = profile?.time_zone || "America/New_York";

  const learnerName =
    (lesson.learners as unknown as { full_name: string } | null)?.full_name ?? "Student";
  const subjectName =
    (
      lesson.tutor_subjects as unknown as {
        subjects: { name: string } | null;
      } | null
    )?.subjects?.name ?? "Tutoring";

  // Determine meeting link: use lesson-level link, fall back to tutor's static link
  const meetingLink = lesson.meeting_link ?? tutor?.meeting_link ?? undefined;
  const shouldGenerateMeet =
    tutor?.meeting_platform === "google_meet" &&
    provider.name === "google" &&
    !lesson.meeting_link;

  const event = {
    title: `${subjectName} - ${learnerName}`,
    description: `Tutoring session: ${subjectName} with ${learnerName}`,
    startTime: new Date(lesson.starts_at),
    endTime: new Date(lesson.ends_at),
    timeZone,
    meetingLink: shouldGenerateMeet ? undefined : meetingLink,
    generateMeetLink: shouldGenerateMeet,
  };

  try {
    if (lesson.calendar_event_id) {
      // Update existing event
      await provider.updateEvent(lesson.calendar_event_id, event);
    } else {
      // Create new event
      const result = await provider.createEvent(event);
      const updateData: Record<string, unknown> = { calendar_event_id: result.eventId };

      // If a Meet link was generated, store it on the lesson
      if (result.meetLink) {
        updateData.meeting_link = result.meetLink;
      }

      await supabase
        .from("lessons")
        .update(updateData)
        .eq("id", lessonId);
    }
  } catch (err) {
    console.error("Calendar sync failed for lesson", lessonId, err);
  }
}

/**
 * Remove a lesson event from the tutor's connected calendar.
 */
export async function removeLessonFromCalendar(
  lessonId: string
): Promise<void> {
  const supabase = createServiceClient();

  const { data: lesson } = await supabase
    .from("lessons")
    .select("tutor_id, calendar_event_id")
    .eq("id", lessonId)
    .single();

  if (!lesson?.calendar_event_id) return;

  const provider = await getCalendarProvider(lesson.tutor_id);
  if (!provider) return;

  try {
    await provider.deleteEvent(lesson.calendar_event_id);
    await supabase
      .from("lessons")
      .update({ calendar_event_id: null })
      .eq("id", lessonId);
  } catch (err) {
    console.error("Calendar delete failed for lesson", lessonId, err);
  }
}
