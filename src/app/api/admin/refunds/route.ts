import { NextRequest, NextResponse } from "next/server";
import { requireSuperadmin } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe";

// GET /api/admin/refunds — list payments eligible for refund
export async function GET(req: NextRequest) {
  const auth = await requireSuperadmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = createServiceClient();
  const search = req.nextUrl.searchParams.get("search") || "";
  const status = req.nextUrl.searchParams.get("status") || "";

  let query = supabase
    .from("payments")
    .select(`
      *,
      lessons(id, starts_at, ends_at, status, booked_by, subjects(name), learners(full_name), tutors(profile_id, profiles(full_name))),
      payer:profiles!payments_payer_id_fkey(full_name),
      refunds(id, amount_cents, reason, created_at)
    `)
    .order("created_at", { ascending: false })
    .limit(50);

  if (status) {
    query = query.eq("status", status);
  }

  const { data: payments, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let filtered = payments || [];
  if (search) {
    const s = search.toLowerCase();
    filtered = filtered.filter((p) => {
      const payerName = (p.payer as { full_name: string } | null)?.full_name?.toLowerCase() || "";
      const learnerName = (p.lessons as { learners: { full_name: string } } | null)?.learners?.full_name?.toLowerCase() || "";
      return payerName.includes(s) || learnerName.includes(s);
    });
  }

  return NextResponse.json({ payments: filtered });
}

// POST /api/admin/refunds — issue a manual refund
export async function POST(req: NextRequest) {
  const auth = await requireSuperadmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { payment_id, amount_cents, reason } = await req.json();

  if (!payment_id || !amount_cents || amount_cents <= 0) {
    return NextResponse.json({ error: "payment_id and positive amount_cents required" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Get payment
  const { data: payment } = await supabase
    .from("payments")
    .select("*")
    .eq("id", payment_id)
    .single();

  if (!payment) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }

  if (!["succeeded", "partially_refunded"].includes(payment.status)) {
    return NextResponse.json({ error: `Cannot refund payment with status: ${payment.status}` }, { status: 400 });
  }

  // Calculate already refunded
  const { data: existingRefunds } = await supabase
    .from("refunds")
    .select("amount_cents")
    .eq("payment_id", payment_id);

  const alreadyRefunded = (existingRefunds || []).reduce((sum, r) => sum + r.amount_cents, 0);
  const maxRefundable = payment.amount_cents - alreadyRefunded;

  if (amount_cents > maxRefundable) {
    return NextResponse.json({
      error: `Refund amount exceeds refundable balance. Max: $${(maxRefundable / 100).toFixed(2)}`,
    }, { status: 400 });
  }

  // Issue Stripe refund
  let stripeRefundId: string | null = null;
  if (payment.stripe_payment_intent_id) {
    try {
      const stripeRefund = await stripe.refunds.create({
        payment_intent: payment.stripe_payment_intent_id,
        amount: amount_cents,
      });
      stripeRefundId = stripeRefund.id;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Stripe refund failed";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  // Record refund
  await supabase.from("refunds").insert({
    payment_id,
    stripe_refund_id: stripeRefundId,
    amount_cents,
    reason: reason || `Manual refund by ${auth.profile.full_name}`,
    policy_applied: { type: "manual", issued_by: auth.profile.id },
  });

  // Update payment status
  const totalRefunded = alreadyRefunded + amount_cents;
  const newStatus = totalRefunded >= payment.amount_cents ? "refunded" : "partially_refunded";
  await supabase.from("payments").update({ status: newStatus }).eq("id", payment_id);

  return NextResponse.json({ success: true, stripe_refund_id: stripeRefundId });
}
