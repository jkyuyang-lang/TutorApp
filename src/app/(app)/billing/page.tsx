import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { BillingContent } from "./billing-content";

export default async function BillingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("user_id", user.id)
    .single();
  if (!profile) redirect("/onboarding");

  const isTutor = profile.role === "tutor";
  let tutorId: string | null = null;
  if (isTutor) {
    const { data: tutor } = await supabase
      .from("tutors").select("id").eq("profile_id", profile.id).single();
    tutorId = tutor?.id ?? null;
  }

  // Fetch payments with lesson + tutor details
  const paymentQuery = supabase
    .from("payments")
    .select(`
      id, amount_cents, currency, status, created_at,
      lessons(starts_at, ends_at, format, subjects(name), learners(full_name), tutors(profiles(full_name)))
    `)
    .order("created_at", { ascending: false })
    .limit(50);

  if (isTutor && tutorId) {
    paymentQuery.eq("tutor_id", tutorId);
  } else {
    paymentQuery.eq("payer_id", profile.id);
  }

  const { data: payments } = await paymentQuery;

  // Flatten payment data for the client component
  const paymentRows = (payments ?? []).map((p) => {
    const lesson = p.lessons as unknown as {
      starts_at: string;
      ends_at: string;
      format: string;
      subjects: { name: string };
      learners: { full_name: string };
      tutors: { profiles: { full_name: string } };
    } | null;
    return {
      id: p.id,
      amount_cents: p.amount_cents,
      currency: p.currency,
      status: p.status,
      created_at: p.created_at,
      subject_name: lesson?.subjects?.name || "Lesson",
      learner_name: lesson?.learners?.full_name || "—",
      lesson_starts_at: lesson?.starts_at || null,
      lesson_ends_at: lesson?.ends_at || null,
      lesson_format: lesson?.format || null,
      tutor_name: lesson?.tutors?.profiles?.full_name || null,
    };
  });

  // Fetch refunds
  const { data: refunds } = isTutor && tutorId
    ? await supabase
        .from("refunds")
        .select("id, amount_cents, reason, created_at")
        .order("created_at", { ascending: false })
        .limit(20)
    : await supabase
        .from("refunds")
        .select("id, amount_cents, reason, created_at")
        .order("created_at", { ascending: false })
        .limit(20);

  const refundRows = (refunds ?? []).map((r) => ({
    id: r.id,
    amount_cents: r.amount_cents,
    reason: r.reason,
    created_at: r.created_at,
  }));

  // Fetch credits
  const creditQuery = supabase
    .from("credits")
    .select("id, amount_cents, reason, expires_at")
    .is("used_at", null)
    .order("created_at", { ascending: false });

  if (isTutor && tutorId) {
    creditQuery.eq("tutor_id", tutorId);
  } else {
    creditQuery.eq("account_holder_id", profile.id);
  }

  const { data: credits } = await creditQuery;

  const creditRows = (credits ?? []).map((c) => ({
    id: c.id,
    amount_cents: c.amount_cents,
    reason: c.reason,
    expires_at: c.expires_at,
  }));

  // Calculate totals
  const totalPaid = paymentRows
    .filter((p) => p.status === "succeeded" || p.status === "partially_refunded")
    .reduce((sum, p) => sum + p.amount_cents, 0);

  const totalRefunded = refundRows.reduce((sum, r) => sum + r.amount_cents, 0);
  const totalCredits = creditRows.reduce((sum, c) => sum + c.amount_cents, 0);

  return (
    <BillingContent
      isTutor={isTutor}
      totalPaid={totalPaid}
      totalRefunded={totalRefunded}
      totalCredits={totalCredits}
      payments={paymentRows}
      refunds={refundRows}
      credits={creditRows}
    />
  );
}
