import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe";
import { calculateRefund, type CancellationPolicy } from "@/lib/refund-policy";

/**
 * Tutor marks a lesson as no-show.
 * Applies no-show charge from cancellation policy.
 */
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

  // Verify caller is the tutor
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("user_id", user.id)
    .single();

  if (!profile || profile.role !== "tutor") {
    return NextResponse.json({ error: "Only tutors can mark no-shows" }, { status: 403 });
  }

  const { data: tutor } = await supabase
    .from("tutors")
    .select("id, cancellation_policy")
    .eq("profile_id", profile.id)
    .single();

  if (!tutor) {
    return NextResponse.json({ error: "Tutor not found" }, { status: 400 });
  }

  // Fetch lesson
  const { data: lesson } = await supabase
    .from("lessons")
    .select("*")
    .eq("id", id)
    .eq("tutor_id", tutor.id)
    .single();

  if (!lesson) {
    return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
  }

  if (lesson.status !== "confirmed") {
    return NextResponse.json({ error: "Only confirmed lessons can be marked as no-show" }, { status: 400 });
  }

  // Update lesson status
  await supabase
    .from("lessons")
    .update({ status: "no_show" })
    .eq("id", id);

  // Handle partial refund based on no-show policy
  const policy = tutor.cancellation_policy as CancellationPolicy;
  const { data: payment } = await supabase
    .from("payments")
    .select("*")
    .eq("lesson_id", id)
    .eq("status", "succeeded")
    .single();

  let refundResult = null;
  if (payment && policy) {
    const refund = calculateRefund(
      policy,
      new Date(lesson.starts_at),
      payment.amount_cents,
      undefined,
      true // isNoShow
    );

    refundResult = refund;

    if (refund.refund_amount_cents > 0 && payment.stripe_payment_intent_id) {
      try {
        const stripeRefund = await stripe.refunds.create({
          payment_intent: payment.stripe_payment_intent_id,
          amount: refund.refund_amount_cents,
        });

        await supabase.from("refunds").insert({
          payment_id: payment.id,
          stripe_refund_id: stripeRefund.id,
          amount_cents: refund.refund_amount_cents,
          reason: refund.reason,
          policy_applied: policy,
        });

        const newStatus =
          refund.refund_amount_cents >= payment.amount_cents
            ? "refunded"
            : "partially_refunded";
        await supabase
          .from("payments")
          .update({ status: newStatus })
          .eq("id", payment.id);
      } catch (err) {
        console.error("Stripe refund error:", err);
      }
    }
  }

  // Notify student
  const { data: bookerProfile } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("id", lesson.booked_by)
    .single();

  if (bookerProfile) {
    await supabase.from("notifications").insert({
      user_id: bookerProfile.user_id,
      type: "no_show",
      title: "Marked as no-show",
      body: `Your lesson on ${new Date(lesson.starts_at).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} was marked as a no-show.`,
      data: { lesson_id: id, refund: refundResult },
    });
  }

  return NextResponse.json({ success: true, refund: refundResult });
}
