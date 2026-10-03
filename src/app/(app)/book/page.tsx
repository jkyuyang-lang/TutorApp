"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Step = "learner" | "subject" | "duration" | "slot" | "review";

interface Learner {
  id: string;
  full_name: string;
  is_self: boolean;
}

interface TutorSubject {
  id: string;
  subject_id: string;
  levels: string[];
  format: string;
  durations: number[];
  prices: Record<string, number>;
  subjects: { name: string; category: string };
}

interface SlotOption {
  starts_at: string;
  ends_at: string;
  format: string;
}

export default function BookingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("learner");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Data
  const [learners, setLearners] = useState<Learner[]>([]);
  const [tutorSubjects, setTutorSubjects] = useState<TutorSubject[]>([]);
  const [tutorId, setTutorId] = useState<string>("");
  const [slots, setSlots] = useState<SlotOption[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);

  // Selections
  const [selectedLearner, setSelectedLearner] = useState<string>("");
  const [selectedSubject, setSelectedSubject] = useState<string>("");
  const [selectedDuration, setSelectedDuration] = useState<number>(0);
  const [selectedSlot, setSelectedSlot] = useState<SlotOption | null>(null);
  const [focusNotes, setFocusNotes] = useState("");

  // Hold state
  const [holdLessonId, setHoldLessonId] = useState<string | null>(null);
  const [holdExpiresAt, setHoldExpiresAt] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState<number>(0);

  const loadInitialData = useCallback(async () => {
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

    // Get learners
    const { data: learnersData } = await supabase
      .from("learners")
      .select("id, full_name, is_self")
      .eq("account_holder_id", profile.id);

    setLearners(learnersData ?? []);

    // Auto-select if only one learner
    if (learnersData?.length === 1) {
      setSelectedLearner(learnersData[0].id);
    }

    // Get tutor and subjects (MVP: first tutor)
    const { data: tutor } = await supabase
      .from("tutors")
      .select("id")
      .limit(1)
      .single();

    if (tutor) {
      setTutorId(tutor.id);

      const { data: subjects } = await supabase
        .from("tutor_subjects")
        .select("*, subjects(name, category)")
        .eq("tutor_id", tutor.id)
        .eq("active", true);

      setTutorSubjects((subjects as TutorSubject[]) ?? []);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // Fetch slots when duration is selected
  async function loadSlots(durationMinutes: number) {
    setSlotsLoading(true);
    setSlots([]);

    const supabase = createClient();
    const { data: availRules } = await supabase
      .from("availability_rules")
      .select("*")
      .eq("tutor_id", tutorId);

    const { data: timeOffs } = await supabase
      .from("time_off")
      .select("*")
      .eq("tutor_id", tutorId)
      .gte("ends_at", new Date().toISOString());

    const { data: lessons } = await supabase
      .from("lessons")
      .select("starts_at, ends_at, status")
      .eq("tutor_id", tutorId)
      .not("status", "in", '("canceled","late_cancel")')
      .gte("starts_at", new Date().toISOString());

    const { data: tutor } = await supabase
      .from("tutors")
      .select("buffer_minutes, min_notice_hours, booking_window_days, max_lessons_per_day, profiles(time_zone)")
      .eq("id", tutorId)
      .single();

    if (!tutor) {
      setSlotsLoading(false);
      return;
    }

    const profile = tutor.profiles as unknown as { time_zone: string };

    // Import and use slot engine client-side
    const { generateSlots } = await import("@/lib/slots");
    const generated = generateSlots(
      (availRules ?? []).map((r) => ({
        day_of_week: r.day_of_week,
        start_time: r.start_time,
        end_time: r.end_time,
        format: r.format,
      })),
      (timeOffs ?? []).map((t) => ({
        starts_at: t.starts_at,
        ends_at: t.ends_at,
      })),
      (lessons ?? []).map((l) => ({
        starts_at: l.starts_at,
        ends_at: l.ends_at,
        status: l.status,
      })),
      {
        buffer_minutes: tutor.buffer_minutes,
        min_notice_hours: tutor.min_notice_hours,
        booking_window_days: tutor.booking_window_days,
        max_lessons_per_day: tutor.max_lessons_per_day,
      },
      durationMinutes,
      profile.time_zone || "America/New_York"
    );

    setSlots(
      generated.map((s) => ({
        starts_at: s.starts_at.toISOString(),
        ends_at: s.ends_at.toISOString(),
        format: s.format,
      }))
    );
    setSlotsLoading(false);
  }

  // Countdown timer for hold
  useEffect(() => {
    if (!holdExpiresAt) return;
    const interval = setInterval(() => {
      const remaining = Math.max(
        0,
        Math.floor((holdExpiresAt.getTime() - Date.now()) / 1000)
      );
      setCountdown(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
        setError("Your hold has expired. Please start over.");
        setHoldLessonId(null);
        setHoldExpiresAt(null);
        setStep("slot");
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [holdExpiresAt]);

  async function handleHoldAndReview() {
    if (!selectedSlot) return;
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/book/hold", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tutor_id: tutorId,
        learner_id: selectedLearner,
        subject_id: selectedTutorSubject?.subject_id,
        tutor_subject_id: selectedTutorSubject?.id,
        starts_at: selectedSlot.starts_at,
        ends_at: selectedSlot.ends_at,
        format: selectedSlot.format,
        focus_notes: focusNotes || null,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed to hold slot");
      setSubmitting(false);
      return;
    }

    setHoldLessonId(data.lesson_id);
    setHoldExpiresAt(new Date(data.hold_expires_at));
    setStep("review");
    setSubmitting(false);
  }

  async function handleConfirm() {
    if (!holdLessonId) return;
    setSubmitting(true);
    setError(null);

    // Try Stripe checkout first
    const checkoutRes = await fetch("/api/book/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lesson_id: holdLessonId }),
    });

    const checkoutData = await checkoutRes.json();
    if (!checkoutRes.ok) {
      setError(checkoutData.error || "Failed to create checkout");
      setSubmitting(false);
      return;
    }

    // If free lesson, confirm directly
    if (checkoutData.free) {
      const confirmRes = await fetch("/api/book/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lesson_id: holdLessonId }),
      });

      const confirmData = await confirmRes.json();
      if (!confirmRes.ok) {
        setError(confirmData.error || "Failed to confirm booking");
        setSubmitting(false);
        return;
      }

      router.push(`/book/confirmation/${holdLessonId}`);
      return;
    }

    // Redirect to Stripe Checkout
    if (checkoutData.url) {
      window.location.href = checkoutData.url;
    }
  }

  const selectedTutorSubject = tutorSubjects.find(
    (ts) => ts.id === selectedSubject
  );
  const price = selectedTutorSubject?.prices?.[String(selectedDuration)] ?? 0;

  if (loading) {
    return (
      <p className="py-12 text-center text-muted-foreground">Loading...</p>
    );
  }

  // Group slots by date
  const slotsByDate = slots.reduce<Record<string, SlotOption[]>>((acc, slot) => {
    const dateKey = new Date(slot.starts_at).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(slot);
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Book a Lesson</h1>
        <p className="text-muted-foreground">
          Step {stepNumber(step)} of 5 &mdash; {stepLabel(step)}
        </p>
      </div>

      {/* Progress bar */}
      <div className="flex gap-1">
        {(["learner", "subject", "duration", "slot", "review"] as Step[]).map(
          (s, i) => (
            <div
              key={s}
              className={`h-1.5 flex-1 rounded-full ${
                i <= stepIndex(step) ? "bg-primary" : "bg-muted"
              }`}
            />
          )
        )}
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Step 1: Select Learner */}
      {step === "learner" && (
        <Card>
          <CardHeader>
            <CardTitle>Who is this lesson for?</CardTitle>
            <CardDescription>Select the learner for this session.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {learners.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No learners found. Please complete onboarding first.
              </p>
            ) : (
              learners.map((learner) => (
                <button
                  key={learner.id}
                  type="button"
                  onClick={() => setSelectedLearner(learner.id)}
                  className={`w-full rounded-lg border-2 p-4 text-left transition-colors ${
                    selectedLearner === learner.id
                      ? "border-primary bg-primary/5"
                      : "border-muted hover:border-muted-foreground/30"
                  }`}
                >
                  <span className="font-medium">{learner.full_name}</span>
                  {learner.is_self && (
                    <span className="ml-2 text-sm text-muted-foreground">
                      (myself)
                    </span>
                  )}
                </button>
              ))
            )}
          </CardContent>
          <CardFooter>
            <Button
              onClick={() => setStep("subject")}
              disabled={!selectedLearner}
              className="w-full"
            >
              Continue
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Step 2: Select Subject */}
      {step === "subject" && (
        <Card>
          <CardHeader>
            <CardTitle>Choose a subject</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {tutorSubjects.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No subjects available right now.
              </p>
            ) : (
              tutorSubjects.map((ts) => (
                <button
                  key={ts.id}
                  type="button"
                  onClick={() => setSelectedSubject(ts.id)}
                  className={`w-full rounded-lg border-2 p-4 text-left transition-colors ${
                    selectedSubject === ts.id
                      ? "border-primary bg-primary/5"
                      : "border-muted hover:border-muted-foreground/30"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{ts.subjects.name}</span>
                    <Badge variant="outline">{ts.format}</Badge>
                  </div>
                  {ts.levels.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {ts.levels.map((l) => (
                        <Badge key={l} variant="secondary" className="text-xs">
                          {l}
                        </Badge>
                      ))}
                    </div>
                  )}
                </button>
              ))
            )}
          </CardContent>
          <CardFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setStep("learner")}>
              Back
            </Button>
            <Button
              onClick={() => {
                setStep("duration");
                // Auto-select first duration
                const ts = tutorSubjects.find((s) => s.id === selectedSubject);
                if (ts && ts.durations.length === 1) {
                  setSelectedDuration(ts.durations[0]);
                }
              }}
              disabled={!selectedSubject}
              className="flex-1"
            >
              Continue
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Step 3: Select Duration */}
      {step === "duration" && selectedTutorSubject && (
        <Card>
          <CardHeader>
            <CardTitle>Session length</CardTitle>
            <CardDescription>
              Choose how long you&apos;d like the lesson to be.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {selectedTutorSubject.durations.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setSelectedDuration(d)}
                className={`w-full rounded-lg border-2 p-4 text-left transition-colors ${
                  selectedDuration === d
                    ? "border-primary bg-primary/5"
                    : "border-muted hover:border-muted-foreground/30"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{d} minutes</span>
                  {selectedTutorSubject.prices[String(d)] && (
                    <span className="font-semibold">
                      ${selectedTutorSubject.prices[String(d)]}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </CardContent>
          <CardFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setStep("subject")}>
              Back
            </Button>
            <Button
              onClick={() => {
                setStep("slot");
                loadSlots(selectedDuration);
              }}
              disabled={!selectedDuration}
              className="flex-1"
            >
              Continue
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Step 4: Select Slot */}
      {step === "slot" && (
        <Card>
          <CardHeader>
            <CardTitle>Pick a time</CardTitle>
            <CardDescription>
              Available {selectedDuration}-minute slots for{" "}
              {selectedTutorSubject?.subjects.name}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {slotsLoading ? (
              <p className="py-8 text-center text-muted-foreground">
                Finding available times...
              </p>
            ) : Object.keys(slotsByDate).length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">
                No available slots found. Try a different duration or check back
                later.
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
                <Label>Focus notes (optional)</Label>
                <Textarea
                  value={focusNotes}
                  onChange={(e) => setFocusNotes(e.target.value)}
                  placeholder="What would you like to work on in this session?"
                  rows={3}
                />
              </div>
            )}
          </CardContent>
          <CardFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setStep("duration")}>
              Back
            </Button>
            <Button
              onClick={handleHoldAndReview}
              disabled={!selectedSlot || submitting}
              className="flex-1"
            >
              {submitting ? "Reserving..." : "Reserve & Review"}
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Step 5: Review & Confirm */}
      {step === "review" && selectedSlot && selectedTutorSubject && (
        <Card>
          <CardHeader>
            <CardTitle>Review & Confirm</CardTitle>
            {holdExpiresAt && countdown > 0 && (
              <CardDescription>
                Slot held for{" "}
                <span className="font-medium text-foreground">
                  {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, "0")}
                </span>
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-muted/50 p-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Learner</span>
                <span className="font-medium">
                  {learners.find((l) => l.id === selectedLearner)?.full_name}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subject</span>
                <span className="font-medium">
                  {selectedTutorSubject.subjects.name}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Duration</span>
                <span className="font-medium">{selectedDuration} minutes</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Date</span>
                <span className="font-medium">
                  {new Date(selectedSlot.starts_at).toLocaleDateString(
                    undefined,
                    { weekday: "long", month: "long", day: "numeric" }
                  )}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Time</span>
                <span className="font-medium">
                  {new Date(selectedSlot.starts_at).toLocaleTimeString(
                    undefined,
                    { hour: "numeric", minute: "2-digit" }
                  )}{" "}
                  &ndash;{" "}
                  {new Date(selectedSlot.ends_at).toLocaleTimeString(
                    undefined,
                    { hour: "numeric", minute: "2-digit" }
                  )}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Format</span>
                <span className="font-medium capitalize">
                  {selectedSlot.format}
                </span>
              </div>
              {focusNotes && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Focus: </span>
                  <span>{focusNotes}</span>
                </div>
              )}
            </div>

            {price > 0 && (
              <div className="flex items-center justify-between rounded-lg border p-4">
                <span className="font-medium">Total</span>
                <span className="text-xl font-bold">${price}</span>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              By confirming, you agree to the tutor&apos;s cancellation policy.
              {price > 0 && " Payment will be collected separately."}
            </p>
          </CardContent>
          <CardFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                // Cancel the hold
                if (holdLessonId) {
                  fetch("/api/book/confirm", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      lesson_id: holdLessonId,
                      cancel: true,
                    }),
                  });
                }
                setHoldLessonId(null);
                setHoldExpiresAt(null);
                setStep("slot");
              }}
            >
              Back
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={submitting}
              className="flex-1"
            >
              {submitting ? "Confirming..." : "Confirm Booking"}
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  );
}

function stepIndex(step: Step): number {
  return ["learner", "subject", "duration", "slot", "review"].indexOf(step);
}

function stepNumber(step: Step): number {
  return stepIndex(step) + 1;
}

function stepLabel(step: Step): string {
  const labels: Record<Step, string> = {
    learner: "Select learner",
    subject: "Choose subject",
    duration: "Session length",
    slot: "Pick a time",
    review: "Review & confirm",
  };
  return labels[step];
}
