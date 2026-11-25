import { NextResponse } from "next/server";
import { completePastLessons, backfillMissingPayments } from "@/lib/complete-past-lessons";

/**
 * Cron endpoint to auto-complete confirmed lessons whose end time has passed
 * and backfill any missing payment records.
 *
 * Call via Vercel cron or Supabase cron every few minutes.
 * Expects Authorization header with CRON_SECRET or service role key.
 */
export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!expected || authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const completed = await completePastLessons();
  const backfilled = await backfillMissingPayments();

  return NextResponse.json({ completed, backfilled });
}
