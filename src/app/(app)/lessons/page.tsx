import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function LessonsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("user_id", user.id)
    .single();

  if (!profile) redirect("/onboarding");
  if (profile.role === "tutor") redirect("/dashboard");

  // Fetch upcoming lessons
  const { data: lessons } = await supabase
    .from("lessons")
    .select(`
      *,
      subjects(name),
      learners(full_name),
      tutors(
        meeting_link,
        profiles(full_name)
      )
    `)
    .eq("booked_by", profile.id)
    .in("status", ["confirmed", "held"])
    .gte("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Upcoming Lessons</h1>
        <Button render={<Link href="/book" />}>
          Book a lesson
        </Button>
      </div>

      {!lessons || lessons.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-muted-foreground">No upcoming lessons</p>
            <Button className="mt-4" render={<Link href="/book" />}>
              Book your first lesson
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {lessons.map((lesson) => {
            const start = new Date(lesson.starts_at);
            const end = new Date(lesson.ends_at);
            return (
              <Card key={lesson.id}>
                <CardContent className="flex items-center justify-between p-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {(lesson.subjects as { name: string })?.name}
                      </span>
                      <Badge variant="outline">
                        {(lesson.learners as { full_name: string })?.full_name}
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
                  <div className="flex items-center gap-2">
                    {lesson.status === "held" && (
                      <Badge variant="secondary">Pending payment</Badge>
                    )}
                    <Button variant="outline" size="sm" render={<Link href={`/lessons/${lesson.id}`} />}>
                      Details
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
