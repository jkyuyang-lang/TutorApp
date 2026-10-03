import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

export default async function TutorDashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!profile) redirect("/onboarding");

  const { data: tutor } = await supabase
    .from("tutors")
    .select("id")
    .eq("profile_id", profile.id)
    .single();

  if (!tutor) redirect("/tutor-setup");

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 7);

  // Today's lessons
  const { data: todayLessons, count: todayCount } = await supabase
    .from("lessons")
    .select("*, subjects(name), learners(full_name)", { count: "exact" })
    .eq("tutor_id", tutor.id)
    .in("status", ["confirmed", "completed"])
    .gte("starts_at", today.toISOString())
    .lt("starts_at", tomorrow.toISOString())
    .order("starts_at", { ascending: true });

  // This week's lessons count
  const { count: weekCount } = await supabase
    .from("lessons")
    .select("id", { count: "exact", head: true })
    .eq("tutor_id", tutor.id)
    .in("status", ["confirmed"])
    .gte("starts_at", today.toISOString())
    .lt("starts_at", weekEnd.toISOString());

  // New inquiries
  const { count: inquiryCount } = await supabase
    .from("inquiries")
    .select("id", { count: "exact", head: true })
    .eq("tutor_id", tutor.id)
    .eq("status", "new");

  // Unpublished notes
  const { count: notesDueCount } = await supabase
    .from("lesson_notes")
    .select("id", { count: "exact", head: true })
    .eq("tutor_id", tutor.id)
    .eq("status", "draft");

  // Lessons needing notes (completed but no notes yet)
  const { count: noNotesCount } = await supabase
    .from("lessons")
    .select("id, lesson_notes(id)", { count: "exact", head: true })
    .eq("tutor_id", tutor.id)
    .eq("status", "completed")
    .is("lesson_notes", null);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      {/* Stats grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <DashCard title="Today" value={todayCount ?? 0} label="lessons" href="/calendar" />
        <DashCard title="This Week" value={weekCount ?? 0} label="upcoming" href="/calendar" />
        <DashCard title="Inquiries" value={inquiryCount ?? 0} label="new" href="/inbox" />
        <DashCard
          title="Notes Due"
          value={(notesDueCount ?? 0) + (noNotesCount ?? 0)}
          label="unpublished"
          href="/clients"
        />
      </div>

      {/* Today's schedule */}
      <Card>
        <CardHeader>
          <CardTitle>Today&apos;s Schedule</CardTitle>
        </CardHeader>
        <CardContent>
          {!todayLessons || todayLessons.length === 0 ? (
            <p className="text-sm text-muted-foreground">No lessons today.</p>
          ) : (
            <div className="space-y-3">
              {todayLessons.map((lesson) => {
                const start = new Date(lesson.starts_at);
                const end = new Date(lesson.ends_at);
                return (
                  <div
                    key={lesson.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div>
                      <p className="font-medium">
                        {(lesson.subjects as { name: string })?.name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {(lesson.learners as { full_name: string })?.full_name} &middot;{" "}
                        {start.toLocaleTimeString(undefined, {
                          hour: "numeric",
                          minute: "2-digit",
                        })}{" "}
                        &ndash;{" "}
                        {end.toLocaleTimeString(undefined, {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    <span className="text-xs capitalize text-muted-foreground">
                      {lesson.status}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DashCard({
  title,
  value,
  label,
  href,
}: {
  title: string;
  value: number;
  label: string;
  href: string;
}) {
  return (
    <Link href={href}>
      <Card className="transition-colors hover:bg-muted/50">
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-3xl font-bold">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </CardContent>
      </Card>
    </Link>
  );
}
