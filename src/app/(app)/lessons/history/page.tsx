import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function LessonHistoryPage() {
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

  // Fetch past lessons
  const query = supabase
    .from("lessons")
    .select(`
      id, starts_at, ends_at, status, format,
      subjects(name),
      learners(full_name),
      tutors(profiles(full_name)),
      payments(amount_cents, status)
    `)
    .in("status", ["completed", "canceled", "late_cancel", "no_show"])
    .order("starts_at", { ascending: false })
    .limit(50);

  if (isTutor && tutorId) {
    query.eq("tutor_id", tutorId);
  } else {
    query.eq("booked_by", profile.id);
  }

  const { data: lessons } = await query;

  const statusColors: Record<string, string> = {
    completed: "bg-blue-100 text-blue-800",
    canceled: "bg-red-100 text-red-800",
    late_cancel: "bg-orange-100 text-orange-800",
    no_show: "bg-gray-100 text-gray-800",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Lesson History</h1>
        <Button variant="outline" render={<Link href="/lessons" />}>
          Upcoming
        </Button>
      </div>

      {!lessons || lessons.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No past lessons yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {lessons.map((lesson) => {
            const start = new Date(lesson.starts_at);
            const end = new Date(lesson.ends_at);
            const payment = (lesson.payments as unknown as Array<{ amount_cents: number; status: string }>)?.[0];

            return (
              <Link key={lesson.id} href={`/lessons/${lesson.id}`}>
                <Card className="transition-colors hover:bg-muted/50">
                  <CardContent className="flex items-center justify-between p-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {(lesson.subjects as unknown as { name: string })?.name}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {(lesson.learners as unknown as { full_name: string })?.full_name}
                        </Badge>
                        <Badge
                          variant="secondary"
                          className={`text-xs ${statusColors[lesson.status] || ""}`}
                        >
                          {lesson.status.replace("_", " ")}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {start.toLocaleDateString(undefined, {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                        })}{" "}
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
                    {payment && (
                      <span className="text-sm font-medium">
                        ${(payment.amount_cents / 100).toFixed(2)}
                      </span>
                    )}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
