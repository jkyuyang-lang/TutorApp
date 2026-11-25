import { NextRequest, NextResponse } from "next/server";
import { requireSuperadmin } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/admin";

// GET /api/admin/policies — load current policies from first tutor
export async function GET() {
  const auth = await requireSuperadmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("tutors")
    .select("buffer_minutes, min_notice_hours, booking_window_days, max_lessons_per_day, cancellation_policy")
    .limit(1)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ policies: data });
}

// PUT /api/admin/policies — apply policies to ALL tutors
export async function PUT(req: NextRequest) {
  const auth = await requireSuperadmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { buffer_minutes, min_notice_hours, booking_window_days, max_lessons_per_day, cancellation_policy } = body;

  const supabase = createServiceClient();

  // Update all tutor rows
  const { error } = await supabase
    .from("tutors")
    .update({
      buffer_minutes,
      min_notice_hours,
      booking_window_days,
      max_lessons_per_day,
      cancellation_policy,
    })
    .not("id", "is", null); // match all rows

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
