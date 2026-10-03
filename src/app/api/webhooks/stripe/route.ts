import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/admin";
import type Stripe from "stripe";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  // If webhook secret is configured, verify signature
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event: Stripe.Event;
  try {
    if (webhookSecret && sig) {
      event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
    } else {
      // In development without webhook secret, parse directly
      event = JSON.parse(body) as Stripe.Event;
    }
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabase = createServiceClient();

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const { lesson_id, payer_id, tutor_id, amount_cents } =
      session.metadata ?? {};

    if (!lesson_id) {
      console.error("No lesson_id in checkout session metadata");
      return NextResponse.json({ received: true });
    }

    // Confirm the lesson
    await supabase
      .from("lessons")
      .update({ status: "confirmed", hold_expires_at: null })
      .eq("id", lesson_id)
      .eq("status", "held");

    // Create payment record
    await supabase.from("payments").insert({
      lesson_id,
      payer_id: payer_id!,
      tutor_id: tutor_id!,
      stripe_payment_intent_id: session.payment_intent as string,
      stripe_checkout_session_id: session.id,
      amount_cents: parseInt(amount_cents || "0", 10),
      status: "succeeded",
    });

    // Create notification for tutor
    const { data: tutor } = await supabase
      .from("tutors")
      .select("profiles(user_id)")
      .eq("id", tutor_id!)
      .single();

    if (tutor) {
      const tutorUserId = (tutor.profiles as unknown as { user_id: string })?.user_id;
      if (tutorUserId) {
        const { data: lessonData } = await supabase
          .from("lessons")
          .select("starts_at, learners(full_name), subjects(name)")
          .eq("id", lesson_id)
          .single();

        const learnerName = (lessonData?.learners as unknown as { full_name: string })?.full_name || "A student";
        const subjectName = (lessonData?.subjects as unknown as { name: string })?.name || "a lesson";

        await supabase.from("notifications").insert({
          user_id: tutorUserId,
          type: "new_booking",
          title: "New booking",
          body: `${learnerName} booked ${subjectName} on ${new Date(lessonData?.starts_at).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}`,
          data: { lesson_id },
        });
      }
    }
  }

  if (event.type === "checkout.session.expired") {
    const session = event.data.object as Stripe.Checkout.Session;
    const { lesson_id } = session.metadata ?? {};

    if (lesson_id) {
      // Release the hold
      await supabase
        .from("lessons")
        .update({ status: "canceled", cancel_reason: "Payment session expired" })
        .eq("id", lesson_id)
        .eq("status", "held");
    }
  }

  return NextResponse.json({ received: true });
}
