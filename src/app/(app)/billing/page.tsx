import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export default async function BillingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("user_id", user.id)
    .single();
  if (!profile) redirect("/onboarding");

  const isTutor = profile.role === "tutor";
  let tutorId: string | null = null;
  if (isTutor) {
    const { data: tutor } = await supabase
      .from("tutors").select("id").eq("profile_id", profile.id).single();
    tutorId = tutor?.id ?? null;
  }

  // Fetch payments
  const paymentQuery = supabase
    .from("payments")
    .select(`
      id, amount_cents, currency, status, created_at,
      lessons(starts_at, subjects(name), learners(full_name))
    `)
    .order("created_at", { ascending: false })
    .limit(50);

  if (isTutor && tutorId) {
    paymentQuery.eq("tutor_id", tutorId);
  } else {
    paymentQuery.eq("payer_id", profile.id);
  }

  const { data: payments } = await paymentQuery;

  // Fetch refunds
  const refundQuery = supabase
    .from("refunds")
    .select(`
      id, amount_cents, reason, created_at,
      payments(lesson_id, lessons(subjects(name)))
    `)
    .order("created_at", { ascending: false })
    .limit(20);

  // For clients, get refunds through their payments
  const { data: refunds } = isTutor && tutorId
    ? await supabase
        .from("refunds")
        .select("id, amount_cents, reason, created_at, payments(tutor_id, lesson_id, lessons(subjects(name)))")
        .order("created_at", { ascending: false })
        .limit(20)
    : await refundQuery;

  // Calculate totals
  const totalPaid = (payments ?? [])
    .filter((p) => p.status === "succeeded" || p.status === "partially_refunded")
    .reduce((sum, p) => sum + p.amount_cents, 0);

  const totalRefunded = (refunds ?? [])
    .reduce((sum, r) => sum + r.amount_cents, 0);

  // Fetch credits
  const creditQuery = supabase
    .from("credits")
    .select("*")
    .is("used_at", null)
    .order("created_at", { ascending: false });

  if (isTutor && tutorId) {
    creditQuery.eq("tutor_id", tutorId);
  } else {
    creditQuery.eq("account_holder_id", profile.id);
  }

  const { data: credits } = await creditQuery;
  const totalCredits = (credits ?? []).reduce((sum, c) => sum + c.amount_cents, 0);

  const statusColors: Record<string, string> = {
    succeeded: "bg-green-100 text-green-800",
    pending: "bg-yellow-100 text-yellow-800",
    failed: "bg-red-100 text-red-800",
    refunded: "bg-gray-100 text-gray-800",
    partially_refunded: "bg-orange-100 text-orange-800",
  };

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
            <p className="text-2xl font-bold">
              ${(totalPaid / 100).toFixed(2)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total Refunded</p>
            <p className="text-2xl font-bold text-orange-600">
              ${(totalRefunded / 100).toFixed(2)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              {isTutor ? "Net Earnings" : "Credits Available"}
            </p>
            <p className="text-2xl font-bold">
              ${(isTutor ? (totalPaid - totalRefunded) / 100 : totalCredits / 100).toFixed(2)}
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
        {!payments || payments.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              No payments yet.
            </CardContent>
          </Card>
        ) : (
          payments.map((payment) => {
            const lesson = payment.lessons as unknown as {
              starts_at: string;
              subjects: { name: string };
              learners: { full_name: string };
            };

            return (
              <Card key={payment.id}>
                <CardContent className="flex items-center justify-between p-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">
                        {lesson?.subjects?.name || "Lesson"}
                      </span>
                      <Badge
                        variant="secondary"
                        className={`text-xs ${statusColors[payment.status] || ""}`}
                      >
                        {payment.status.replace("_", " ")}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {lesson?.learners?.full_name} &middot;{" "}
                      {lesson?.starts_at
                        ? new Date(lesson.starts_at).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })
                        : "—"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">
                      ${(payment.amount_cents / 100).toFixed(2)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(payment.created_at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </section>

      {/* Refunds */}
      {refunds && refunds.length > 0 && (
        <>
          <Separator />
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Refunds</h2>
            {refunds.map((refund) => (
              <Card key={refund.id}>
                <CardContent className="flex items-center justify-between p-4">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">
                      Refund &middot; ${(refund.amount_cents / 100).toFixed(2)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {refund.reason || "No reason provided"}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(refund.created_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </CardContent>
              </Card>
            ))}
          </section>
        </>
      )}

      {/* Credits (client only) */}
      {!isTutor && credits && credits.length > 0 && (
        <>
          <Separator />
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Credits</h2>
            {credits.map((credit) => (
              <Card key={credit.id}>
                <CardContent className="flex items-center justify-between p-4">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">
                      ${(credit.amount_cents / 100).toFixed(2)} credit
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {credit.reason || "Account credit"}
                    </p>
                  </div>
                  <div className="text-right">
                    {credit.expires_at && (
                      <p className="text-xs text-muted-foreground">
                        Expires{" "}
                        {new Date(credit.expires_at).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
