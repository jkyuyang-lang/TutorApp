import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe";
import { calculateRefund, type CancellationPolicy } from "@/lib/refund-policy";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { reason } = await req.json().catch(() => ({ reason: "" }));

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("user_id", user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 400 });
  }

  // Fetch lesson
  const { data: lesson } = await supabase
    .from("lessons")
    .select("*, tutors(cancellation_policy, profiles(user_id))")
    .eq("id", id)
    .single();

  if (!lesson) {
    return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
  }

  // Only the booker or tutor can cancel
  const tutorUserId = (lesson.tutors as unknown as { profiles: { user_id: string } })?.profiles?.user_id;
  const isTutor = user.id === tutorUserId;
  const isBooker = lesson.booked_by === profile.id;

  if (!isTutor && !isBooker) {
    return NextResponse.json({ error: "Not authorized to cancel" }, { status: 403 });
  }

  if (["canceled", "late_cancel", "completed"].includes(lesson.status)) {
    return NextResponse.json({ error: "Lesson cannot be canceled" }, { status: 400 });
  }

  const policy = (lesson.tutors as unknown as { cancellation_policy: CancellationPolicy })
    ?.cancellation_policy;
  const lessonStart = new Date(lesson.starts_at);
  const now = new Date();
  const hoursUntilLesson = (lessonStart.getTime() - now.getTime()) / (1000 * 60 * 60);

  // Determine cancel status
  const isLateCancel = policy && hoursUntilLesson < policy.full_refund_hours;
  const newStatus = isLateCancel ? "late_cancel" : "canceled";

  // Update lesson
  const { error: updateError } = await supabase
    .from("lessons")
    .update({
      status: newStatus,
      canceled_by: profile.id,
      cancel_reason: reason || null,
    })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Handle refund if payment exists
  let refundResult = null;
  const { data: payment } = await supabase
    .from("payments")
    .select("*")
    .eq("lesson_id", id)
    .eq("status", "succeeded")
    .single();

  if (payment && policy) {
    // Tutor-initiated cancels always get full refund
    const refund = isTutor
      ? {
          refund_pct: 100,
          refund_amount_cents: payment.amount_cents,
          charge_amount_cents: 0,
          reason: "Tutor canceled: full refund",
        }
      : calculateRefund(policy, lessonStart, payment.amount_cents);

    refundResult = refund;

    if (refund.refund_amount_cents > 0 && payment.stripe_payment_intent_id) {
      try {
        const stripeRefund = await stripe.refunds.create({
          payment_intent: payment.stripe_payment_intent_id,
          amount: refund.refund_amount_cents,
        });

        // Record refund
        await supabase.from("refunds").insert({
          payment_id: payment.id,
          stripe_refund_id: stripeRefund.id,
          amount_cents: refund.refund_amount_cents,
          reason: refund.reason,
          policy_applied: policy,
        });

        // Update payment status
        const newPaymentStatus =
          refund.refund_amount_cents >= payment.amount_cents
            ? "refunded"
            : "partially_refunded";
        await supabase
          .from("payments")
          .update({ status: newPaymentStatus })
          .eq("id", payment.id);
      } catch (err) {
        console.error("Stripe refund error:", err);
        // Still record the refund intent even if Stripe fails
        await supabase.from("refunds").insert({
          payment_id: payment.id,
          amount_cents: refund.refund_amount_cents,
          reason: `${refund.reason} (Stripe refund failed)`,
          policy_applied: policy,
        });
      }
    }
  }

  // Notify the other party
  const notifyUserId = isTutor ? (await getBookerUserId(supabase, lesson.booked_by)) : tutorUserId;
  if (notifyUserId) {
    await supabase.from("notifications").insert({
      user_id: notifyUserId,
      type: "lesson_canceled",
      title: "Lesson canceled",
      body: `${isTutor ? "Your tutor" : "A student"} canceled the lesson on ${lessonStart.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}`,
      data: { lesson_id: id, refund: refundResult },
    });
  }

  return NextResponse.json({
    success: true,
    status: newStatus,
    refund: refundResult,
  });
}

async function getBookerUserId(supabase: Awaited<ReturnType<typeof createClient>>, profileId: string) {
  const { data } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("id", profileId)
    .single();
  return data?.user_id ?? null;
}
