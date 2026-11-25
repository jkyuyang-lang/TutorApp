import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { goalStatusColors } from "@/lib/status-colors";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export default async function ProgressPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("user_id", user.id)
    .single();

  if (!profile) redirect("/onboarding");
  if (profile.role === "tutor") redirect("/dashboard");

  // Get learners
  const { data: learners } = await supabase
    .from("learners")
    .select("id, full_name, is_self")
    .eq("account_holder_id", profile.id);

  const learnerIds = (learners ?? []).map((l) => l.id);

  // Get published lesson notes for these learners
  const { data: lessons } = await supabase
    .from("lessons")
    .select(`
      id, starts_at, status,
      subjects(name),
      learners(id, full_name),
      lesson_notes(covered, homework, next_steps, status, published_at)
    `)
    .eq("booked_by", profile.id)
    .in("status", ["completed"])
    .order("starts_at", { ascending: false })
    .limit(30);

  // Filter to only lessons with published notes
  const lessonsWithNotes = (lessons ?? []).filter((l) => {
    const notes = l.lesson_notes as Array<{ status: string }>;
    return notes?.some((n) => n.status === "published");
  });

  // Get goals
  const { data: goals } = learnerIds.length > 0
    ? await supabase
        .from("goals")
        .select("*, subjects(name), learners:learner_id(full_name)")
        .in("learner_id", learnerIds)
        .order("created_at", { ascending: false })
    : { data: [] };


  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Progress</h1>

      {/* Goals */}
      {goals && goals.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Goals</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {goals.map((goal) => (
              <Card key={goal.id}>
                <CardContent className="p-4 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{goal.title}</span>
                    <Badge
                      variant="secondary"
                      className={`text-xs ${goalStatusColors[goal.status] || ""}`}
                    >
                      {goal.status.replace("_", " ")}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {(goal.learners as unknown as { full_name: string })?.full_name} &middot;{" "}
                    {(goal.subjects as unknown as { name: string })?.name}
                  </p>
                  {goal.description && (
                    <p className="text-sm text-muted-foreground">
                      {goal.description}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      <Separator />

      {/* Lesson Notes */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Lesson Notes</h2>
        {lessonsWithNotes.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No lesson notes yet. Notes will appear here after your tutor
              publishes them.
            </CardContent>
          </Card>
        ) : (
          lessonsWithNotes.map((lesson) => {
            const note = (
              lesson.lesson_notes as Array<{
                covered: string | null;
                homework: string | null;
                next_steps: string | null;
                status: string;
              }>
            )?.find((n) => n.status === "published");

            if (!note) return null;

            return (
              <Card key={lesson.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">
                      {(lesson.subjects as unknown as { name: string })?.name}
                    </CardTitle>
                    <span className="text-xs text-muted-foreground">
                      {new Date(lesson.starts_at).toLocaleDateString(
                        undefined,
                        { month: "short", day: "numeric" }
                      )}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {(lesson.learners as unknown as { full_name: string })?.full_name}
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  {note.covered && (
                    <div className="text-sm">
                      <p className="font-medium">What we covered</p>
                      <p className="text-muted-foreground">{note.covered}</p>
                    </div>
                  )}
                  {note.homework && (
                    <div className="text-sm">
                      <p className="font-medium">Homework</p>
                      <p className="text-muted-foreground">{note.homework}</p>
                    </div>
                  )}
                  {note.next_steps && (
                    <div className="text-sm">
                      <p className="font-medium">Next steps</p>
                      <p className="text-muted-foreground">
                        {note.next_steps}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </section>
    </div>
  );
}
