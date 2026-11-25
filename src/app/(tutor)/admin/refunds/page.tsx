"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { paymentStatusColors as statusColors } from "@/lib/status-colors";
import { createClient } from "@/lib/supabase/client";
import { DataTable, type Column } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

interface Payment {
  id: string;
  lesson_id: string;
  payer_id: string;
  amount_cents: number;
  status: string;
  stripe_payment_intent_id: string | null;
  created_at: string;
  lessons: {
    id: string;
    starts_at: string;
    ends_at: string;
    status: string;
    booked_by: string;
    subjects: { name: string } | null;
    learners: { full_name: string } | null;
    tutors: { profile_id: string; profiles: { full_name: string } } | null;
  } | null;
  payer: { full_name: string } | null;
  refunds: Array<{
    id: string;
    amount_cents: number;
    reason: string | null;
    created_at: string;
  }>;
}


export default function AdminRefundsPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // Refund modal
  const [refundTarget, setRefundTarget] = useState<Payment | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [issuing, setIssuing] = useState(false);
  const [refundError, setRefundError] = useState<string | null>(null);

  useEffect(() => {
    async function check() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("user_id", user.id)
        .single();
      if (profile?.role !== "superadmin") { router.push("/dashboard"); return; }
      setAuthorized(true);
    }
    check();
  }, [router]);

  const loadPayments = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (statusFilter) params.set("status", statusFilter);

    const res = await fetch(`/api/admin/refunds?${params}`);
    const data = await res.json();
    if (res.ok) {
      setPayments(data.payments);
    }
    setLoading(false);
  }, [search, statusFilter]);

  useEffect(() => {
    if (authorized) loadPayments();
  }, [authorized, loadPayments]);

  function openRefund(payment: Payment) {
    const alreadyRefunded = payment.refunds.reduce((s, r) => s + r.amount_cents, 0);
    const maxRefundable = payment.amount_cents - alreadyRefunded;
    setRefundTarget(payment);
    setRefundAmount((maxRefundable / 100).toFixed(2));
    setRefundReason("");
    setRefundError(null);
  }

  async function handleRefund(e: React.FormEvent) {
    e.preventDefault();
    if (!refundTarget) return;
    setRefundError(null);
    setIssuing(true);

    const amountCents = Math.round(parseFloat(refundAmount) * 100);
    if (isNaN(amountCents) || amountCents <= 0) {
      setRefundError("Enter a valid refund amount.");
      setIssuing(false);
      return;
    }

    const res = await fetch("/api/admin/refunds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        payment_id: refundTarget.id,
        amount_cents: amountCents,
        reason: refundReason || undefined,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      setRefundError(data.error);
      setIssuing(false);
      return;
    }

    setRefundTarget(null);
    setIssuing(false);
    loadPayments();
  }

  const columns = useMemo<Column<Payment>[]>(() => [
    {
      key: "date",
      label: "Date",
      sortable: true,
      sortValue: (row) => new Date(row.created_at).getTime(),
      render: (row) => (
        <span className="text-muted-foreground">
          {new Date(row.created_at).toLocaleDateString(undefined, {
            month: "short", day: "numeric", year: "numeric",
          })}
        </span>
      ),
    },
    {
      key: "payer",
      label: "Payer",
      sortable: true,
      sortValue: (row) => row.payer?.full_name ?? "",
      render: (row) =>
        row.payer_id ? (
          <Link href={`/admin/users/${row.payer_id}`} className="text-primary underline-offset-2 hover:underline">
            {row.payer?.full_name ?? "—"}
          </Link>
        ) : (row.payer?.full_name ?? "—"),
    },
    {
      key: "learner",
      label: "Learner",
      sortable: true,
      sortValue: (row) => row.lessons?.learners?.full_name ?? "",
      render: (row) =>
        row.lessons?.booked_by ? (
          <Link href={`/admin/users/${row.lessons.booked_by}`} className="text-primary underline-offset-2 hover:underline">
            {row.lessons?.learners?.full_name ?? "—"}
          </Link>
        ) : (row.lessons?.learners?.full_name ?? "—"),
    },
    {
      key: "subject",
      label: "Subject",
      sortable: true,
      sortValue: (row) => row.lessons?.subjects?.name ?? "",
      render: (row) => row.lessons?.subjects?.name ?? "—",
    },
    {
      key: "lesson",
      label: "Lesson",
      sortable: true,
      sortValue: (row) => row.lessons ? new Date(row.lessons.starts_at).getTime() : 0,
      render: (row) => {
        const lessonStart = row.lessons ? new Date(row.lessons.starts_at) : null;
        return (
          <span className="text-muted-foreground">
            {lessonStart
              ? lessonStart.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
                " " +
                lessonStart.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", timeZoneName: "short" })
              : "—"}
          </span>
        );
      },
    },
    {
      key: "amount",
      label: "Amount",
      sortable: true,
      align: "right",
      sortValue: (row) => row.amount_cents,
      cellClassName: "font-bold",
      render: (row) => `$${(row.amount_cents / 100).toFixed(2)}`,
    },
    {
      key: "refunded",
      label: "Refunded",
      sortable: true,
      align: "right",
      sortValue: (row) => row.refunds.reduce((s, r) => s + r.amount_cents, 0),
      cellClassName: "font-bold text-muted-foreground",
      render: (row) => {
        const refunded = row.refunds.reduce((s, r) => s + r.amount_cents, 0);
        return refunded > 0 ? `$${(refunded / 100).toFixed(2)}` : "—";
      },
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      sortValue: (row) => row.status,
      render: (row) => (
        <Badge variant="secondary" className={`text-xs ${statusColors[row.status] || ""}`}>
          {row.status.replace("_", " ")}
        </Badge>
      ),
    },
    {
      key: "action",
      label: "Action",
      sortable: false,
      align: "right",
      render: (row) => {
        const refunded = row.refunds.reduce((s, r) => s + r.amount_cents, 0);
        const canRefund = ["succeeded", "partially_refunded"].includes(row.status) && refunded < row.amount_cents;
        return canRefund ? (
          <Button variant="outline" size="sm" onClick={() => openRefund(row)}>
            Refund
          </Button>
        ) : null;
      },
    },
  ], []);

  if (!authorized) {
    return <p className="py-12 text-center text-muted-foreground">Loading...</p>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Payments & Refunds</h1>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Search by payer or learner name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={statusFilter} onValueChange={(val) => setStatusFilter(val === "all" ? "" : val ?? "")}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="succeeded">Succeeded</SelectItem>
            <SelectItem value="partially_refunded">Partially Refunded</SelectItem>
            <SelectItem value="refunded">Refunded</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Payments Table */}
      {loading ? (
        <p className="py-8 text-center text-muted-foreground">Loading...</p>
      ) : (
        <DataTable<Payment>
          columns={columns}
          data={payments}
          rowKey={(row) => row.id}
          emptyMessage="No payments found."
          defaultSort={{ key: "date", direction: "desc" }}
        />
      )}

      {/* Refund Modal */}
      {refundTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setRefundTarget(null)}>
          <Card className="w-[80vw] max-w-[920px]" onClick={(e) => e.stopPropagation()}>
            <form onSubmit={handleRefund}>
              <CardHeader>
                <CardTitle>Issue Refund</CardTitle>
                <CardDescription>
                  Refund for {refundTarget.payer?.full_name ?? "Unknown"} — ${(refundTarget.amount_cents / 100).toFixed(2)} payment
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {refundError && (
                  <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{refundError}</div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="r-amount" required>Refund amount ($)</Label>
                  <Input
                    id="r-amount"
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Max refundable: ${((refundTarget.amount_cents - refundTarget.refunds.reduce((s, r) => s + r.amount_cents, 0)) / 100).toFixed(2)}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="r-reason">Reason (optional)</Label>
                  <Textarea
                    id="r-reason"
                    value={refundReason}
                    onChange={(e) => setRefundReason(e.target.value)}
                    rows={2}
                    placeholder="e.g., Student requested reschedule"
                  />
                </div>
              </CardContent>
              <CardFooter className="justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setRefundTarget(null)}>Cancel</Button>
                <Button type="submit" disabled={issuing}>
                  {issuing ? "Processing..." : "Issue Refund"}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
