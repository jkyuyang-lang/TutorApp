/**
 * Refund policy engine.
 * Calculates refund amount based on tutor's cancellation policy and timing.
 */

export interface CancellationPolicy {
  full_refund_hours: number;
  partial_refund_pct: number;
  no_show_charge_pct: number;
}

export interface RefundResult {
  refund_pct: number;
  refund_amount_cents: number;
  charge_amount_cents: number;
  reason: string;
}

/**
 * Calculate the refund for a cancellation.
 *
 * @param policy - Tutor's cancellation policy
 * @param lessonStartsAt - When the lesson is scheduled to start
 * @param canceledAt - When the cancellation is happening (defaults to now)
 * @param amountCents - Original payment amount in cents
 * @param isNoShow - Whether this is a no-show (tutor marking student absent)
 */
export function calculateRefund(
  policy: CancellationPolicy,
  lessonStartsAt: Date,
  amountCents: number,
  canceledAt?: Date,
  isNoShow?: boolean
): RefundResult {
  if (amountCents <= 0) {
    return {
      refund_pct: 100,
      refund_amount_cents: 0,
      charge_amount_cents: 0,
      reason: "No payment was made",
    };
  }

  if (isNoShow) {
    const chargePct = policy.no_show_charge_pct;
    const chargeAmount = Math.round((amountCents * chargePct) / 100);
    return {
      refund_pct: 100 - chargePct,
      refund_amount_cents: amountCents - chargeAmount,
      charge_amount_cents: chargeAmount,
      reason: `No-show: ${chargePct}% charged`,
    };
  }

  const now = canceledAt ?? new Date();
  const hoursUntilLesson =
    (lessonStartsAt.getTime() - now.getTime()) / (1000 * 60 * 60);

  if (hoursUntilLesson >= policy.full_refund_hours) {
    return {
      refund_pct: 100,
      refund_amount_cents: amountCents,
      charge_amount_cents: 0,
      reason: `Canceled ${Math.floor(hoursUntilLesson)}h before lesson (>${policy.full_refund_hours}h): full refund`,
    };
  }

  // Late cancel — partial refund
  const refundPct = policy.partial_refund_pct;
  const refundAmount = Math.round((amountCents * refundPct) / 100);
  return {
    refund_pct: refundPct,
    refund_amount_cents: refundAmount,
    charge_amount_cents: amountCents - refundAmount,
    reason: `Canceled ${Math.floor(hoursUntilLesson)}h before lesson (<${policy.full_refund_hours}h): ${refundPct}% refund`,
  };
}

/**
 * Get a human-readable preview of the refund policy outcome.
 */
export function getRefundPreview(
  policy: CancellationPolicy,
  lessonStartsAt: Date,
  amountCents: number
): RefundResult {
  return calculateRefund(policy, lessonStartsAt, amountCents);
}
