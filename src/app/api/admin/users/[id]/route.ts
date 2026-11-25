import { NextRequest, NextResponse } from "next/server";
import { requireSuperadmin } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/admin";
import { completePastLessons, backfillMissingPayments } from "@/lib/complete-past-lessons";

// GET /api/admin/users/[id] — detailed user info for client detail page
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSuperadmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Auto-complete past confirmed lessons and backfill missing payments
  await completePastLessons();
  await backfillMissingPayments();

  const { id } = await params;
  const supabase = createServiceClient();

  // Profile
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("id, user_id, role, full_name, phone, time_zone, created_at, updated_at")
    .eq("id", id)
    .single();

  if (profileErr || !profile) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Email from auth
  const { data: authData } = await supabase.auth.admin.getUserById(profile.user_id);
  const email = authData?.user?.email || "";

  // Learners
  const { data: learners } = await supabase
    .from("learners")
    .select("id, full_name, is_self, grade_level, school")
    .eq("account_holder_id", id);

  // All lessons booked by this user
  const { data: lessons } = await supabase
    .from("lessons")
    .select(`
      id, starts_at, ends_at, status, format, focus_notes, cancel_reason,
      subjects(name),
      learners(full_name),
      tutors(id, profile_id, profiles(full_name))
    `)
    .eq("booked_by", id)
    .not("status", "eq", "held")
    .order("starts_at", { ascending: false });

  // All payments
  const { data: payments } = await supabase
    .from("payments")
    .select(`
      id, amount_cents, status, created_at,
      lessons(id, starts_at, subjects(name))
    `)
    .eq("payer_id", id)
    .order("created_at", { ascending: false });

  // All refunds for this user's payments
  const paymentIds = (payments || []).map((p) => p.id);
  let refunds: Array<{ id: string; payment_id: string; amount_cents: number; reason: string | null; created_at: string }> = [];
  if (paymentIds.length > 0) {
    const { data } = await supabase
      .from("refunds")
      .select("id, payment_id, amount_cents, reason, created_at")
      .in("payment_id", paymentIds)
      .order("created_at", { ascending: false });
    refunds = data || [];
  }

  // Conversations & messages
  const { data: conversations } = await supabase
    .from("conversations")
    .select(`
      id, created_at,
      tutors(profile_id, profiles(full_name)),
      messages(id, sender_id, content, created_at, read_at)
    `)
    .eq("account_holder_id", id)
    .order("updated_at", { ascending: false });

  // Unique tutors from lessons
  const tutorMap = new Map<string, { full_name: string; profile_id: string }>();
  for (const l of lessons || []) {
    const t = l.tutors as unknown as { id: string; profile_id: string; profiles: { full_name: string } } | null;
    if (t) tutorMap.set(t.id, { full_name: t.profiles.full_name, profile_id: t.profile_id });
  }
  const tutors = Array.from(tutorMap.entries()).map(([tid, info]) => ({ id: tid, full_name: info.full_name, profile_id: info.profile_id }));

  // Financial summary
  const totalPaid = (payments || [])
    .filter((p) => p.status === "succeeded" || p.status === "partially_refunded" || p.status === "refunded")
    .reduce((s, p) => s + p.amount_cents, 0);
  const totalRefunded = refunds.reduce((s, r) => s + r.amount_cents, 0);

  return NextResponse.json({
    profile: { ...profile, email },
    learners: learners || [],
    lessons: lessons || [],
    payments: payments || [],
    refunds,
    conversations: conversations || [],
    tutors,
    financial: {
      total_paid_cents: totalPaid,
      total_refunded_cents: totalRefunded,
      net_revenue_cents: totalPaid - totalRefunded,
      lesson_count: (lessons || []).length,
    },
  });
}
