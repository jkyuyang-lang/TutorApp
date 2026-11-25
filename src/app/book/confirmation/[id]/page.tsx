import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/notify";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LessonDetailsContent } from "@/components/lesson-details-content";

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

  const adminClient = createServiceClient();

  // If lesson is still held (e.g. webhook hasn't arrived yet), confirm it now.
  // This handles the case where Stripe payment succeeded but the webhook
  // can't reach the server (e.g. localhost development).
  if (lesson.status === "held") {
    await adminClient
      .from("lessons")
      .update({ status: "confirmed", hold_expires_at: null })
      .eq("id", id);
    lesson.status = "confirmed";

    // Send notifications (email + SMS to tutor)
    notify("lesson_booked", { lesson_id: id });

    // Create payment record if pricing exists
    if (lesson.tutor_subject_id) {
      const { data: ts } = await adminClient
        .from("tutor_subjects")
        .select("prices")
        .eq("id", lesson.tutor_subject_id)
        .single();

      if (ts) {
        const durationMin = Math.round(
          (new Date(lesson.ends_at).getTime() - new Date(lesson.starts_at).getTime()) / 60000
        );
        const price = (ts.prices as Record<string, number>)?.[String(durationMin)];
        if (price) {
          const { count } = await adminClient
            .from("payments")
            .select("id", { count: "exact", head: true })
            .eq("lesson_id", id);

          if (!count) {
            await adminClient.from("payments").insert({
              lesson_id: id,
              payer_id: profile.id,
              tutor_id: lesson.tutor_id,
              amount_cents: Math.round(price * 100),
              status: "succeeded",
            });
          }
        }
      }
    }
  }

  // Fetch price for display
  let priceDollars: number | null = null;
  if (lesson.tutor_subject_id) {
    const { data: ts } = await adminClient
      .from("tutor_subjects")
      .select("prices")
      .eq("id", lesson.tutor_subject_id)
      .single();
    if (ts) {
      const durationMin = Math.round(
        (new Date(lesson.ends_at).getTime() - new Date(lesson.starts_at).getTime()) / 60000
      );
      priceDollars = (ts.prices as Record<string, number>)?.[String(durationMin)] ?? null;
    }
  }

  const tutorData = lesson.tutors as { profiles: { full_name: string }; meeting_link: string | null } | null;
  const meetingLink = (lesson.meeting_link as string) || tutorData?.meeting_link;

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-8">
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
        <CardContent>
          <LessonDetailsContent
            subjectName={(lesson.subjects as { name: string })?.name}
            learnerName={(lesson.learners as { full_name: string })?.full_name}
            tutorName={tutorData?.profiles?.full_name}
            startsAt={lesson.starts_at}
            endsAt={lesson.ends_at}
            format={lesson.format}
            meetingLink={meetingLink}
            showMeetingHelp
            focusNotes={lesson.focus_notes}
            priceDollars={priceDollars}
          />
        </CardContent>
      </Card>

      <div className="text-center">
        <Link href="/lessons" className="text-base font-medium text-primary underline-offset-4 hover:underline">
          ← Go to lessons
        </Link>
      </div>
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

