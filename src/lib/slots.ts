/**
 * Slot generation engine.
 * Computes open booking slots from availability rules, time off, existing lessons, and booking rules.
 */

export interface AvailabilityRule {
  day_of_week: number; // 0=Sun, 6=Sat
  start_time: string; // "HH:MM:SS" or "HH:MM"
  end_time: string;
  format: string;
}

export interface TimeOff {
  starts_at: string; // ISO timestamptz
  ends_at: string;
}

export interface ExistingLesson {
  starts_at: string;
  ends_at: string;
  status: string;
}

export interface BookingRules {
  buffer_minutes: number;
  min_notice_hours: number;
  booking_window_days: number;
  max_lessons_per_day: number | null;
}

export interface Slot {
  starts_at: Date;
  ends_at: Date;
  format: string;
}

/**
 * Generate available slots for a tutor over a date range.
 *
 * @param rules - Weekly availability rules
 * @param timeOffs - Blocked time-off periods
 * @param lessons - Existing booked lessons (non-canceled)
 * @param bookingRules - Buffer, notice, window config
 * @param durationMinutes - Requested lesson duration
 * @param tutorTimeZone - Tutor's IANA timezone
 * @param fromDate - Start of range (defaults to now)
 * @param days - Number of days to generate (defaults to booking_window_days)
 */
export function generateSlots(
  rules: AvailabilityRule[],
  timeOffs: TimeOff[],
  lessons: ExistingLesson[],
  bookingRules: BookingRules,
  durationMinutes: number,
  tutorTimeZone: string,
  fromDate?: Date,
  days?: number
): Slot[] {
  const now = new Date();
  const start = fromDate ?? now;
  const windowDays = days ?? bookingRules.booking_window_days;
  const minNoticeMs = bookingRules.min_notice_hours * 60 * 60 * 1000;
  const bufferMs = bookingRules.buffer_minutes * 60 * 1000;
  const durationMs = durationMinutes * 60 * 1000;

  // Earliest bookable time (respects min notice)
  const earliest = new Date(now.getTime() + minNoticeMs);

  // Active lessons (not canceled)
  const activeBookings = lessons
    .filter((l) => !["canceled", "late_cancel"].includes(l.status))
    .map((l) => ({
      start: new Date(l.starts_at).getTime(),
      end: new Date(l.ends_at).getTime(),
    }));

  // Time-off ranges
  const timeOffRanges = timeOffs.map((t) => ({
    start: new Date(t.starts_at).getTime(),
    end: new Date(t.ends_at).getTime(),
  }));

  // Count lessons per day for max_lessons_per_day check
  const lessonsPerDay = new Map<string, number>();
  for (const booking of activeBookings) {
    const dayKey = new Date(booking.start).toISOString().slice(0, 10);
    lessonsPerDay.set(dayKey, (lessonsPerDay.get(dayKey) ?? 0) + 1);
  }

  const slots: Slot[] = [];

  for (let d = 0; d < windowDays; d++) {
    const currentDate = new Date(start);
    currentDate.setDate(currentDate.getDate() + d);

    // Get day of week in tutor's timezone
    const dayOfWeek = getDayOfWeekInTimezone(currentDate, tutorTimeZone);

    // Find matching rules
    const dayRules = rules.filter((r) => r.day_of_week === dayOfWeek);

    for (const rule of dayRules) {
      // Parse start/end times and create timestamps in tutor's timezone
      const blockStart = setTimeInTimezone(currentDate, rule.start_time, tutorTimeZone);
      const blockEnd = setTimeInTimezone(currentDate, rule.end_time, tutorTimeZone);

      // Generate slots within this availability block
      let slotStart = blockStart.getTime();
      const blockEndMs = blockEnd.getTime();

      while (slotStart + durationMs <= blockEndMs) {
        const slotEnd = slotStart + durationMs;
        const slotStartWithBuffer = slotStart - bufferMs;
        const slotEndWithBuffer = slotEnd + bufferMs;

        // Check: slot is in the future and respects min notice
        if (slotStart < earliest.getTime()) {
          slotStart += 30 * 60 * 1000; // advance by 30 min increments
          continue;
        }

        // Check: max lessons per day
        const dayKey = new Date(slotStart).toISOString().slice(0, 10);
        if (
          bookingRules.max_lessons_per_day &&
          (lessonsPerDay.get(dayKey) ?? 0) >= bookingRules.max_lessons_per_day
        ) {
          break; // skip rest of day
        }

        // Check: no overlap with time off
        const inTimeOff = timeOffRanges.some(
          (t) => slotStart < t.end && slotEnd > t.start
        );
        if (inTimeOff) {
          slotStart += 30 * 60 * 1000;
          continue;
        }

        // Check: no overlap with existing lessons (including buffer)
        const hasConflict = activeBookings.some(
          (b) => slotStartWithBuffer < b.end && slotEndWithBuffer > b.start
        );
        if (hasConflict) {
          slotStart += 30 * 60 * 1000;
          continue;
        }

        slots.push({
          starts_at: new Date(slotStart),
          ends_at: new Date(slotEnd),
          format: rule.format,
        });

        // Advance by duration + buffer for next slot
        slotStart = slotEnd + bufferMs;
      }
    }
  }

  return slots;
}

/**
 * Get the next N open slots for a tutor (for the profile preview).
 */
export function getNextSlots(
  rules: AvailabilityRule[],
  timeOffs: TimeOff[],
  lessons: ExistingLesson[],
  bookingRules: BookingRules,
  durationMinutes: number,
  tutorTimeZone: string,
  count: number = 10
): Slot[] {
  const allSlots = generateSlots(
    rules,
    timeOffs,
    lessons,
    bookingRules,
    durationMinutes,
    tutorTimeZone
  );
  return allSlots.slice(0, count);
}

function getDayOfWeekInTimezone(date: Date, timeZone: string): number {
  const formatted = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone,
  }).format(date);

  const dayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return dayMap[formatted] ?? 0;
}

function setTimeInTimezone(date: Date, time: string, timeZone: string): Date {
  // Get the date components in the tutor's timezone
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).formatToParts(date);

  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;

  const [hours, minutes] = time.split(":").map(Number);

  // Build an ISO string with the timezone offset
  // Use a temporary date to find the offset
  const isoStr = `${year}-${month}-${day}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`;

  // Create date in the tutor's timezone by using the locale string trick
  const tempDate = new Date(isoStr + "Z");
  const utcDate = new Date(isoStr);

  // Get the offset for this timezone at this date
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
  });
  const tzParts = formatter.formatToParts(utcDate);
  const tzName = tzParts.find((p) => p.type === "timeZoneName")?.value ?? "";

  // Parse offset like "GMT-5" or "GMT+5:30"
  const offsetMatch = tzName.match(/GMT([+-]\d{1,2}):?(\d{2})?/);
  if (offsetMatch) {
    const offsetHours = parseInt(offsetMatch[1], 10);
    const offsetMinutes = parseInt(offsetMatch[2] ?? "0", 10);
    const totalOffsetMs = (offsetHours * 60 + (offsetHours < 0 ? -offsetMinutes : offsetMinutes)) * 60 * 1000;
    return new Date(tempDate.getTime() + totalOffsetMs);
  }

  // Fallback: just use the UTC interpretation
  return tempDate;
}
