"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { lessonStatusColors as statusColors } from "@/lib/status-colors";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MessageCircle } from "lucide-react";
import { SubjectSearch, type SearchableSubject } from "@/components/subject-search";
import { LessonDetailModal } from "@/components/lesson-detail-modal";
import { DataTable, type Column } from "@/components/data-table";
import { TabBar } from "@/components/tab-bar";
import { formatShortDate, formatTimeRange } from "@/lib/format";
import { LoadingPlaceholder } from "@/components/loading-placeholder";
import { EmptyState } from "@/components/empty-state";

interface Lesson {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  format: string;
  tutor_id: string;
  subjects: { name: string } | null;
  learners: { full_name: string } | null;
  tutors: { meeting_link: string | null; profiles: { full_name: string } | null } | null;
  payments: { amount_cents: number; status: string }[] | null;
}

const HISTORY_STATUSES = ["completed", "canceled", "late_cancel", "no_show"];
const UPCOMING_STATUSES = ["confirmed"];

export default function LessonsPage() {
  const router = useRouter();
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadCounts, setUnreadCounts] = useState<Map<string, number>>(new Map());
  const [subjects, setSubjects] = useState<SearchableSubject[]>([]);
  const [detailLessonId, setDetailLessonId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("upcoming");
  const [profileId, setProfileId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    // Auto-complete any past confirmed lessons before loading
    await fetch("/api/lessons/complete-past", { method: "POST" }).catch(() => {});

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("user_id", user.id)
      .single();

    if (!profile) { router.push("/onboarding"); return; }
    if (profile.role === "tutor") { router.push("/dashboard"); return; }
    setProfileId(profile.id);

    // Fetch ALL lessons (upcoming + history), excluding temporary holds
    const { data: lessonData } = await supabase
      .from("lessons")
      .select(`
        id, starts_at, ends_at, status, format, tutor_id,
        subjects(name),
        learners(full_name),
        tutors(meeting_link, profiles(full_name)),
        payments(amount_cents, status)
      `)
      .eq("booked_by", profile.id)
      .neq("status", "held")
      .order("starts_at", { ascending: false })
      .limit(200);

    setLessons((lessonData as unknown as Lesson[]) ?? []);

    // Fetch subjects for search bar
    const { data: subjectData } = await supabase
      .from("subjects")
      .select("id, name, category")
      .order("category")
      .order("name");
    setSubjects(
      (subjectData ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        category: s.category ?? "Other",
      }))
    );

    // Get unread message counts per lesson_id
    const { data: convos } = await supabase
      .from("conversations")
      .select("id, tutor_id")
      .eq("account_holder_id", profile.id);

    if (convos && convos.length > 0) {
      const counts = new Map<string, number>();
      const allConvIds = convos.map((c) => c.id);
      const { data: unreadMsgs } = await supabase
        .from("messages")
        .select("lesson_id")
        .in("conversation_id", allConvIds)
        .neq("sender_id", profile.id)
        .is("read_at", null)
        .not("lesson_id", "is", null);

      if (unreadMsgs) {
        for (const msg of unreadMsgs) {
          if (msg.lesson_id) {
            counts.set(msg.lesson_id, (counts.get(msg.lesson_id) ?? 0) + 1);
          }
        }
      }
      setUnreadCounts(counts);
    }

    setLoading(false);
  }, [router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Realtime: refresh when lessons change
  useEffect(() => {
    if (!profileId) return;
    const supabase = createClient();

    const channel = supabase
      .channel("client-lessons")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lessons" },
        () => { loadData(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [profileId, loadData]);

  const now = new Date().toISOString();

  const upcomingLessons = useMemo(
    () => lessons.filter((l) => UPCOMING_STATUSES.includes(l.status) && l.ends_at >= now),
    [lessons, now]
  );

  const historyLessons = useMemo(
    () => lessons.filter((l) => HISTORY_STATUSES.includes(l.status) || l.ends_at < now),
    [lessons, now]
  );

  const displayedLessons = useMemo(() => {
    if (activeTab === "upcoming") {
      return [...upcomingLessons].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    }
    if (activeTab === "history") {
      return [...historyLessons].sort((a, b) => b.starts_at.localeCompare(a.starts_at));
    }
    // all — newest first
    return [...lessons].sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  }, [activeTab, upcomingLessons, historyLessons, lessons]);

  const tabs = useMemo(() => [
    { key: "upcoming", label: "Upcoming", count: upcomingLessons.length },
    { key: "history", label: "History", count: historyLessons.length },
    { key: "all", label: "All Lessons", count: lessons.length },
  ], [upcomingLessons.length, historyLessons.length, lessons.length]);

  const columns: Column<Lesson>[] = useMemo(() => [
    {
      key: "date",
      label: "Date",
      sortable: true,
      sortValue: (l) => new Date(l.starts_at).getTime(),
      render: (l) => formatShortDate(l.starts_at),
    },
    {
      key: "time",
      label: "Time",
      sortable: true,
      cellClassName: "text-muted-foreground",
      sortValue: (l) => new Date(l.starts_at).getTime(),
      render: (l) => formatTimeRange(l.starts_at, l.ends_at),
    },
    {
      key: "subject",
      label: "Subject",
      sortable: true,
      sortValue: (l) => l.subjects?.name ?? "",
      render: (l) => l.subjects?.name ?? "—",
    },
    {
      key: "learner",
      label: "Learner",
      sortable: true,
      sortValue: (l) => l.learners?.full_name ?? "",
      render: (l) => l.learners?.full_name ?? "—",
    },
    {
      key: "tutor",
      label: "Tutor",
      sortable: true,
      sortValue: (l) => (l.tutors as unknown as { profiles: { full_name: string } })?.profiles?.full_name ?? "",
      render: (l) => (l.tutors as unknown as { profiles: { full_name: string } })?.profiles?.full_name ?? "—",
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      sortValue: (l) => l.status,
      render: (l) => {
        const unread = unreadCounts.get(l.id) ?? 0;
        return (
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className={`text-xs ${statusColors[l.status] || ""}`}>
              {l.status.replace("_", " ")}
            </Badge>
            {unread > 0 && (
              <div className="relative">
                <MessageCircle className="size-4 text-primary" />
                <span className="absolute -top-1.5 -right-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-destructive px-0.5 text-[9px] font-bold text-destructive-foreground">
                  {unread}
                </span>
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: "actions",
      label: "",
      align: "right" as const,
      render: (l) => (
        <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); setDetailLessonId(l.id); }}>
          Details
        </Button>
      ),
    },
  ], [unreadCounts]);

  if (loading) {
    return <LoadingPlaceholder />;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Lessons</h1>

      <TabBar tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {displayedLessons.length === 0 ? (
        <Card className="overflow-visible">
          <CardContent className="py-6 space-y-4">
            {activeTab === "upcoming" && subjects.length > 0 && (
              <SubjectSearch
                subjects={subjects}
                dropdownDirection="down"
                variant="inline"
              />
            )}
            <EmptyState
              message={
                activeTab === "upcoming"
                  ? "No upcoming lessons"
                  : activeTab === "history"
                    ? "No past lessons yet"
                    : "No lessons yet"
              }
              className="py-6"
            />
          </CardContent>
        </Card>
      ) : (
        <DataTable
          columns={columns}
          data={displayedLessons}
          rowKey={(l) => l.id}
          onRowClick={(l) => setDetailLessonId(l.id)}
          defaultSort={{ key: "date", direction: activeTab === "upcoming" ? "asc" : "desc" }}
          emptyMessage="No lessons found."
        />
      )}

      <LessonDetailModal lessonId={detailLessonId} onClose={() => setDetailLessonId(null)} />
    </div>
  );
}
