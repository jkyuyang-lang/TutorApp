export interface CancellationPolicyData {
  full_refund_hours: number;
  partial_refund_pct: number;
  no_show_charge_pct: number;
}

export interface CancellationPolicySectionProps {
  policy: CancellationPolicyData;
  label?: string;
  title?: string;
  subtitle?: string;
  fullRefundLabel?: string;
  partialRefundLabel?: string;
  noShowLabel?: string;
}

export function CancellationPolicy({
  policy,
  label = "Policies",
  title = "Cancellation Policy",
  subtitle = "Life happens. Here\u2019s how cancellations and refunds work:",
  fullRefundLabel = "Full refund",
  partialRefundLabel = "Partial refund",
  noShowLabel = "No-show charge",
}: CancellationPolicySectionProps) {
  return (
    <section className="fh-section-dark">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <p className="fh-label text-gold-300 mb-3">{label}</p>
        <h2 className="text-3xl font-bold text-white sm:text-4xl">{title}</h2>
        <p className="mt-2 text-gold-100/60">{subtitle}</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl bg-navy-800 p-6 text-center ring-1 ring-white/10 space-y-1">
            <p className="text-3xl font-bold text-green-400">100%</p>
            <p className="text-sm font-bold text-white">{fullRefundLabel}</p>
            <p className="text-xs text-gold-100/50">{policy.full_refund_hours}+ hours before</p>
          </div>
          <div className="rounded-xl bg-navy-800 p-6 text-center ring-1 ring-white/10 space-y-1">
            <p className="text-3xl font-bold text-gold-300">{policy.partial_refund_pct}%</p>
            <p className="text-sm font-bold text-white">{partialRefundLabel}</p>
            <p className="text-xs text-gold-100/50">Under {policy.full_refund_hours} hours</p>
          </div>
          <div className="rounded-xl bg-navy-800 p-6 text-center ring-1 ring-white/10 space-y-1">
            <p className="text-3xl font-bold text-coral-400">{policy.no_show_charge_pct}%</p>
            <p className="text-sm font-bold text-white">{noShowLabel}</p>
            <p className="text-xs text-gold-100/50">Missed without notice</p>
          </div>
        </div>
      </div>
    </section>
  );
}
