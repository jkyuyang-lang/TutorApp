import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export default async function LessonDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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

  // Fetch lesson with related data
  const { data: lesson } = await supabase
    .from("lessons")
    .select(`
      *,
      subjects(name),
      learners(full_name),
      tutors(
        meeting_link,
        profiles(full_name)
      ),
      lesson_notes(*)
    `)
    .eq("id", id)
    .single();

  if (!lesson) redirect("/lessons");

  // Verify access: either booked_by this user or the tutor
  const isTutor = profile.role === "tutor";
  if (!isTutor && lesson.booked_by !== profile.id) {
    redirect("/lessons");
  }

  const start = new Date(lesson.starts_at);
  const end = new Date(lesson.ends_at);
  const now = new Date();
  const isUpcoming = start > now && !["canceled", "late_cancel"].includes(lesson.status);
  const meetingLink =
    lesson.meeting_link ||
    (lesson.tutors as { meeting_link: string | null })?.meeting_link;
  const canJoin =
    isUpcoming &&
    lesson.status === "confirmed" &&
    start.getTime() - now.getTime() < 15 * 60 * 1000; // 15 min before

  const tutorProfile = (lesson.tutors as { profiles: { full_name: string } })?.profiles;
  const notes = lesson.lesson_notes as Array<{
    covered: string | null;
    homework: string | null;
    next_steps: string | null;
    status: string;
  }> | null;
  const publishedNote = notes?.find((n) => n.status === "published");

  const statusColors: Record<string, string> = {
    confirmed: "bg-green-100 text-green-800",
    held: "bg-yellow-100 text-yellow-800",
    completed: "bg-blue-100 text-blue-800",
    canceled: "bg-red-100 text-red-800",
    late_cancel: "bg-red-100 text-red-800",
    no_show: "bg-gray-100 text-gray-800",
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Lesson Details</h1>
        <Badge
          className={statusColors[lesson.status] || ""}
          variant="secondary"
        >
          {lesson.status.replace("_", " ")}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{(lesson.subjects as { name: string })?.name}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <DetailRow
            label="Learner"
            value={(lesson.learners as { full_name: string })?.full_name}
          />
          <DetailRow label="Tutor" value={tutorProfile?.full_name} />
          <DetailRow
            label="Date"
            value={start.toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          />
          <DetailRow
            label="Time"
            value={`${start.toLocaleTimeString(undefined, {
              hour: "numeric",
              minute: "2-digit",
            })} – ${end.toLocaleTimeString(undefined, {
              hour: "numeric",
              minute: "2-digit",
            })}`}
          />
          <DetailRow label="Format" value={lesson.format} />
          {lesson.focus_notes && (
            <>
              <Separator />
              <div className="text-sm">
                <span className="text-muted-foreground">Focus notes: </span>
                <span>{lesson.focus_notes}</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Join button */}
      {canJoin && meetingLink && (
        <Button className="w-full" size="lg" render={<a href={meetingLink} target="_blank" rel="noopener noreferrer" />}>
          Join Lesson
        </Button>
      )}

      {isUpcoming && !canJoin && meetingLink && lesson.status === "confirmed" && (
        <Card>
          <CardContent className="py-4 text-center text-sm text-muted-foreground">
            Join button will appear 15 minutes before the lesson starts.
          </CardContent>
        </Card>
      )}

      {/* Lesson notes (if published) */}
      {publishedNote && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Lesson Notes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {publishedNote.covered && (
              <div className="text-sm">
                <p className="font-medium">What we covered</p>
                <p className="text-muted-foreground">{publishedNote.covered}</p>
              </div>
            )}
            {publishedNote.homework && (
              <div className="text-sm">
                <p className="font-medium">Homework</p>
                <p className="text-muted-foreground">
                  {publishedNote.homework}
                </p>
              </div>
            )}
            {publishedNote.next_steps && (
              <div className="text-sm">
                <p className="font-medium">Next steps</p>
                <p className="text-muted-foreground">
                  {publishedNote.next_steps}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex gap-3">
        <Button variant="outline" render={<Link href="/lessons" />}>
          Back to lessons
        </Button>
        {isUpcoming && lesson.status === "confirmed" && (
          <>
            <Button variant="outline" render={<Link href={`/lessons/${id}/reschedule`} />}>
              Reschedule
            </Button>
            <Button variant="outline" render={<Link href={`/lessons/${id}/cancel`} />}>
              Cancel lesson
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium capitalize">{value || "—"}</span>
    </div>
  );
}
