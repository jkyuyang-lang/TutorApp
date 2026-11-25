import { createServiceClient } from "@/lib/supabase/admin";

/**
 * Completes any confirmed lessons whose end time has passed.
 * - Sets lesson status to "completed"
 * - Creates a payment if none exists (looks up tutor_subject pricing)
 * - Updates pending payments to "succeeded"
 * Returns the number of lessons completed.
 */
export async function completePastLessons(): Promise<number> {
  const supabase = createServiceClient();
  const now = new Date().toISOString();

  const { data: lessons } = await supabase
    .from("lessons")
    .select("id, tutor_id, tutor_subject_id, booked_by, starts_at, ends_at")
    .eq("status", "confirmed")
    .lt("ends_at", now);

  if (!lessons || lessons.length === 0) return 0;

  const ids = lessons.map((l) => l.id);

  // Mark lessons as completed
  await supabase
    .from("lessons")
    .update({ status: "completed" })
    .in("id", ids);

  // Create payments for lessons that don't have one, then mark all pending as succeeded
  await ensurePayments(supabase, lessons);

  await supabase
    .from("payments")
    .update({ status: "succeeded" })
    .in("lesson_id", ids)
    .eq("status", "pending");

  return ids.length;
}

/**
 * Backfills missing payment records for already-completed lessons.
 * Returns the number of payments created.
 */
export async function backfillMissingPayments(): Promise<number> {
  const supabase = createServiceClient();

  // Find completed lessons that have no payment record
  const { data: completedLessons } = await supabase
    .from("lessons")
    .select("id, tutor_id, tutor_subject_id, booked_by, starts_at, ends_at")
    .eq("status", "completed");

  if (!completedLessons || completedLessons.length === 0) return 0;

  // Check which ones are missing payments
  const { data: existingPayments } = await supabase
    .from("payments")
    .select("lesson_id")
    .in("lesson_id", completedLessons.map((l) => l.id));

  const paidLessonIds = new Set((existingPayments ?? []).map((p) => p.lesson_id));
  const unpaidLessons = completedLessons.filter((l) => !paidLessonIds.has(l.id));

  if (unpaidLessons.length === 0) return 0;

  return await ensurePayments(supabase, unpaidLessons);
}

type LessonRow = {
  id: string;
  tutor_id: string;
  tutor_subject_id: string | null;
  booked_by: string;
  starts_at: string;
  ends_at: string;
};

async function ensurePayments(
  supabase: ReturnType<typeof createServiceClient>,
  lessons: LessonRow[]
): Promise<number> {
  let created = 0;

  // Gather unique tutor_subject_ids to batch-fetch pricing
  const tsIds = [...new Set(lessons.map((l) => l.tutor_subject_id).filter(Boolean))] as string[];
  const priceMap = new Map<string, Record<string, number>>();

  if (tsIds.length > 0) {
    const { data: tsData } = await supabase
      .from("tutor_subjects")
      .select("id, prices")
      .in("id", tsIds);

    for (const ts of tsData ?? []) {
      priceMap.set(ts.id, ts.prices as Record<string, number>);
    }
  }

  // Batch-fetch tutor-level hourly rates as fallback
  const tutorIds = [...new Set(lessons.map((l) => l.tutor_id))];
  const hourlyRateMap = new Map<string, number>();
  if (tutorIds.length > 0) {
    const { data: tutors } = await supabase
      .from("tutors")
      .select("id, hourly_rate")
      .in("id", tutorIds);
    for (const t of tutors ?? []) {
      hourlyRateMap.set(t.id, parseFloat(t.hourly_rate) || 0);
    }
  }

  for (const lesson of lessons) {
    // Check if payment already exists
    const { data: existing } = await supabase
      .from("payments")
      .select("id")
      .eq("lesson_id", lesson.id)
      .limit(1)
      .maybeSingle();

    if (existing) continue;

    const durationMin = Math.round(
      (new Date(lesson.ends_at).getTime() - new Date(lesson.starts_at).getTime()) / 60000
    );

    // Try tutor_subject pricing first
    let price = 0;
    if (lesson.tutor_subject_id) {
      const prices = priceMap.get(lesson.tutor_subject_id);
      price = prices?.[String(durationMin)] ?? 0;
    }

    // Fall back to tutor-level hourly rate
    if (!price) {
      const hourly = hourlyRateMap.get(lesson.tutor_id) ?? 0;
      if (hourly > 0) {
        price = Math.round((hourly * durationMin) / 60 * 100) / 100;
      }
    }

    if (!price) continue;

    await supabase.from("payments").insert({
      lesson_id: lesson.id,
      payer_id: lesson.booked_by,
      tutor_id: lesson.tutor_id,
      amount_cents: Math.round(price * 100),
      status: "succeeded",
    });
    created++;
  }

  return created;
}
