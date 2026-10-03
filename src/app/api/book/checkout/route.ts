import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe";

/**
 * Creates a Stripe Checkout session for a held lesson.
 * Called after /api/book/hold, before confirmation.
 */
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

  // Fetch the held lesson with pricing info
  const { data: lesson } = await supabase
    .from("lessons")
    .select(`
      id, tutor_id, subject_id, tutor_subject_id, starts_at, ends_at, status, booked_by,
      subjects(name),
      learners(full_name),
      tutor_subjects(prices, durations)
    `)
    .eq("id", lesson_id)
    .eq("booked_by", profile.id)
    .single();

  if (!lesson || lesson.status !== "held") {
    return NextResponse.json({ error: "Lesson not found or not in held status" }, { status: 400 });
  }

  // Calculate price
  const durationMin = Math.round(
    (new Date(lesson.ends_at).getTime() - new Date(lesson.starts_at).getTime()) / 60000
  );
  const ts = lesson.tutor_subjects as unknown as { prices: Record<string, number>; durations: number[] } | null;
  const price = ts?.prices?.[String(durationMin)];

  if (!price || price <= 0) {
    // Free lesson — confirm directly without Stripe
    return NextResponse.json({ free: true, lesson_id });
  }

  const amountCents = Math.round(price * 100);
  const subjectName = (lesson.subjects as unknown as { name: string })?.name || "Tutoring";
  const learnerName = (lesson.learners as unknown as { full_name: string })?.full_name || "Student";
  const startDate = new Date(lesson.starts_at);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  // Create Stripe Checkout session
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: user.email,
    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: amountCents,
          product_data: {
            name: `${subjectName} — ${durationMin} min lesson`,
            description: `${learnerName} on ${startDate.toLocaleDateString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
            })} at ${startDate.toLocaleTimeString(undefined, {
              hour: "numeric",
              minute: "2-digit",
            })}`,
          },
        },
        quantity: 1,
      },
    ],
    metadata: {
      lesson_id,
      payer_id: profile.id,
      tutor_id: lesson.tutor_id,
      amount_cents: String(amountCents),
    },
    success_url: `${siteUrl}/book/confirmation/${lesson_id}`,
    cancel_url: `${siteUrl}/book?canceled=1`,
    expires_at: Math.floor(Date.now() / 1000) + 600, // 10 minutes — matches hold
  });

  return NextResponse.json({ url: session.url, session_id: session.id });
}
