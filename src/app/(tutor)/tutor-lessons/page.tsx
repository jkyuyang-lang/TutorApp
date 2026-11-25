"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { lessonStatusColors as statusColors } from "@/lib/status-colors";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2 } from "lucide-react";
import { LoadingPlaceholder } from "@/components/loading-placeholder";
import { TabBar } from "@/components/tab-bar";
import { DataTable, type Column } from "@/components/data-table";
import { formatShortDate, formatTimeRange, formatCurrency } from "@/lib/format";

interface Lesson {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  format: string;
  booked_by: string;
  meeting_link: string | null;
  focus_notes: string | null;
  cancel_reason: string | null;
  subjects: { name: string } | null;
  learners: { full_name: string } | null;
  tutors: { profile_id: string; meeting_link: string | null; profiles: { full_name: string } } | null;
  payments: { amount_cents: number; status: string }[] | null;
}

interface TutorOption {
  id: string;
  name: string;
}

type Filter = "upcoming" | "past" | "all";

export default function TutorLessonsPage() {
  const router = useRouter();
  const [allLessons, setAllLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("upcoming");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [detailLesson, setDetailLesson] = useState<Lesson | null>(null);

  // Superadmin state
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  const [allTutors, setAllTutors] = useState<TutorOption[]>([]);
  const [tutorFilter, setTutorFilter] = useState("all");

  const loadLessons = useCallback(async () => {
    // Auto-complete any past confirmed lessons (fire-and-forget)
    fetch("/api/lessons/complete-past", { method: "POST" }).catch(() => {});

    setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("user_id", user.id)
      .single();
    if (!profile) return;

    const superadmin = profile.role === "superadmin";
    setIsSuperadmin(superadmin);

    // For superadmin, load tutor list for filter (once)
    if (superadmin && allTutors.length === 0) {
      const { data: tutorsData } = await supabase
        .from("tutors")
        .select("id, profile_id, profiles(full_name)");
      if (tutorsData) {
        const mapped = tutorsData
          .filter((t) => t.profile_id !== profile.id)
          .map((t) => ({
            id: t.id,
            name: (t.profiles as unknown as { full_name: string })?.full_name ?? "Unknown",
          }));
        mapped.sort((a, b) => a.name.localeCompare(b.name));
        setAllTutors(mapped);
      }
    }

    let ownTutorId: string | null = null;
    if (!superadmin) {
      const { data: tutor } = await supabase
        .from("tutors")
        .select("id")
        .eq("profile_id", profile.id)
        .single();
      if (!tutor) return;
      ownTutorId = tutor.id;
    }

    let query = supabase
      .from("lessons")
      .select("id, starts_at, ends_at, status, format, booked_by, meeting_link, focus_notes, cancel_reason, subjects(name), learners(full_name), tutors(profile_id, meeting_link, profiles(full_name)), payments(amount_cents, status)");

    if (superadmin) {
      if (tutorFilter !== "all") {
        query = query.eq("tutor_id", tutorFilter);
      }
    } else {
      query = query.eq("tutor_id", ownTutorId!);
    }

    query = query.neq("status", "held").order("starts_at", { ascending: false }).limit(200);

    const { data } = await query;
    setAllLessons((data as unknown as Lesson[]) ?? []);
    setSelected(new Set());
    setLoading(false);
  }, [tutorFilter, router, allTutors.length]);

  useEffect(() => {
    loadLessons();
  }, [loadLessons]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const now = new Date().toISOString();
  const UPCOMING_STATUSES = ["confirmed"];
  const HISTORY_STATUSES = ["completed", "canceled", "late_cancel", "no_show"];

  const upcomingLessons = useMemo(
    () => allLessons.filter((l) => UPCOMING_STATUSES.includes(l.status) && l.ends_at >= now),
    [allLessons, now]
  );

  const historyLessons = useMemo(
    () => allLessons.filter((l) => HISTORY_STATUSES.includes(l.status) || l.ends_at < now),
    [allLessons, now]
  );

  const lessons = useMemo(() => {
    if (filter === "upcoming") {
      return [...upcomingLessons].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    }
    if (filter === "past") {
      return [...historyLessons].sort((a, b) => b.starts_at.localeCompare(a.starts_at));
    }
    return [...allLessons].sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  }, [filter, upcomingLessons, historyLessons, allLessons]);

  const tabs = useMemo(() => [
    { key: "upcoming", label: "Upcoming", count: upcomingLessons.length },
    { key: "past", label: "History", count: historyLessons.length },
    { key: "all", label: "All Lessons", count: allLessons.length },
  ], [upcomingLessons.length, historyLessons.length, allLessons.length]);

  function toggleAll() {
    if (selected.size === lessons.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(lessons.map((l) => l.id)));
    }
  }

  const lessonColumns = useMemo<Column<Lesson>[]>(() => {
    const cols: Column<Lesson>[] = [
      {
        key: "checkbox",
        label: "",
        header: (
          <input
            type="checkbox"
            checked={selected.size === lessons.length && lessons.length > 0}
            onChange={toggleAll}
            className="size-4 rounded border-gray-300"
          />
        ),
        render: (row) => (
          <span onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={selected.has(row.id)}
              onChange={() => toggleSelect(row.id)}
              className="size-4 rounded border-gray-300"
            />
          </span>
        ),
      },
      {
        key: "date",
        label: "Date",
        sortable: true,
        sortValue: (row) => new Date(row.starts_at).getTime(),
        render: (row) => formatShortDate(row.starts_at),
      },
      {
        key: "time",
        label: "Time",
        sortable: true,
        cellClassName: "text-muted-foreground",
        sortValue: (row) => new Date(row.starts_at).getTime(),
        render: (row) => formatTimeRange(row.starts_at, row.ends_at),
      },
      {
        key: "subject",
        label: "Subject",
        sortable: true,
        sortValue: (row) => row.subjects?.name ?? "",
        render: (row) => row.subjects?.name ?? "—",
      },
      {
        key: "learner",
        label: "Learner",
        sortable: true,
        sortValue: (row) => row.learners?.full_name ?? "",
        render: (row) => (
          <span onClick={(e) => e.stopPropagation()}>
            {isSuperadmin && row.booked_by ? (
              <Link href={`/admin/users/${row.booked_by}`} className="text-primary underline-offset-2 hover:underline">
                {row.learners?.full_name ?? "—"}
              </Link>
            ) : row.booked_by ? (
              <Link href={`/clients/${row.booked_by}`} className="text-primary underline-offset-2 hover:underline">
                {row.learners?.full_name ?? "—"}
              </Link>
            ) : (row.learners?.full_name ?? "—")}
          </span>
        ),
      },
    ];

    if (isSuperadmin) {
      cols.push({
        key: "tutor",
        label: "Tutor",
        sortable: true,
        sortValue: (row) => row.tutors?.profiles?.full_name ?? "",
        render: (row) => (
          <span onClick={(e) => e.stopPropagation()}>
            {row.tutors?.profile_id ? (
              <Link href={`/admin/users/${row.tutors.profile_id}`} className="text-primary underline-offset-2 hover:underline">
                {row.tutors.profiles?.full_name ?? "—"}
              </Link>
            ) : "—"}
          </span>
        ),
      });
    }

    cols.push(
      {
        key: "status",
        label: "Status",
        sortable: true,
        sortValue: (row) => row.status,
        render: (row) => (
          <Badge variant="secondary" className={`text-xs ${statusColors[row.status] || ""}`}>
            {row.status.replace("_", " ")}
          </Badge>
        ),
      },
      {
        key: "amount",
        label: "Amount",
        sortable: true,
        align: "right" as const,
        sortValue: (row) => row.payments?.[0]?.amount_cents ?? 0,
        render: (row) => {
          const payment = row.payments?.[0];
          if (!payment) return "—";
          const isCancelled = ["canceled", "late_cancel"].includes(row.status);
          return (
            <div className="text-right">
              <span className="font-bold">{formatCurrency(payment.amount_cents)}</span>
              {isCancelled && (
                <div className="text-xs font-semibold text-green-600">
                  +{formatCurrency(payment.amount_cents)} — {row.status === "late_cancel" ? "Late Cancel" : "Cancelled"}
                </div>
              )}
            </div>
          );
        },
      },
    );

    return cols;
  }, [isSuperadmin, selected, lessons.length]);

  async function handleDeleteSelected() {
    if (selected.size === 0) return;
    setDeleting(true);
    const supabase = createClient();

    const ids = Array.from(selected);
    await supabase
      .from("lessons")
      .delete()
      .in("id", ids);

    setAllLessons((prev) => prev.filter((l) => !selected.has(l.id)));
    setSelected(new Set());
    setDeleting(false);
    setShowDeleteDialog(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Lessons</h1>
          {selected.size > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowDeleteDialog(true)}
            >
              <Trash2 className="mr-1 size-4" />
              Delete {selected.size} {selected.size === 1 ? "lesson" : "lessons"}
            </Button>
          )}
        </div>
        {isSuperadmin && allTutors.length > 0 && (
          <Select value={tutorFilter} onValueChange={(val) => setTutorFilter(val ?? "all")}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All tutors">
                {tutorFilter === "all"
                  ? "All tutors"
                  : allTutors.find((t) => t.id === tutorFilter)?.name ?? "All tutors"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tutors</SelectItem>
              {allTutors.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <TabBar
        tabs={tabs}
        activeTab={filter}
        onChange={(key) => setFilter(key as Filter)}
      />

      {loading ? (
        <LoadingPlaceholder />
      ) : (
        <DataTable
          columns={lessonColumns}
          data={lessons}
          rowKey={(l) => l.id}
          onRowClick={(l) => setDetailLesson(l)}
          rowClassName={(l) => selected.has(l.id) ? "bg-yellow-50" : ""}
          defaultSort={{ key: "date", direction: filter === "upcoming" ? "asc" : "desc" }}
          emptyMessage={`No ${filter === "all" ? "" : filter === "past" ? "past " : "upcoming "}lessons found.`}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={(open) => { if (!open) setShowDeleteDialog(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {selected.size} {selected.size === 1 ? "Lesson" : "Lessons"}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to permanently delete {selected.size === 1 ? "this lesson" : `these ${selected.size} lessons`}? This action cannot be undone.
          </p>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" />}>
              Cancel
            </DialogClose>
            <Button
              size="sm"
              variant="destructive"
              onClick={handleDeleteSelected}
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lesson Detail Modal */}
      <Dialog open={!!detailLesson} onOpenChange={(open) => { if (!open) setDetailLesson(null); }}>
        <DialogContent className="max-w-lg">
          {detailLesson && (() => {
            const start = new Date(detailLesson.starts_at);
            const end = new Date(detailLesson.ends_at);
            const payment = detailLesson.payments?.[0];
            const meetingLink = detailLesson.meeting_link || detailLesson.tutors?.meeting_link;
            const isCancelled = ["canceled", "late_cancel"].includes(detailLesson.status);
            return (
              <>
                <DialogHeader>
                  <div className="flex items-center justify-between">
                    <DialogTitle>{detailLesson.subjects?.name ?? "Lesson"}</DialogTitle>
                    <Badge variant="secondary" className={`text-xs ${statusColors[detailLesson.status] || ""}`}>
                      {detailLesson.status.replace("_", " ")}
                    </Badge>
                  </div>
                </DialogHeader>
                <div className="space-y-3 py-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Learner</span>
                    <span className="font-medium">{detailLesson.learners?.full_name ?? "—"}</span>
                  </div>
                  {isSuperadmin && detailLesson.tutors?.profiles && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Tutor</span>
                      <span className="font-medium">{detailLesson.tutors.profiles.full_name}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Date</span>
                    <span className="font-medium">{start.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Time</span>
                    <span className="font-medium">
                      {start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })} – {end.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", timeZoneName: "short" })}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Format</span>
                    <span className="font-medium capitalize">{detailLesson.format}</span>
                  </div>
                  {meetingLink && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Meeting</span>
                      <a href={meetingLink} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline-offset-2 hover:underline">
                        {meetingLink.includes("meet.google") ? "Google Meet" : meetingLink.includes("zoom") ? "Zoom" : "Join Link"}
                      </a>
                    </div>
                  )}
                  {payment && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Amount</span>
                        <span className="capitalize"><span className="font-bold">${(payment.amount_cents / 100).toFixed(2)}</span> — {payment.status}</span>
                      </div>
                      {isCancelled && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Credit</span>
                          <span className="font-bold text-green-600">
                            +${(payment.amount_cents / 100).toFixed(2)} — {detailLesson.status === "late_cancel" ? "Late Cancellation" : "Cancelled"}
                          </span>
                        </div>
                      )}
                    </>
                  )}
                  {detailLesson.focus_notes && (
                    <div className="border-t pt-3">
                      <span className="text-muted-foreground">Focus notes</span>
                      <p className="mt-1">{detailLesson.focus_notes}</p>
                    </div>
                  )}
                  {detailLesson.cancel_reason && (
                    <div className="border-t pt-3">
                      <span className="text-muted-foreground">Cancel reason</span>
                      <p className="mt-1">{detailLesson.cancel_reason}</p>
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <DialogClose render={<Button variant="outline" size="sm" />}>
                    Close
                  </DialogClose>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
