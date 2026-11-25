"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { GradeLevelSelect } from "@/components/grade-level-select";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

type Step = "subject" | "slot" | "learner" | "review";

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
  const searchParams = useSearchParams();
  const [step, setStep] = useState<Step>("subject");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Data
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);
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
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [calendarMonthOffset, setCalendarMonthOffset] = useState(0);
  const [focusNotes, setFocusNotes] = useState("");

  // Add learner inline
  const [showAddLearner, setShowAddLearner] = useState(false);
  const [newLearnerName, setNewLearnerName] = useState("");
  const [newLearnerGrade, setNewLearnerGrade] = useState("");
  const [addingLearner, setAddingLearner] = useState(false);

  // Hold state
  const [holdLessonId, setHoldLessonId] = useState<string | null>(null);
  const [holdExpiresAt, setHoldExpiresAt] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState<number>(0);

  // Payment state
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [isFreeLesson, setIsFreeLesson] = useState(false);

  // Track whether we need to restore slots after tutorId loads
  const [pendingRestore, setPendingRestore] = useState<{ duration: number } | null>(null);
  // Track auth-dependent step to apply after login confirmed
  const [pendingStep, setPendingStep] = useState<Step | null>(null);

  // Restore booking state from sessionStorage (survives auth redirects)
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("bookingState");
      if (!saved) return;
      const state = JSON.parse(saved);
      if (state.selectedSubject) setSelectedSubject(state.selectedSubject);
      if (state.selectedDuration) setSelectedDuration(state.selectedDuration);
      if (state.selectedSlot) setSelectedSlot(state.selectedSlot);
      if (state.selectedDate) setSelectedDate(state.selectedDate);
      if (state.focusNotes) setFocusNotes(state.focusNotes);
      // Only restore steps that don't require auth immediately;
      // auth-dependent steps (learner, review) are deferred to loadInitialData
      if (state.step === "subject" || state.step === "slot") {
        setStep(state.step);
      } else if (state.step === "learner" || state.step === "review") {
        setPendingStep(state.step);
      }
      if (state.selectedDuration) setPendingRestore({ duration: state.selectedDuration });
      sessionStorage.removeItem("bookingState");
    } catch {}
  }, []);

  // Reload slots once tutorId is available after restore
  useEffect(() => {
    if (tutorId && pendingRestore) {
      loadSlotsForTutor(tutorId, pendingRestore.duration);
      setPendingRestore(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tutorId, pendingRestore]);

  // Save booking state before auth redirect
  function saveBookingState() {
    try {
      sessionStorage.setItem(
        "bookingState",
        JSON.stringify({
          selectedSubject,
          selectedDuration,
          selectedSlot,
          selectedDate,
          focusNotes,
          tutorId,
          step: "learner",
        })
      );
    } catch {}
  }

  const loadInitialData = useCallback(async () => {
    const supabase = createClient();

    // Use tutor_id from query params (UUID or slug), or fall back to first tutor
    const paramTutorId = searchParams.get("tutor_id");
    let tutorQuery = supabase.from("tutors").select("id");
    if (paramTutorId) {
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(paramTutorId);
      tutorQuery = tutorQuery.eq(isUUID ? "id" : "slug", paramTutorId);
    } else {
      tutorQuery = tutorQuery.limit(1);
    }
    const { data: tutor } = await tutorQuery.single();

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

    // Load user-specific data if logged in and email verified
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user && user.email_confirmed_at) {
      // Use server-side API to find or create profile (bypasses RLS issues)
      const profileRes = await fetch("/api/auth/ensure-profile", { method: "POST" });
      if (!profileRes.ok) {
        console.error("Failed to ensure profile");
        return;
      }
      const { profile_id, learners: learnersData } = await profileRes.json();

      setProfileId(profile_id);
      setIsAuthenticated(true);
      setLearners(learnersData ?? []);
      if (learnersData?.length === 1) {
        setSelectedLearner(learnersData[0].id);
      }

      // Apply deferred step now that auth is confirmed
      setPendingStep((prev) => {
        if (prev) setStep(prev);
        return null;
      });
    }
  }, [searchParams, router]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // Fetch slots via API (works for both authenticated and anonymous users)
  async function loadSlotsForTutor(forTutorId: string, durationMinutes: number) {
    setSlotsLoading(true);
    setSlots([]);
    setSelectedSlot(null);

    try {
      const res = await fetch(`/api/slots?tutor_id=${forTutorId}&duration=${durationMinutes}`, { cache: "no-store" });
      const data = await res.json();
      setSlots(data.slots ?? []);
    } catch {
      setSlots([]);
    }
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
        setStep("subject");
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [holdExpiresAt]);

  async function handleAddLearner() {
    if (!newLearnerName.trim()) return;
    setAddingLearner(true);
    setError(null);
    if (!profileId) { setAddingLearner(false); return; }

    const supabase = createClient();
    const { data: newLearner, error: insertErr } = await supabase
      .from("learners")
      .insert({
        account_holder_id: profileId,
        full_name: newLearnerName.trim(),
        grade_level: newLearnerGrade.trim() || null,
        is_self: false,
      })
      .select("id, full_name, is_self")
      .single();

    if (insertErr) {
      setError(insertErr.message);
      setAddingLearner(false);
      return;
    }

    if (newLearner) {
      setLearners((prev) => [...prev, newLearner]);
      setSelectedLearner(newLearner.id);
      setNewLearnerName("");
      setNewLearnerGrade("");
      setShowAddLearner(false);
    }
    setAddingLearner(false);
  }

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
    setClientSecret(null);
    setIsFreeLesson(false);
    setStep("review");
    setSubmitting(false);
  }

  // Initialize payment when we enter review step with a hold
  useEffect(() => {
    if (step === "review" && holdLessonId && !clientSecret && !isFreeLesson) {
      initPayment();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, holdLessonId]);

  // Create payment intent when entering review step
  async function initPayment() {
    if (!holdLessonId) return;
    setError(null);

    try {
      const res = await fetch("/api/book/create-payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lesson_id: holdLessonId }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to initialize payment");
        return;
      }

      if (data.free) {
        setIsFreeLesson(true);
      } else {
        setClientSecret(data.clientSecret);
      }
    } catch {
      setError("Failed to connect to payment service. Please try again.");
    }
  }

  async function handleFreeConfirm() {
    if (!holdLessonId) return;
    setSubmitting(true);
    setError(null);

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
  }

  const selectedTutorSubject = tutorSubjects.find(
    (ts) => ts.id === selectedSubject
  );
  const price = selectedTutorSubject?.prices?.[String(selectedDuration)] ?? 0;

  // Available durations for the selected subject
  const availableDurations = selectedTutorSubject?.durations ?? [];

  if (loading) {
    return (
      <p className="py-12 text-center text-muted-foreground">Loading...</p>
    );
  }

  // Group slots by ISO date key (YYYY-MM-DD)
  const slotsByDate = slots.reduce<Record<string, SlotOption[]>>((acc, slot) => {
    const d = new Date(slot.starts_at);
    const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(slot);
    return acc;
  }, {});

  // Available dates for the calendar
  const availableDates = new Set(Object.keys(slotsByDate));

  return (
    <div className="space-y-6">
      {step !== "subject" && (
        <button
          type="button"
          onClick={() => {
            if (step === "slot") setStep("subject");
            else if (step === "learner") setStep("slot");
            else if (step === "review") setStep("learner");
          }}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          Back
        </button>
      )}
      <div>
        <h1 className="text-2xl font-bold">Find a Tutor</h1>
        <p className="text-muted-foreground">
          Step {stepNumber(step)} of 4 &mdash; {stepLabel(step)}
        </p>
        <p className="text-xs text-muted-foreground">
          Times shown in {Intl.DateTimeFormat().resolvedOptions().timeZone.replace(/_/g, " ")} timezone
        </p>
      </div>

      {/* Progress bar */}
      <div className="flex gap-1">
        {(["subject", "slot", "learner", "review"] as Step[]).map(
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

      {/* Step 1: Select Subject */}
      {step === "subject" && (
        <Card>
          <CardHeader>
            <CardTitle>Choose a subject</CardTitle>
            <CardDescription>
              What would you like to study?
            </CardDescription>
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
                  onClick={() => {
                    setSelectedSubject(ts.id);
                    // Auto-select first duration if not already valid
                    if (!ts.durations.includes(selectedDuration)) {
                      setSelectedDuration(ts.durations.includes(60) ? 60 : (ts.durations[0] ?? 60));
                    }
                  }}
                  className={`w-full rounded-lg border-2 p-4 text-left transition-colors ${
                    selectedSubject === ts.id
                      ? "border-gold-400 bg-gold-400/20"
                      : "border-muted hover:bg-gold-400/10 hover:border-gold-400/30"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{ts.subjects.name}</span>
                  </div>
                  {ts.levels.length > 0 && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {ts.levels.join(", ")}
                    </p>
                  )}
                </button>
              ))
            )}
          </CardContent>
          <CardFooter>
            <Button
              onClick={() => {
                setSelectedSlot(null);
                setSelectedDate(null);
                const durations = selectedTutorSubject?.durations ?? [60];
                const dur = selectedDuration || (durations.includes(60) ? 60 : durations[0]);
                setSelectedDuration(dur);
                if (tutorId) loadSlotsForTutor(tutorId, dur);
                setStep("slot");
              }}
              disabled={!selectedSubject}
              size="md" className="w-full"
            >
              Continue
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Step 2: Pick a time — Calendar View */}
      {step === "slot" && (
        <Card>
          <CardHeader>
            <CardTitle>Pick a time</CardTitle>
            <CardDescription>
              {selectedTutorSubject?.subjects.name} &mdash; choose your session length, then select a date and time.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Duration selector */}
            <div className="flex items-center gap-3">
              <Label className="shrink-0 text-sm">Duration</Label>
              <div className="flex gap-2">
                {availableDurations.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      setSelectedDuration(d);
                      setSelectedSlot(null);
                      setSelectedDate(null);
                      if (tutorId) loadSlotsForTutor(tutorId, d);
                    }}
                    className={`rounded-lg border-2 px-3 py-1.5 text-sm transition-colors ${
                      selectedDuration === d
                        ? "border-gold-400 bg-gold-400/20"
                        : "border-muted hover:bg-gold-400/10 hover:border-gold-400/30"
                    }`}
                  >
                    {d} min
                    {selectedTutorSubject?.prices[String(d)] != null && (
                      <span className="ml-1 text-xs font-bold opacity-75">
                        ${selectedTutorSubject.prices[String(d)]}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {slotsLoading ? (
              <p className="py-8 text-center text-muted-foreground">
                Finding available times...
              </p>
            ) : Object.keys(slotsByDate).length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">
                No available slots found. Try a different duration or check back later.
              </p>
            ) : (
              <div className="space-y-4">
                {/* Month calendar */}
                <MiniCalendar
                  monthOffset={calendarMonthOffset}
                  onMonthChange={setCalendarMonthOffset}
                  availableDates={availableDates}
                  selectedDate={selectedDate}
                  onSelectDate={(d) => {
                    setSelectedDate(d);
                    setSelectedSlot(null);
                  }}
                />

                {/* Time slots for selected date */}
                {selectedDate && slotsByDate[selectedDate] && (
                  <div>
                    <p className="mb-2 text-sm font-medium text-muted-foreground">
                      {new Date(selectedDate + "T00:00:00").toLocaleDateString(undefined, {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                      })}
                    </p>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {slotsByDate[selectedDate].map((slot, i) => {
                        const isSelected = selectedSlot?.starts_at === slot.starts_at;
                        return (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setSelectedSlot(slot)}
                            className={`rounded-lg border-2 px-2 py-2 text-sm transition-colors ${
                              isSelected
                                ? "border-gold-400 bg-gold-400/20"
                                : "border-muted hover:bg-gold-400/10 hover:border-gold-400/30"
                            }`}
                          >
                            {new Date(slot.starts_at).toLocaleTimeString(undefined, {
                              hour: "numeric",
                              minute: "2-digit",
                              timeZoneName: "short",
                            })}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {selectedDate && !slotsByDate[selectedDate] && (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    No available times on this date.
                  </p>
                )}
              </div>
            )}

            {selectedSlot && (
              <div className="space-y-3 border-t pt-4">
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
            {isAuthenticated ? (
              <Button
                onClick={() => setStep("learner")}
                disabled={!selectedSlot}
                size="md" className="flex-1"
              >
                Continue
              </Button>
            ) : (
              <Button
                onClick={() => {
                  saveBookingState();
                  const paramTutorId = searchParams.get("tutor_id");
                  const bookUrl = paramTutorId ? `/book?tutor_id=${paramTutorId}` : "/book";
                  router.push(`/signup?redirect=${encodeURIComponent(bookUrl)}`);
                }}
                disabled={!selectedSlot}
                size="md" className="flex-1"
              >
                Sign up to book
              </Button>
            )}
          </CardFooter>
          {!isAuthenticated && (
            <p className="pb-4 text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => {
                  saveBookingState();
                  const paramTutorId = searchParams.get("tutor_id");
                  const bookUrl = paramTutorId ? `/book?tutor_id=${paramTutorId}` : "/book";
                  router.push(`/login?redirect=${encodeURIComponent(bookUrl)}`);
                }}
                className="text-primary hover:underline"
              >
                Log in
              </button>
            </p>
          )}
        </Card>
      )}

      {/* Step 3: Select Learner */}
      {step === "learner" && (
        <Card>
          <CardHeader>
            <CardTitle>Who is this lesson for?</CardTitle>
            <CardDescription>Select the learner for this session.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {learners.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No learners found. Add a learner to continue.
              </p>
            ) : (
              learners.map((learner) => (
                <button
                  key={learner.id}
                  type="button"
                  onClick={() => setSelectedLearner(learner.id)}
                  className={`w-full rounded-lg border-2 p-4 text-left transition-colors ${
                    selectedLearner === learner.id
                      ? "border-gold-400 bg-gold-400/20"
                      : "border-muted hover:bg-gold-400/10 hover:border-gold-400/30"
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

            {!showAddLearner ? (
              <button
                type="button"
                onClick={() => setShowAddLearner(true)}
                className="w-full rounded-lg border-2 border-dashed border-muted p-4 text-sm text-muted-foreground hover:border-gold-400/30 hover:text-foreground transition-colors"
              >
                {learners.length === 0 ? "+ Add a Learner" : "+ Add Another Learner"}
              </button>
            ) : (
              <div className="rounded-lg border-2 border-muted p-4 space-y-3">
                <p className="text-sm font-medium">Add a learner</p>
                <div className="space-y-2">
                  <Label className="text-xs" required>Name</Label>
                  <Input
                    value={newLearnerName}
                    onChange={(e) => setNewLearnerName(e.target.value)}
                    placeholder="Full name"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Grade level (optional)</Label>
                  <GradeLevelSelect
                    value={newLearnerGrade}
                    onChange={setNewLearnerGrade}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleAddLearner}
                    disabled={!newLearnerName.trim() || addingLearner}
                  >
                    {addingLearner ? "Adding..." : "Add Learner"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setShowAddLearner(false);
                      setNewLearnerName("");
                      setNewLearnerGrade("");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
          <CardFooter className="flex gap-2">
            <Button
              onClick={handleHoldAndReview}
              disabled={!selectedLearner || submitting}
              size="md" className="flex-1"
            >
              {submitting ? "Reserving..." : "Reserve & Review"}
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Step 4: Review & Confirm */}
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
            <div className="rounded-lg bg-gold-400/10 p-4 space-y-3">
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
                    { hour: "numeric", minute: "2-digit", timeZoneName: "short" }
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
              {price > 0 && (
                <div className="flex items-center justify-between border-t pt-3 mt-1">
                  <span className="font-medium">Total</span>
                  <span className="text-xl font-bold">${price}</span>
                </div>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              By confirming, you agree to the tutor&apos;s cancellation policy.
            </p>

            {/* Embedded payment form */}
            {clientSecret && (
              <Elements
                stripe={stripePromise}
                options={{
                  clientSecret,
                  appearance: {
                    theme: "stripe",
                    variables: {
                      colorPrimary: "oklch(0.10 0.02 225)",
                      colorBackground: "#ffffff",
                      colorText: "oklch(0.10 0.02 225)",
                      colorTextPlaceholder: "oklch(0.30 0.025 220)",
                      colorDanger: "oklch(0.62 0.19 18)",
                      fontFamily: '"Rubik", ui-sans-serif, system-ui, sans-serif',
                      fontSizeBase: "14px",
                      borderRadius: "8px",
                      spacingUnit: "4px",
                      spacingGridRow: "16px",
                      spacingGridColumn: "16px",
                    },
                    rules: {
                      ".Input": {
                        border: "1px solid oklch(0.82 0.15 70)",
                        boxShadow: "none",
                        padding: "8px 10px",
                        transition: "border-color 0.2s, box-shadow 0.2s",
                      },
                      ".Input:focus": {
                        border: "1px solid oklch(0.78 0.11 110)",
                        boxShadow: "0 0 0 3px oklch(0.78 0.11 110 / 0.5)",
                      },
                      ".Label": {
                        color: "oklch(0.10 0.02 225)",
                        fontWeight: "500",
                        fontSize: "14px",
                        marginBottom: "4px",
                      },
                      ".Tab": {
                        border: "1px solid oklch(0.82 0.15 70)",
                        boxShadow: "none",
                      },
                      ".Tab:hover": {
                        backgroundColor: "oklch(0.97 0.04 80)",
                        border: "1px solid oklch(0.82 0.15 70)",
                      },
                      ".Tab--selected": {
                        border: "1px solid oklch(0.10 0.02 225)",
                        boxShadow: "none",
                        backgroundColor: "#ffffff",
                      },
                    },
                  },
                }}
              >
                <CheckoutForm
                  lessonId={holdLessonId!}
                  onSuccess={(lessonId) => router.push(`/book/confirmation/${lessonId}`)}
                  onError={(msg) => setError(msg)}
                />
              </Elements>
            )}

            {!clientSecret && !isFreeLesson && (
              <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
                Loading payment form...
              </div>
            )}
          </CardContent>
          <CardFooter className="flex gap-2">
            {isFreeLesson && (
              <Button
                onClick={handleFreeConfirm}
                disabled={submitting}
                size="md" className="flex-1"
              >
                {submitting ? "Confirming..." : "Confirm Booking"}
              </Button>
            )}
          </CardFooter>
        </Card>
      )}
    </div>
  );
}

function CheckoutForm({
  lessonId,
  onSuccess,
  onError,
}: {
  lessonId: string;
  onSuccess: (lessonId: string) => void;
  onError: (msg: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;

    setProcessing(true);

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/book/confirmation/${lessonId}`,
      },
      redirect: "if_required",
    });

    if (error) {
      onError(error.message || "Payment failed. Please try again.");
      setProcessing(false);
      return;
    }

    if (paymentIntent && paymentIntent.status === "succeeded") {
      // Confirm the lesson on our backend
      const confirmRes = await fetch("/api/book/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lesson_id: lessonId,
          payment_intent_id: paymentIntent.id,
        }),
      });

      const confirmData = await confirmRes.json();
      if (!confirmRes.ok) {
        onError(confirmData.error || "Payment succeeded but booking confirmation failed.");
        setProcessing(false);
        return;
      }

      onSuccess(lessonId);
    } else {
      // For payment methods that require redirect (3D Secure, etc.),
      // the return_url handles the confirmation
      setProcessing(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement
        options={{
          layout: "tabs",
        }}
      />
      <Button
        type="submit"
        disabled={!stripe || processing}
        size="md" className="w-full"
      >
        {processing ? "Processing..." : "Pay & Confirm"}
      </Button>
    </form>
  );
}

function stepIndex(step: Step): number {
  return ["subject", "slot", "learner", "review"].indexOf(step);
}

function stepNumber(step: Step): number {
  return stepIndex(step) + 1;
}

function stepLabel(step: Step): string {
  const labels: Record<Step, string> = {
    subject: "Choose subject",
    slot: "Pick a time",
    learner: "Select learner",
    review: "Review & confirm",
  };
  return labels[step];
}

function MiniCalendar({
  monthOffset,
  onMonthChange,
  availableDates,
  selectedDate,
  onSelectDate,
}: {
  monthOffset: number;
  onMonthChange: (offset: number) => void;
  availableDates: Set<string>;
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
}) {
  const today = new Date();
  const viewMonth = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();

  const monthName = viewMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  // First day of month and number of days
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Build grid
  const cells: Array<{ day: number; dateKey: string } | null> = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ day: d, dateKey });
  }

  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  return (
    <div>
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={() => onMonthChange(monthOffset - 1)}
          disabled={monthOffset <= 0}
          className="rounded-md p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
        </button>
        <span className="text-sm font-semibold">{monthName}</span>
        <button
          type="button"
          onClick={() => onMonthChange(monthOffset + 1)}
          className="rounded-md p-1 text-muted-foreground hover:text-foreground"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 text-center text-xs font-medium text-muted-foreground mb-1">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="py-1">{d}</div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell, i) => {
          if (!cell) return <div key={`empty-${i}`} />;
          const hasSlots = availableDates.has(cell.dateKey);
          const isSelected = selectedDate === cell.dateKey;
          const isToday = cell.dateKey === todayKey;
          const isPast = cell.dateKey < todayKey;

          return (
            <button
              key={cell.dateKey}
              type="button"
              disabled={!hasSlots || isPast}
              onClick={() => onSelectDate(cell.dateKey)}
              className={`relative flex h-10 items-center justify-center rounded-md text-sm transition-colors ${
                isSelected
                  ? "bg-primary text-primary-foreground font-semibold"
                  : hasSlots && !isPast
                    ? "hover:bg-primary/10 font-medium"
                    : "text-muted-foreground/40"
              } ${isToday && !isSelected ? "text-[oklch(0.45_0.12_360)] font-bold" : ""}`}
            >
              {cell.day}
              {hasSlots && !isPast && !isSelected && (
                <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-primary" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
