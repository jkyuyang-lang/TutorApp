import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";

/**
 * Cron endpoint to release expired lesson holds.
 * Call this every minute via Supabase cron or Vercel cron.
 *
 * Expects Authorization header with CRON_SECRET or service role key.
 */
export async function POST(req: Request) {
  // Simple auth check
  const authHeader = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!expected || authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("lessons")
    .update({ status: "canceled", cancel_reason: "Hold expired" })
    .eq("status", "held")
    .lt("hold_expires_at", new Date().toISOString())
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    released: data?.length ?? 0,
    ids: data?.map((l) => l.id) ?? [],
  });
}
