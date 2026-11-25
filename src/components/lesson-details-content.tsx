"use client";

import { Separator } from "@/components/ui/separator";
import { formatLongDate, formatTimeRange, formatCurrency } from "@/lib/format";

interface LessonNote {
  covered: string | null;
  homework: string | null;
  next_steps: string | null;
  status: string;
}

interface Payment {
  amount_cents: number;
  status: string;
}

export interface LessonDetailsData {
  subjectName?: string;
  learnerName?: string;
  tutorName?: string;
  startsAt: string;
  endsAt: string;
  format?: string;
  meetingLink?: string | null;
  focusNotes?: string | null;
  status?: string;
  payment?: Payment | null;
  lessonNotes?: LessonNote[];
  /** For confirmation page — shows price in large text with border-top */
  priceDollars?: number | null;
  /** Show the join help text for confirmation pages */
  showMeetingHelp?: boolean;
}

export function LessonDetailsContent({
  subjectName,
  learnerName,
  tutorName,
  startsAt,
  endsAt,
  format,
  meetingLink,
  focusNotes,
  status,
  payment,
  lessonNotes,
  priceDollars,
  showMeetingHelp,
}: LessonDetailsData) {
  const publishedNote = lessonNotes?.find((n) => n.status === "published");

  return (
    <div className="space-y-3 text-sm">
      {subjectName && <DetailRow label="Subject" value={subjectName} />}
      {learnerName !== undefined && <DetailRow label="Learner" value={learnerName} />}
      {tutorName !== undefined && <DetailRow label="Tutor" value={tutorName} />}
      <DetailRow
        label="Date"
        value={formatLongDate(startsAt)}
      />
      <DetailRow
        label="Time"
        value={formatTimeRange(startsAt, endsAt)}
      />
      {format && <DetailRow label="Format" value={format} />}

      {meetingLink && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Meeting</span>
            <a
              href={meetingLink}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border-2 border-gold-400 bg-gold-400/20 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-gold-400/30"
            >
              {meetingLink.includes("meet.google")
                ? "Join Google Meet ↗"
                : meetingLink.includes("zoom")
                  ? "Join Zoom ↗"
                  : "Join Meeting ↗"}
            </a>
          </div>
          {showMeetingHelp && (
            <p className="text-xs text-muted-foreground">
              Use this link to join your lesson. We recommend joining 15 minutes
              early to make sure your audio, video, and internet connection are
              working correctly.
            </p>
          )}
        </div>
      )}

      {payment && (
        <>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Amount</span>
            <span className="capitalize">
              <span className="font-bold">
                {formatCurrency(payment.amount_cents)}
              </span>{" "}
              — {payment.status}
            </span>
          </div>
          {status &&
            ["canceled", "late_cancel"].includes(status) && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Credit</span>
                <span className="font-bold text-green-600">
                  +{formatCurrency(payment.amount_cents)} —{" "}
                  {status === "late_cancel" ? "Late Cancellation" : "Cancelled"}
                </span>
              </div>
            )}
        </>
      )}

      {focusNotes && (
        <>
          <Separator />
          <div className="text-sm">
            <span className="text-muted-foreground">Focus notes: </span>
            <span>{focusNotes}</span>
          </div>
        </>
      )}

      {publishedNote && (
        <>
          <Separator />
          <div className="space-y-2">
            <p className="font-medium">Lesson Notes</p>
            {publishedNote.covered && (
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  What we covered
                </p>
                <p>{publishedNote.covered}</p>
              </div>
            )}
            {publishedNote.homework && (
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  Homework
                </p>
                <p>{publishedNote.homework}</p>
              </div>
            )}
            {publishedNote.next_steps && (
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  Next steps
                </p>
                <p>{publishedNote.next_steps}</p>
              </div>
            )}
          </div>
        </>
      )}

      {priceDollars != null && priceDollars > 0 && (
        <div className="flex items-center justify-between border-t pt-3 mt-1">
          <span className="font-medium">Total</span>
          <span className="text-xl font-bold">${priceDollars.toFixed(2)}</span>
        </div>
      )}
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
