import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { completePastLessons, backfillMissingPayments } from "@/lib/complete-past-lessons";

/**
 * POST /api/lessons/complete-past
 * Lightweight endpoint for clients to trigger auto-completion of past confirmed lessons
 * and backfill any missing payment records for completed lessons.
 * Requires authentication.
 */
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const completed = await completePastLessons();
  const backfilled = await backfillMissingPayments();
  return NextResponse.json({ completed, backfilled });
}
