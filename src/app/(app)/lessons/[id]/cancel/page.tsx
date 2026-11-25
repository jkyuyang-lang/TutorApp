"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  calculateRefund,
  type CancellationPolicy,
} from "@/lib/refund-policy";
import { LoadingPlaceholder } from "@/components/loading-placeholder";

interface LessonData {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  subject_name: string;
  learner_name: string;
  amount_cents: number;
  policy: CancellationPolicy | null;
}

export default function CancelLessonPage() {
  const router = useRouter();
  const params = useParams();
  const lessonId = params.id as string;

  const [lesson, setLesson] = useState<LessonData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loadLesson = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .single();
    if (!profile) return;

    const { data } = await supabase
      .from("lessons")
      .select(
        `*, subjects(name), learners(full_name), tutors(cancellation_policy)`
      )
      .eq("id", lessonId)
      .single();

    if (!data) {
      router.push("/lessons");
      return;
    }

    // Get payment amount
    const { data: payment } = await supabase
      .from("payments")
      .select("amount_cents")
      .eq("lesson_id", lessonId)
      .eq("status", "succeeded")
      .single();

    setLesson({
      id: data.id,
      starts_at: data.starts_at,
      ends_at: data.ends_at,
      status: data.status,
      subject_name:
        (data.subjects as unknown as { name: string })?.name || "Lesson",
      learner_name:
        (data.learners as unknown as { full_name: string })?.full_name || "",
      amount_cents: payment?.amount_cents ?? 0,
      policy:
        (
          data.tutors as unknown as {
            cancellation_policy: CancellationPolicy;
          }
        )?.cancellation_policy ?? null,
    });
    setLoading(false);
  }, [lessonId, router]);

  useEffect(() => {
    loadLesson();
  }, [loadLesson]);

  async function handleCancel() {
    setSubmitting(true);
    setError(null);

    const res = await fetch(`/api/lessons/${lessonId}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });

    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed to cancel lesson");
      setSubmitting(false);
      return;
    }

    router.push(`/lessons/${lessonId}`);
    router.refresh();
  }

  if (loading || !lesson) {
    return <LoadingPlaceholder />;
  }

  if (["canceled", "late_cancel", "completed"].includes(lesson.status)) {
    router.push(`/lessons/${lessonId}`);
    return null;
  }

  const start = new Date(lesson.starts_at);
  const refund =
    lesson.policy && lesson.amount_cents > 0
      ? calculateRefund(lesson.policy, start, lesson.amount_cents)
      : null;

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-2xl font-bold">Cancel Lesson</h1>

      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{lesson.subject_name}</CardTitle>
          <CardDescription>
            {start.toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}{" "}
            at{" "}
            {start.toLocaleTimeString(undefined, {
              hour: "numeric",
              minute: "2-digit",
              timeZoneName: "short",
            })}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {refund && (
            <div className="rounded-lg bg-muted/50 p-4 space-y-2">
              <p className="text-sm font-medium">Refund details</p>
              <p className="text-sm text-muted-foreground">{refund.reason}</p>
              <div className="flex justify-between text-sm">
                <span>Original payment</span>
                <span className="font-bold">${(lesson.amount_cents / 100).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm font-medium">
                <span>Refund amount</span>
                <span className="font-bold text-green-600">
                  +${(refund.refund_amount_cents / 100).toFixed(2)}
                </span>
              </div>
              {refund.charge_amount_cents > 0 && (
                <div className="flex justify-between text-sm">
                  <span>Cancellation fee</span>
                  <span className="font-bold text-destructive">
                    ${(refund.charge_amount_cents / 100).toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          )}

          {!refund && lesson.amount_cents === 0 && (
            <p className="text-sm text-muted-foreground">
              No payment was made for this lesson.
            </p>
          )}

          <div className="space-y-2">
            <Label>Reason for cancellation (optional)</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Let the tutor know why you're canceling..."
              rows={3}
            />
          </div>
        </CardContent>
        <CardFooter className="flex gap-2">
          <Button variant="outline" onClick={() => router.back()}>
            Keep lesson
          </Button>
          <Button
            variant="destructive"
            onClick={handleCancel}
            disabled={submitting}
            className="flex-1"
          >
            {submitting ? "Canceling..." : "Confirm cancellation"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
