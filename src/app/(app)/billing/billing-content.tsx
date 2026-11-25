"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { DataTable, type Column } from "@/components/data-table";
import { paymentStatusColors as statusColors } from "@/lib/status-colors";
import { formatCurrency, formatShortDate, formatLongDate, formatTimeRange } from "@/lib/format";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface PaymentRow {
  id: string;
  amount_cents: number;
  currency: string;
  status: string;
  created_at: string;
  subject_name: string;
  learner_name: string;
  lesson_starts_at: string | null;
  lesson_ends_at: string | null;
  lesson_format: string | null;
  tutor_name: string | null;
}

interface RefundRow {
  id: string;
  amount_cents: number;
  reason: string | null;
  created_at: string;
}

interface CreditRow {
  id: string;
  amount_cents: number;
  reason: string | null;
  expires_at: string | null;
}

interface BillingContentProps {
  isTutor: boolean;
  totalPaid: number;
  totalRefunded: number;
  totalCredits: number;
  payments: PaymentRow[];
  refunds: RefundRow[];
  credits: CreditRow[];
}

export function BillingContent({
  isTutor,
  totalPaid,
  totalRefunded,
  totalCredits,
  payments,
  refunds,
  credits,
}: BillingContentProps) {
  const [selectedPayment, setSelectedPayment] = useState<PaymentRow | null>(null);

  const paymentColumns: Column<PaymentRow>[] = useMemo(() => [
    {
      key: "subject",
      label: "Subject",
      sortable: true,
      sortValue: (p) => p.subject_name,
      render: (p) => p.subject_name,
    },
    {
      key: "learner",
      label: "Learner",
      sortable: true,
      sortValue: (p) => p.learner_name,
      cellClassName: "text-muted-foreground",
      render: (p) => p.learner_name,
    },
    {
      key: "date",
      label: "Date",
      sortable: true,
      sortValue: (p) => new Date(p.created_at).getTime(),
      cellClassName: "text-muted-foreground",
      render: (p) => p.lesson_starts_at ? formatShortDate(p.lesson_starts_at) : formatShortDate(p.created_at),
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      sortValue: (p) => p.status,
      render: (p) => (
        <Badge variant="secondary" className={`text-xs ${statusColors[p.status] || ""}`}>
          {p.status.replace("_", " ")}
        </Badge>
      ),
    },
    {
      key: "amount",
      label: "Amount",
      sortable: true,
      align: "right" as const,
      sortValue: (p) => p.amount_cents,
      cellClassName: "font-bold",
      render: (p) => formatCurrency(p.amount_cents),
    },
  ], []);

  const refundColumns: Column<RefundRow>[] = useMemo(() => [
    {
      key: "reason",
      label: "Reason",
      sortable: true,
      sortValue: (r) => r.reason || "",
      render: (r) => r.reason || "No reason provided",
    },
    {
      key: "date",
      label: "Date",
      sortable: true,
      sortValue: (r) => new Date(r.created_at).getTime(),
      cellClassName: "text-muted-foreground",
      render: (r) => formatShortDate(r.created_at),
    },
    {
      key: "amount",
      label: "Amount",
      sortable: true,
      align: "right" as const,
      sortValue: (r) => r.amount_cents,
      cellClassName: "font-bold",
      render: (r) => formatCurrency(r.amount_cents),
    },
  ], []);

  const creditColumns: Column<CreditRow>[] = useMemo(() => [
    {
      key: "reason",
      label: "Reason",
      sortable: true,
      sortValue: (c) => c.reason || "",
      render: (c) => c.reason || "Account credit",
    },
    {
      key: "expires",
      label: "Expires",
      sortable: true,
      sortValue: (c) => c.expires_at ? new Date(c.expires_at).getTime() : 0,
      cellClassName: "text-muted-foreground",
      render: (c) => c.expires_at ? formatShortDate(c.expires_at) : "—",
    },
    {
      key: "amount",
      label: "Amount",
      sortable: true,
      align: "right" as const,
      sortValue: (c) => c.amount_cents,
      cellClassName: "font-bold",
      render: (c) => formatCurrency(c.amount_cents),
    },
  ], []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">
        {isTutor ? "Earnings & Billing" : "Billing & Receipts"}
      </h1>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              {isTutor ? "Total Earned" : "Total Paid"}
            </p>
            <p className="text-2xl font-bold">{formatCurrency(totalPaid)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total Refunded</p>
            <p className="text-2xl font-bold text-orange-600">
              {formatCurrency(totalRefunded)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              {isTutor ? "Net Earnings" : "Credits Available"}
            </p>
            <p className="text-2xl font-bold">
              {formatCurrency(isTutor ? totalPaid - totalRefunded : totalCredits)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Separator />

      {/* Payment history */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">
          {isTutor ? "Payment History" : "Receipts"}
        </h2>
        <DataTable
          columns={paymentColumns}
          data={payments}
          rowKey={(p) => p.id}
          onRowClick={(p) => setSelectedPayment(p)}
          defaultSort={{ key: "date", direction: "desc" }}
          emptyMessage="No payments yet."
        />
      </section>

      {/* Refunds */}
      {refunds.length > 0 && (
        <>
          <Separator />
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Refunds</h2>
            <DataTable
              columns={refundColumns}
              data={refunds}
              rowKey={(r) => r.id}
              defaultSort={{ key: "date", direction: "desc" }}
              emptyMessage="No refunds."
            />
          </section>
        </>
      )}

      {/* Credits (client only) */}
      {!isTutor && credits.length > 0 && (
        <>
          <Separator />
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Credits</h2>
            <DataTable
              columns={creditColumns}
              data={credits}
              rowKey={(c) => c.id}
              defaultSort={{ key: "expires", direction: "desc" }}
              emptyMessage="No credits."
            />
          </section>
        </>
      )}

      {/* Payment detail modal */}
      <Dialog open={!!selectedPayment} onOpenChange={(open) => { if (!open) setSelectedPayment(null); }}>
        <DialogContent>
          {selectedPayment && (
            <>
              <DialogHeader>
                <DialogTitle>Payment Details</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <DetailRow label="Subject" value={selectedPayment.subject_name} />
                <DetailRow label="Learner" value={selectedPayment.learner_name} />
                {selectedPayment.tutor_name && (
                  <DetailRow label="Tutor" value={selectedPayment.tutor_name} />
                )}
                {selectedPayment.lesson_starts_at && (
                  <DetailRow
                    label="Lesson Date"
                    value={formatLongDate(selectedPayment.lesson_starts_at)}
                  />
                )}
                {selectedPayment.lesson_starts_at && selectedPayment.lesson_ends_at && (
                  <DetailRow
                    label="Lesson Time"
                    value={formatTimeRange(selectedPayment.lesson_starts_at, selectedPayment.lesson_ends_at)}
                  />
                )}
                {selectedPayment.lesson_format && (
                  <DetailRow
                    label="Format"
                    value={selectedPayment.lesson_format.charAt(0).toUpperCase() + selectedPayment.lesson_format.slice(1)}
                  />
                )}
                <DetailRow
                  label="Status"
                  value={
                    <Badge variant="secondary" className={`text-xs ${statusColors[selectedPayment.status] || ""}`}>
                      {selectedPayment.status.replace("_", " ")}
                    </Badge>
                  }
                />
                <DetailRow
                  label="Payment Date"
                  value={formatLongDate(selectedPayment.created_at)}
                />
                <Separator />
                <DetailRow
                  label="Amount"
                  value={
                    <span className="text-base font-bold">
                      {formatCurrency(selectedPayment.amount_cents)}
                    </span>
                  }
                />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
