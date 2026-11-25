import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  sendEmail,
  tutorFromAddress,
  lessonBookedEmail,
  lessonCanceledEmail,
  lessonChangedEmail,
  newMessageEmail,
} from "@/lib/email";
import { sendSMS } from "@/lib/sms";

/**
 * Fire-and-forget notification endpoint.
 * POST { type, payload }
 *
 * Types:
 *   - lesson_booked:   { lesson_id }
 *   - lesson_canceled: { lesson_id, canceled_by_profile_id, reason?, is_late_cancel }
 *   - lesson_changed:  { lesson_id, changed_by_profile_id, change_description }
 *   - new_message:     { conversation_id, sender_profile_id, content }
 */
export async function POST(req: NextRequest) {
  // Verify this is an internal call (simple shared secret or same-origin)
  const authHeader = req.headers.get("x-notify-secret");
  const secret = process.env.NOTIFY_SECRET;
  if (secret && authHeader !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { type, payload } = await req.json();
  console.log("[notify] Received:", type, JSON.stringify(payload));
  const supabase = createServiceClient();

  try {
    switch (type) {
      case "lesson_booked": {
        const { lesson_id } = payload;
        const { data: lesson } = await supabase
          .from("lessons")
          .select("id, starts_at, ends_at, booked_by, tutor_id, subjects(name), tutors(email_alias, profiles(full_name, user_id))")
          .eq("id", lesson_id)
          .single();
        if (!lesson) break;

        const booker = await getProfile(supabase, lesson.booked_by);
        const tutorData = lesson.tutors as unknown as { email_alias: string | null; profiles: { full_name: string; user_id: string } };
        const subjectName = (lesson.subjects as unknown as { name: string })?.name ?? "Tutoring";
        const start = new Date(lesson.starts_at);
        const end = new Date(lesson.ends_at);
        const dateStr = formatDate(start);
        const timeStr = formatTimeRange(start, end);

        const fromTutor = tutorFromAddress(tutorData.email_alias, tutorData.profiles.full_name);

        // Email the tutor
        const tutorEmail = await getUserEmail(supabase, tutorData.profiles.user_id);
        if (tutorEmail) {
          const email = lessonBookedEmail({
            recipientName: tutorData.profiles.full_name,
            otherPartyName: booker?.full_name ?? "A student",
            subject: subjectName,
            date: dateStr,
            time: timeStr,
            lessonId: lesson_id,
            isForTutor: true,
          });
          await sendEmail({ to: tutorEmail, ...email }).catch((err) =>
            console.error("[notify] Tutor email failed:", err)
          );
        }

        // Text the tutor via SMS
        const { data: tutorProfileData } = await supabase
          .from("profiles")
          .select("phone, phone_carrier")
          .eq("user_id", tutorData.profiles.user_id)
          .single();
        if (tutorProfileData?.phone) {
          const smsMessage = `New lesson booked! ${booker?.full_name ?? "A student"} - ${subjectName} on ${dateStr} at ${timeStr}`;
          try {
            const sent = await sendSMS({
              phone: tutorProfileData.phone,
              message: smsMessage,
              carrier: tutorProfileData.phone_carrier ?? undefined,
            });
            console.log("[notify] SMS sent:", sent);
          } catch (err) {
            console.error("[notify] SMS failed:", err);
          }
        }

        // Email the booker (from tutor's address)
        if (booker) {
          const bookerEmail = await getUserEmail(supabase, booker.user_id);
          if (bookerEmail) {
            const email = lessonBookedEmail({
              recipientName: booker.full_name,
              otherPartyName: tutorData.profiles.full_name,
              subject: subjectName,
              date: dateStr,
              time: timeStr,
              lessonId: lesson_id,
              isForTutor: false,
            });
            await sendEmail({ to: bookerEmail, from: fromTutor, ...email });
          }
        }
        break;
      }

      case "lesson_canceled": {
        const { lesson_id, canceled_by_profile_id, reason, is_late_cancel } = payload;
        const { data: lesson } = await supabase
          .from("lessons")
          .select("id, starts_at, ends_at, booked_by, tutor_id, subjects(name), tutors(email_alias, profiles(full_name, user_id))")
          .eq("id", lesson_id)
          .single();
        if (!lesson) break;

        const canceledBy = await getProfile(supabase, canceled_by_profile_id);
        const tutorData = lesson.tutors as unknown as { email_alias: string | null; profiles: { full_name: string; user_id: string } };
        const subjectName = (lesson.subjects as unknown as { name: string })?.name ?? "Tutoring";
        const start = new Date(lesson.starts_at);
        const end = new Date(lesson.ends_at);
        const dateStr = formatDate(start);
        const timeStr = formatTimeRange(start, end);

        const fromTutor = tutorFromAddress(tutorData.email_alias, tutorData.profiles.full_name);

        // Notify the OTHER party (not the one who canceled)
        const isCanceledByTutor = canceled_by_profile_id !== lesson.booked_by;
        const recipientProfileId = isCanceledByTutor ? lesson.booked_by : null;
        const recipientTutorUserId = isCanceledByTutor ? null : tutorData.profiles.user_id;

        if (recipientProfileId) {
          // Tutor canceled → email client from tutor's address
          const recipient = await getProfile(supabase, recipientProfileId);
          if (recipient) {
            const recipientEmail = await getUserEmail(supabase, recipient.user_id);
            if (recipientEmail) {
              const email = lessonCanceledEmail({
                recipientName: recipient.full_name,
                canceledByName: canceledBy?.full_name ?? "Someone",
                subject: subjectName,
                date: dateStr,
                time: timeStr,
                reason,
                isLateCancel: is_late_cancel,
              });
              await sendEmail({ to: recipientEmail, from: fromTutor, ...email });
            }
          }
        } else if (recipientTutorUserId) {
          const recipientEmail = await getUserEmail(supabase, recipientTutorUserId);
          if (recipientEmail) {
            const email = lessonCanceledEmail({
              recipientName: tutorData.profiles.full_name,
              canceledByName: canceledBy?.full_name ?? "A student",
              subject: subjectName,
              date: dateStr,
              time: timeStr,
              reason,
              isLateCancel: is_late_cancel,
            });
            await sendEmail({ to: recipientEmail, ...email });
          }
        }
        break;
      }

      case "lesson_changed": {
        const { lesson_id, changed_by_profile_id, change_description } = payload;
        const { data: lesson } = await supabase
          .from("lessons")
          .select("id, starts_at, ends_at, booked_by, tutor_id, subjects(name), tutors(email_alias, profiles(full_name, user_id))")
          .eq("id", lesson_id)
          .single();
        if (!lesson) break;

        const changedBy = await getProfile(supabase, changed_by_profile_id);
        const tutorData = lesson.tutors as unknown as { email_alias: string | null; profiles: { full_name: string; user_id: string } };
        const subjectName = (lesson.subjects as unknown as { name: string })?.name ?? "Tutoring";
        const start = new Date(lesson.starts_at);
        const end = new Date(lesson.ends_at);
        const dateStr = formatDate(start);
        const timeStr = formatTimeRange(start, end);

        const fromTutor = tutorFromAddress(tutorData.email_alias, tutorData.profiles.full_name);

        // Notify the other party
        const isChangedByTutor = changed_by_profile_id !== lesson.booked_by;

        if (isChangedByTutor) {
          // Tutor changed → email client from tutor's address
          const booker = await getProfile(supabase, lesson.booked_by);
          if (booker) {
            const bookerEmail = await getUserEmail(supabase, booker.user_id);
            if (bookerEmail) {
              const email = lessonChangedEmail({
                recipientName: booker.full_name,
                changedByName: changedBy?.full_name ?? "Your tutor",
                subject: subjectName,
                date: dateStr,
                time: timeStr,
                changeDescription: change_description,
                lessonId: lesson_id,
              });
              await sendEmail({ to: bookerEmail, from: fromTutor, ...email });
            }
          }
        } else {
          const tutorEmail = await getUserEmail(supabase, tutorData.profiles.user_id);
          if (tutorEmail) {
            const email = lessonChangedEmail({
              recipientName: tutorData.profiles.full_name,
              changedByName: changedBy?.full_name ?? "A student",
              subject: subjectName,
              date: dateStr,
              time: timeStr,
              changeDescription: change_description,
              lessonId: lesson_id,
            });
            await sendEmail({ to: tutorEmail, ...email });
          }
        }
        break;
      }

      case "new_message": {
        const { conversation_id, sender_profile_id, content } = payload;

        const { data: conv } = await supabase
          .from("conversations")
          .select("id, account_holder_id, tutor_id, tutors(email_alias, profiles(full_name, user_id))")
          .eq("id", conversation_id)
          .single();
        if (!conv) break;

        const sender = await getProfile(supabase, sender_profile_id);
        const tutorData = conv.tutors as unknown as { email_alias: string | null; profiles: { full_name: string; user_id: string } };

        // Determine recipient (the other party)
        const isSenderClient = sender_profile_id === conv.account_holder_id;

        if (isSenderClient) {
          // Notify the tutor
          const tutorEmail = await getUserEmail(supabase, tutorData.profiles.user_id);
          if (tutorEmail) {
            const email = newMessageEmail({
              recipientName: tutorData.profiles.full_name,
              senderName: sender?.full_name ?? "A student",
              preview: content,
              conversationId: conversation_id,
            });
            await sendEmail({ to: tutorEmail, ...email });
          }
        } else {
          // Tutor sent → notify client from tutor's address
          const fromTutor = tutorFromAddress(tutorData.email_alias, tutorData.profiles.full_name);
          const client = await getProfile(supabase, conv.account_holder_id as string);
          if (client) {
            const clientEmail = await getUserEmail(supabase, client.user_id);
            if (clientEmail) {
              const email = newMessageEmail({
                recipientName: client.full_name,
                senderName: sender?.full_name ?? "Your tutor",
                preview: content,
                conversationId: conversation_id,
              });
              await sendEmail({ to: clientEmail, from: fromTutor, ...email });
            }
          }
        }
        break;
      }
    }
  } catch (err) {
    console.error("[notify] Error:", err);
  }

  return NextResponse.json({ ok: true });
}

// --- Helpers ---

async function getProfile(supabase: ReturnType<typeof createServiceClient>, profileId: string) {
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, user_id")
    .eq("id", profileId)
    .single();
  return data;
}

async function getUserEmail(supabase: ReturnType<typeof createServiceClient>, userId: string) {
  const { data } = await supabase.auth.admin.getUserById(userId);
  return data?.user?.email ?? null;
}

function formatDate(d: Date) {
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTimeRange(start: Date, end: Date) {
  const fmt = (d: Date) =>
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZoneName: "short" });
  return `${fmt(start)} – ${fmt(end)}`;
}
