import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function ConfirmationPage({
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
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!profile) redirect("/onboarding");

  const { data: lesson } = await supabase
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
    .eq("id", id)
    .eq("booked_by", profile.id)
    .single();

  if (!lesson) redirect("/lessons");

  const start = new Date(lesson.starts_at);
  const end = new Date(lesson.ends_at);
  const tutorProfile = (lesson.tutors as { profiles: { full_name: string }; meeting_link: string | null })?.profiles;

  // Generate .ics content
  const icsContent = generateICS({
    title: `Tutoring: ${(lesson.subjects as { name: string })?.name}`,
    start,
    end,
    description: lesson.focus_notes || "",
    location: (lesson.tutors as { meeting_link: string | null })?.meeting_link || "Online",
  });

  const icsDataUri = `data:text/calendar;charset=utf-8,${encodeURIComponent(icsContent)}`;

  return (
    <div className="mx-auto max-w-lg space-y-6 py-8">
      <div className="text-center space-y-2">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600">
          <CheckIcon />
        </div>
        <h1 className="text-2xl font-bold">Booking Confirmed!</h1>
        <p className="text-muted-foreground">
          Your lesson has been scheduled.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Lesson Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <DetailRow
            label="Subject"
            value={(lesson.subjects as { name: string })?.name}
          />
          <DetailRow
            label="Learner"
            value={(lesson.learners as { full_name: string })?.full_name}
          />
          <DetailRow
            label="Tutor"
            value={tutorProfile?.full_name}
          />
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
            <DetailRow label="Focus" value={lesson.focus_notes} />
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        <Button render={<a href={icsDataUri} download="lesson.ics" />}>
          Add to calendar (.ics)
        </Button>
        <Button variant="outline" render={<Link href={`/lessons/${lesson.id}`} />}>
          View lesson details
        </Button>
        <Button variant="ghost" render={<Link href="/lessons" />}>
          Back to lessons
        </Button>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium capitalize">{value || "—"}</span>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function generateICS({
  title,
  start,
  end,
  description,
  location,
}: {
  title: string;
  start: Date;
  end: Date;
  description: string;
  location: string;
}) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const formatDate = (d: Date) =>
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TutorApp//Booking//EN",
    "BEGIN:VEVENT",
    `DTSTART:${formatDate(start)}`,
    `DTEND:${formatDate(end)}`,
    `SUMMARY:${title}`,
    `DESCRIPTION:${description.replace(/\n/g, "\\n")}`,
    `LOCATION:${location}`,
    `UID:${crypto.randomUUID()}@tutorapp`,
    `DTSTAMP:${formatDate(new Date())}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}
