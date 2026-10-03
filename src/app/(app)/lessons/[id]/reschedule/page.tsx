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
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  calculateRefund,
  type CancellationPolicy,
} from "@/lib/refund-policy";
import {
  generateSlots,
  type AvailabilityRule,
  type TimeOff,
  type ExistingLesson,
  type BookingRules,
  type Slot,
} from "@/lib/slots";

interface SlotOption {
  starts_at: string;
  ends_at: string;
  format: string;
}

export default function RescheduleLessonPage() {
  const router = useRouter();
  const params = useParams();
  const lessonId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"info" | "pick">("info");

  // Original lesson data
  const [lessonData, setLessonData] = useState<{
    tutor_id: string;
    learner_id: string;
    subject_id: string;
    tutor_subject_id: string | null;
    starts_at: string;
    ends_at: string;
    format: string;
    focus_notes: string;
    subject_name: string;
    amount_cents: number;
    policy: CancellationPolicy | null;
    duration_min: number;
  } | null>(null);

  // New slot selection
  const [slots, setSlots] = useState<SlotOption[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<SlotOption | null>(null);
  const [focusNotes, setFocusNotes] = useState("");

  const loadLesson = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("lessons")
      .select(
        `*, subjects(name), tutors(cancellation_policy, buffer_minutes, min_notice_hours, booking_window_days, max_lessons_per_day, profiles(time_zone))`
      )
      .eq("id", lessonId)
      .single();

    if (!data || !["confirmed", "held"].includes(data.status)) {
      router.push(`/lessons/${lessonId}`);
      return;
    }

    const durationMin = Math.round(
      (new Date(data.ends_at).getTime() - new Date(data.starts_at).getTime()) /
        60000
    );

    const { data: payment } = await supabase
      .from("payments")
      .select("amount_cents")
      .eq("lesson_id", lessonId)
      .eq("status", "succeeded")
      .single();

    const tutorData = data.tutors as unknown as {
      cancellation_policy: CancellationPolicy;
      buffer_minutes: number;
      min_notice_hours: number;
      booking_window_days: number;
      max_lessons_per_day: number | null;
      profiles: { time_zone: string };
    };

    setLessonData({
      tutor_id: data.tutor_id,
      learner_id: data.learner_id,
      subject_id: data.subject_id,
      tutor_subject_id: data.tutor_subject_id,
      starts_at: data.starts_at,
      ends_at: data.ends_at,
      format: data.format,
      focus_notes: data.focus_notes || "",
      subject_name:
        (data.subjects as unknown as { name: string })?.name || "Lesson",
      amount_cents: payment?.amount_cents ?? 0,
      policy: tutorData?.cancellation_policy ?? null,
      duration_min: durationMin,
    });
    setFocusNotes(data.focus_notes || "");
    setLoading(false);
  }, [lessonId, router]);

  useEffect(() => {
    loadLesson();
  }, [loadLesson]);

  async function loadSlots() {
    if (!lessonData) return;
    setSlotsLoading(true);

    const supabase = createClient();

    const [availRes, timeOffRes, lessonsRes, tutorRes] = await Promise.all([
      supabase
        .from("availability_rules")
        .select("*")
        .eq("tutor_id", lessonData.tutor_id),
      supabase
        .from("time_off")
        .select("*")
        .eq("tutor_id", lessonData.tutor_id)
        .gte("ends_at", new Date().toISOString()),
      supabase
        .from("lessons")
        .select("starts_at, ends_at, status")
        .eq("tutor_id", lessonData.tutor_id)
        .not("status", "in", '("canceled","late_cancel")')
        .gte("starts_at", new Date().toISOString()),
      supabase
        .from("tutors")
        .select(
          "buffer_minutes, min_notice_hours, booking_window_days, max_lessons_per_day, profiles(time_zone)"
        )
        .eq("id", lessonData.tutor_id)
        .single(),
    ]);

    const tutor = tutorRes.data;
    if (!tutor) {
      setSlotsLoading(false);
      return;
    }

    const tz =
      (tutor.profiles as unknown as { time_zone: string })?.time_zone ||
      "America/New_York";

    const generated = generateSlots(
      (availRes.data ?? []) as AvailabilityRule[],
      (timeOffRes.data ?? []) as TimeOff[],
      (lessonsRes.data ?? []) as ExistingLesson[],
      {
        buffer_minutes: tutor.buffer_minutes,
        min_notice_hours: tutor.min_notice_hours,
        booking_window_days: tutor.booking_window_days,
        max_lessons_per_day: tutor.max_lessons_per_day,
      } as BookingRules,
      lessonData.duration_min,
      tz
    );

    setSlots(
      generated.map((s: Slot) => ({
        starts_at: s.starts_at.toISOString(),
        ends_at: s.ends_at.toISOString(),
        format: s.format,
      }))
    );
    setSlotsLoading(false);
  }

  async function handleReschedule() {
    if (!selectedSlot || !lessonData) return;
    setSubmitting(true);
    setError(null);

    // Step 1: Cancel old lesson
    const cancelRes = await fetch(`/api/lessons/${lessonId}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "Rescheduled" }),
    });

    if (!cancelRes.ok) {
      const data = await cancelRes.json();
      setError(data.error || "Failed to cancel original lesson");
      setSubmitting(false);
      return;
    }

    // Step 2: Hold new slot
    const holdRes = await fetch("/api/book/hold", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tutor_id: lessonData.tutor_id,
        learner_id: lessonData.learner_id,
        subject_id: lessonData.subject_id,
        tutor_subject_id: lessonData.tutor_subject_id,
        starts_at: selectedSlot.starts_at,
        ends_at: selectedSlot.ends_at,
        format: selectedSlot.format,
        focus_notes: focusNotes || null,
      }),
    });

    const holdData = await holdRes.json();
    if (!holdRes.ok) {
      setError(holdData.error || "Failed to hold new slot");
      setSubmitting(false);
      return;
    }

    // Step 3: Confirm directly (reschedules don't require new payment if within policy)
    const confirmRes = await fetch("/api/book/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lesson_id: holdData.lesson_id }),
    });

    if (!confirmRes.ok) {
      const data = await confirmRes.json();
      setError(data.error || "Failed to confirm new lesson");
      setSubmitting(false);
      return;
    }

    router.push(`/book/confirmation/${holdData.lesson_id}`);
  }

  if (loading || !lessonData) {
    return (
      <p className="py-12 text-center text-muted-foreground">Loading...</p>
    );
  }

  const originalStart = new Date(lessonData.starts_at);
  const refund =
    lessonData.policy && lessonData.amount_cents > 0
      ? calculateRefund(
          lessonData.policy,
          originalStart,
          lessonData.amount_cents
        )
      : null;

  // Group slots by date
  const slotsByDate = slots.reduce<Record<string, SlotOption[]>>(
    (acc, slot) => {
      const dateKey = new Date(slot.starts_at).toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
      if (!acc[dateKey]) acc[dateKey] = [];
      acc[dateKey].push(slot);
      return acc;
    },
    {}
  );

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Reschedule Lesson</h1>

      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {step === "info" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {lessonData.subject_name}
            </CardTitle>
            <CardDescription>
              Currently scheduled for{" "}
              {originalStart.toLocaleDateString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}{" "}
              at{" "}
              {originalStart.toLocaleTimeString(undefined, {
                hour: "numeric",
                minute: "2-digit",
              })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {refund && refund.charge_amount_cents > 0 && (
              <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 space-y-1">
                <p className="text-sm font-medium text-yellow-800">
                  Late reschedule fee applies
                </p>
                <p className="text-sm text-yellow-700">{refund.reason}</p>
                <p className="text-sm text-yellow-700">
                  Fee: ${(refund.charge_amount_cents / 100).toFixed(2)}
                </p>
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              Rescheduling will cancel the current lesson and book a new one at
              your chosen time. The same duration ({lessonData.duration_min}{" "}
              minutes) and subject will be used.
            </p>
          </CardContent>
          <CardFooter className="flex gap-2">
            <Button variant="outline" onClick={() => router.back()}>
              Go back
            </Button>
            <Button
              className="flex-1"
              onClick={() => {
                setStep("pick");
                loadSlots();
              }}
            >
              Choose new time
            </Button>
          </CardFooter>
        </Card>
      )}

      {step === "pick" && (
        <Card>
          <CardHeader>
            <CardTitle>Pick a new time</CardTitle>
            <CardDescription>
              Available {lessonData.duration_min}-minute slots
            </CardDescription>
          </CardHeader>
          <CardContent>
            {slotsLoading ? (
              <p className="py-8 text-center text-muted-foreground">
                Finding available times...
              </p>
            ) : Object.keys(slotsByDate).length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">
                No available slots found.
              </p>
            ) : (
              <div className="max-h-[400px] space-y-4 overflow-y-auto">
                {Object.entries(slotsByDate).map(([date, dateSlots]) => (
                  <div key={date}>
                    <p className="mb-2 text-sm font-medium text-muted-foreground">
                      {date}
                    </p>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {dateSlots.map((slot, i) => {
                        const isSelected =
                          selectedSlot?.starts_at === slot.starts_at;
                        return (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setSelectedSlot(slot)}
                            className={`rounded-md border px-2 py-2 text-sm transition-colors ${
                              isSelected
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-muted hover:border-primary/50"
                            }`}
                          >
                            {new Date(slot.starts_at).toLocaleTimeString(
                              undefined,
                              { hour: "numeric", minute: "2-digit" }
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {selectedSlot && (
              <div className="mt-4 space-y-3 border-t pt-4">
                <div className="rounded-lg bg-muted/50 p-3">
                  <p className="text-sm">
                    <span className="font-medium">New time: </span>
                    {new Date(selectedSlot.starts_at).toLocaleDateString(
                      undefined,
                      { weekday: "long", month: "long", day: "numeric" }
                    )}{" "}
                    at{" "}
                    {new Date(selectedSlot.starts_at).toLocaleTimeString(
                      undefined,
                      { hour: "numeric", minute: "2-digit" }
                    )}
                  </p>
                </div>
                <Label>Update focus notes (optional)</Label>
                <Textarea
                  value={focusNotes}
                  onChange={(e) => setFocusNotes(e.target.value)}
                  rows={2}
                />
              </div>
            )}
          </CardContent>
          <CardFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setStep("info")}>
              Back
            </Button>
            <Button
              onClick={handleReschedule}
              disabled={!selectedSlot || submitting}
              className="flex-1"
            >
              {submitting ? "Rescheduling..." : "Confirm reschedule"}
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  );
}
