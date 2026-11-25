import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { lesson_id } = await req.json();
  if (!lesson_id) {
    return NextResponse.json({ error: "Missing lesson_id" }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 400 });
  }

  // Fetch the held lesson
  const { data: lesson } = await supabase
    .from("lessons")
    .select(`
      id, tutor_id, subject_id, tutor_subject_id, starts_at, ends_at, status, booked_by,
      subjects(name),
      learners(full_name)
    `)
    .eq("id", lesson_id)
    .eq("booked_by", profile.id)
    .single();

  if (!lesson || lesson.status !== "held") {
    return NextResponse.json({ error: "Lesson not found or not in held status" }, { status: 400 });
  }

  // Calculate price
  const adminClient = createServiceClient();
  const durationMin = Math.round(
    (new Date(lesson.ends_at).getTime() - new Date(lesson.starts_at).getTime()) / 60000
  );
  let price = 0;

  if (lesson.tutor_subject_id) {
    const { data: ts } = await adminClient
      .from("tutor_subjects")
      .select("prices")
      .eq("id", lesson.tutor_subject_id)
      .single();
    price = (ts?.prices as Record<string, number>)?.[String(durationMin)] ?? 0;
  }

  if (!price) {
    const { data: tutor } = await adminClient
      .from("tutors")
      .select("hourly_rate")
      .eq("id", lesson.tutor_id)
      .single();
    const hourly = parseFloat(tutor?.hourly_rate) || 0;
    if (hourly > 0) {
      price = Math.round((hourly * durationMin) / 60 * 100) / 100;
    }
  }

  if (!price || price <= 0) {
    return NextResponse.json({ free: true, lesson_id });
  }

  const amountCents = Math.round(price * 100);
  const subjectName = (lesson.subjects as unknown as { name: string })?.name || "Tutoring";
  const learnerName = (lesson.learners as unknown as { full_name: string })?.full_name || "Student";
  const startDate = new Date(lesson.starts_at);

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: "usd",
      description: `${subjectName} — ${durationMin} min lesson for ${learnerName} on ${startDate.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      })}`,
      metadata: {
        lesson_id,
        payer_id: profile.id,
        tutor_id: lesson.tutor_id,
        amount_cents: String(amountCents),
      },
      receipt_email: user.email ?? undefined,
      automatic_payment_methods: { enabled: true },
    });

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      amount: amountCents,
    });
  } catch (err) {
    console.error("Stripe PaymentIntent error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create payment" },
      { status: 500 }
    );
  }
}
