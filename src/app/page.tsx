import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { getNextSlots, type AvailabilityRule, type TimeOff, type ExistingLesson, type BookingRules } from "@/lib/slots";

export default async function HomePage() {
  const supabase = await createClient();

  // Get the first (MVP: only) tutor
  const { data: tutor } = await supabase
    .from("tutors")
    .select(`
      *,
      profiles(full_name, avatar_url, time_zone),
      tutor_subjects(
        *,
        subjects(name, category)
      )
    `)
    .limit(1)
    .single();

  if (!tutor) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="py-12 text-center">
            <h1 className="text-xl font-semibold">Coming Soon</h1>
            <p className="mt-2 text-muted-foreground">
              This tutoring platform is being set up. Check back soon!
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const profile = tutor.profiles as { full_name: string; avatar_url: string | null; time_zone: string };
  const subjects = (tutor.tutor_subjects as Array<{
    id: string;
    levels: string[];
    format: string;
    durations: number[];
    prices: Record<string, number>;
    active: boolean;
    subjects: { name: string; category: string };
  }>)?.filter((ts) => ts.active) || [];

  // Fetch availability for slot preview
  const { data: availRules } = await supabase
    .from("availability_rules")
    .select("*")
    .eq("tutor_id", tutor.id);

  const { data: timeOffsData } = await supabase
    .from("time_off")
    .select("*")
    .eq("tutor_id", tutor.id)
    .gte("ends_at", new Date().toISOString());

  const { data: lessonsData } = await supabase
    .from("lessons")
    .select("starts_at, ends_at, status")
    .eq("tutor_id", tutor.id)
    .not("status", "in", '("canceled","late_cancel")')
    .gte("starts_at", new Date().toISOString());

  const nextSlots = getNextSlots(
    (availRules ?? []) as AvailabilityRule[],
    (timeOffsData ?? []) as TimeOff[],
    (lessonsData ?? []) as ExistingLesson[],
    {
      buffer_minutes: tutor.buffer_minutes,
      min_notice_hours: tutor.min_notice_hours,
      booking_window_days: tutor.booking_window_days,
      max_lessons_per_day: tutor.max_lessons_per_day,
    } as BookingRules,
    60,
    profile.time_zone || "America/New_York",
    10
  );

  const policy = tutor.cancellation_policy as {
    full_refund_hours: number;
    partial_refund_pct: number;
    no_show_charge_pct: number;
  };

  return (
    <div className="min-h-screen bg-muted/40">
      {/* Header */}
      <header className="border-b bg-background">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          <span className="font-semibold">TutorApp</span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" render={<Link href="/login" />}>
              Log in
            </Button>
            <Button size="sm" render={<Link href="/signup" />}>
              Sign up
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {/* Hero */}
        <div className="space-y-4">
          <div className="flex items-start gap-6">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 text-2xl font-bold text-primary">
              {profile.full_name
                .split(" ")
                .map((n) => n[0])
                .join("")}
            </div>
            <div className="flex-1 space-y-2">
              <h1 className="text-3xl font-bold">{profile.full_name}</h1>
              {tutor.credentials && (
                <p className="text-muted-foreground">{tutor.credentials}</p>
              )}
              {tutor.years_experience && (
                <p className="text-sm text-muted-foreground">
                  {tutor.years_experience} years of experience
                </p>
              )}
            </div>
          </div>

          {tutor.bio && (
            <p className="text-muted-foreground leading-relaxed">{tutor.bio}</p>
          )}

          <div className="flex gap-3">
            <Button render={<Link href="/signup" />}>
              Book a lesson
            </Button>
            <Button variant="outline" render={<Link href="/inquiry" />}>
              Ask a question
            </Button>
          </div>
        </div>

        <Separator className="my-8" />

        {/* Subjects */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Subjects & Rates</h2>
          {subjects.length === 0 ? (
            <p className="text-muted-foreground">Subjects coming soon.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {subjects.map((ts) => (
                <Card key={ts.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">
                      {ts.subjects.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {ts.levels.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {ts.levels.map((level) => (
                          <Badge key={level} variant="secondary">
                            {level}
                          </Badge>
                        ))}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2 text-sm">
                      {ts.durations.map((d) => (
                        <span key={d} className="text-muted-foreground">
                          {d} min{" "}
                          {ts.prices[String(d)] && (
                            <span className="font-medium text-foreground">
                              ${ts.prices[String(d)]}
                            </span>
                          )}
                        </span>
                      ))}
                    </div>
                    <Badge variant="outline">{ts.format}</Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* Availability preview */}
        {nextSlots.length > 0 && (
          <>
            <Separator className="my-8" />
            <section className="space-y-4">
              <h2 className="text-xl font-semibold">Next Available Slots</h2>
              <div className="grid gap-2 sm:grid-cols-2">
                {nextSlots.map((slot, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-lg border px-4 py-2"
                  >
                    <span className="text-sm">
                      {slot.starts_at.toLocaleDateString(undefined, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    <span className="text-sm font-medium">
                      {slot.starts_at.toLocaleTimeString(undefined, {
                        hour: "numeric",
                        minute: "2-digit",
                      })}{" "}
                      &ndash;{" "}
                      {slot.ends_at.toLocaleTimeString(undefined, {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                ))}
              </div>
              <Button variant="outline" render={<Link href="/signup" />}>
                See full calendar
              </Button>
            </section>
          </>
        )}

        <Separator className="my-8" />

        {/* Policies */}
        {policy && (
          <section className="space-y-4">
            <h2 className="text-xl font-semibold">Cancellation Policy</h2>
            <Card>
              <CardContent className="space-y-2 pt-6">
                <p className="text-sm">
                  <span className="font-medium">
                    {policy.full_refund_hours}+ hours before:
                  </span>{" "}
                  Full refund
                </p>
                <p className="text-sm">
                  <span className="font-medium">
                    Less than {policy.full_refund_hours} hours:
                  </span>{" "}
                  {policy.partial_refund_pct}% refund
                </p>
                <p className="text-sm">
                  <span className="font-medium">No-show:</span>{" "}
                  {policy.no_show_charge_pct}% charged
                </p>
              </CardContent>
            </Card>
          </section>
        )}
      </main>
    </div>
  );
}
