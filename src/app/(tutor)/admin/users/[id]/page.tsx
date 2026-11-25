"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { DataTable, type Column } from "@/components/data-table";
import { lessonStatusColors, roleColors } from "@/lib/status-colors";
import { createClient } from "@/lib/supabase/client";
import { formatPhone } from "@/lib/phone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft } from "lucide-react";
import { LessonDetailModal } from "@/components/lesson-detail-modal";
import { TabBar } from "@/components/tab-bar";
import { ProfileForm } from "@/components/profile-form";
import { ChangePasswordForm } from "@/components/change-password-form";
import { ManageLearners } from "@/components/manage-learners";
import { CollapsibleCard } from "@/components/collapsible-card";
import { TutorProfileContent } from "@/app/(tutor)/profile/page";

interface Profile {
  id: string;
  user_id: string;
  role: string;
  full_name: string;
  email: string;
  phone: string | null;
  time_zone: string;
  created_at: string;
  updated_at: string;
}

interface Learner {
  id: string;
  full_name: string;
  is_self: boolean;
  grade_level: string | null;
  school: string | null;
}

interface Lesson {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  format: string;
  focus_notes: string | null;
  cancel_reason: string | null;
  subjects: { name: string } | null;
  learners: { full_name: string } | null;
  tutors: { id: string; profile_id: string; profiles: { full_name: string } } | null;
}

interface Payment {
  id: string;
  amount_cents: number;
  status: string;
  created_at: string;
  lessons: { id: string; starts_at: string; subjects: { name: string } | null } | null;
}

interface Refund {
  id: string;
  payment_id: string;
  amount_cents: number;
  reason: string | null;
  created_at: string;
}

interface Conversation {
  id: string;
  created_at: string;
  tutors: { profile_id: string; profiles: { full_name: string } } | null;
  messages: Array<{
    id: string;
    sender_id: string;
    content: string;
    created_at: string;
    read_at: string | null;
  }>;
}

interface Financial {
  total_paid_cents: number;
  total_refunded_cents: number;
  net_revenue_cents: number;
  lesson_count: number;
}

interface TutorInfo {
  id: string;
  full_name: string;
  profile_id: string;
}


type LessonFilter = "" | "confirmed" | "completed" | "canceled" | "late_cancel" | "no_show";

export default function AdminUserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [learners, setLearners] = useState<Learner[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [tutors, setTutors] = useState<TutorInfo[]>([]);
  const [financial, setFinancial] = useState<Financial | null>(null);

  // Lesson table controls
  const [lessonFilter, setLessonFilter] = useState<LessonFilter>("");
  const [lessonSearch, setLessonSearch] = useState("");
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") || "overview");

  useEffect(() => {
    async function check() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      const { data: p } = await supabase
        .from("profiles")
        .select("role")
        .eq("user_id", user.id)
        .single();
      if (p?.role !== "superadmin") { router.push("/dashboard"); return; }
      setAuthorized(true);
    }
    check();
  }, [router]);

  const loadData = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/users/${id}`);
    const data = await res.json();
    if (res.ok) {
      setProfile(data.profile);
      setLearners(data.learners);
      setLessons(data.lessons);
      setPayments(data.payments);
      setRefunds(data.refunds);
      setConversations(data.conversations);
      setTutors(data.tutors);
      setFinancial(data.financial);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    if (authorized) loadData();
  }, [authorized, loadData]);

  const lessonColumns: Column<Lesson>[] = useMemo(() => [
    {
      key: "date",
      label: "Date",
      sortable: true,
      sortValue: (row) => new Date(row.starts_at).getTime(),
      render: (row) => {
        const start = new Date(row.starts_at);
        return start.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
      },
    },
    {
      key: "time",
      label: "Time",
      sortable: true,
      sortValue: (row) => new Date(row.starts_at).getTime(),
      cellClassName: "text-muted-foreground",
      render: (row) => {
        const start = new Date(row.starts_at);
        const end = new Date(row.ends_at);
        return (
          <>
            {start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
            {" – "}
            {end.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", timeZoneName: "short" })}
          </>
        );
      },
    },
    {
      key: "subject",
      label: "Subject",
      sortable: true,
      sortValue: (row) => (row.subjects as { name: string } | null)?.name ?? "",
      render: (row) => (row.subjects as { name: string } | null)?.name ?? "—",
    },
    {
      key: "learner",
      label: "Learner",
      sortable: true,
      sortValue: (row) => (row.learners as { full_name: string } | null)?.full_name ?? "",
      render: (row) => (row.learners as { full_name: string } | null)?.full_name ?? "—",
    },
    {
      key: "tutor",
      label: "Tutor",
      sortable: true,
      sortValue: (row) => (row.tutors as { profiles: { full_name: string } } | null)?.profiles?.full_name ?? "",
      render: (row) => {
        const t = row.tutors as { profile_id: string; profiles: { full_name: string } } | null;
        return t?.profile_id ? (
          <Link href={`/admin/users/${t.profile_id}`} className="text-primary underline-offset-2 hover:underline">
            {t.profiles?.full_name ?? "—"}
          </Link>
        ) : "—";
      },
    },
    {
      key: "format",
      label: "Format",
      sortable: true,
      sortValue: (row) => row.format,
      cellClassName: "capitalize",
      render: (row) => row.format,
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      sortValue: (row) => row.status,
      render: (row) => (
        <Badge variant="secondary" className={`text-xs ${lessonStatusColors[row.status] || ""}`}>
          {row.status.replace("_", " ")}
        </Badge>
      ),
    },
  ], []);

  const paymentColumns: Column<Payment>[] = useMemo(() => [
    {
      key: "date",
      label: "Date",
      sortable: true,
      sortValue: (row) => new Date(row.created_at).getTime(),
      cellClassName: "text-muted-foreground",
      render: (row) =>
        new Date(row.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }),
    },
    {
      key: "subject",
      label: "Subject",
      sortable: true,
      sortValue: (row) => (row.lessons as { subjects: { name: string } | null } | null)?.subjects?.name ?? "",
      render: (row) =>
        (row.lessons as { subjects: { name: string } | null } | null)?.subjects?.name ?? "—",
    },
    {
      key: "amount",
      label: "Amount",
      sortable: true,
      align: "right" as const,
      cellClassName: "font-bold",
      sortValue: (row) => row.amount_cents,
      render: (row) => `$${(row.amount_cents / 100).toFixed(2)}`,
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      sortValue: (row) => row.status,
      render: (row) => (
        <Badge variant="secondary" className="text-xs">{row.status.replace("_", " ")}</Badge>
      ),
    },
    {
      key: "refunded",
      label: "Refunded",
      sortable: true,
      align: "right" as const,
      cellClassName: "text-muted-foreground",
      sortValue: (row) => refunds.filter((r) => r.payment_id === row.id).reduce((s, r) => s + r.amount_cents, 0),
      render: (row) => {
        const totalRefunded = refunds.filter((r) => r.payment_id === row.id).reduce((s, r) => s + r.amount_cents, 0);
        return totalRefunded > 0 ? `$${(totalRefunded / 100).toFixed(2)}` : "—";
      },
    },
  ], [refunds]);

  const isTutor = profile?.role === "tutor" || profile?.role === "superadmin";
  const isClient = profile?.role === "client";

  const adminTabs = useMemo(() => {
    const t = [
      { key: "overview", label: "Overview" },
      { key: "settings", label: "Settings" },
    ];
    if (isTutor) {
      t.push({ key: "tutor-profile", label: "Tutor Profile" });
    }
    return t;
  }, [isTutor]);

  if (!authorized || loading) {
    return <p className="py-12 text-center text-muted-foreground">Loading...</p>;
  }

  if (!profile) {
    return <p className="py-12 text-center text-muted-foreground">User not found.</p>;
  }

  const memberSince = new Date(profile.created_at);
  const now = new Date();
  const diffMs = now.getTime() - memberSince.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffMonths = Math.floor(diffDays / 30);
  const durationLabel = diffMonths >= 12
    ? `${Math.floor(diffMonths / 12)}y ${diffMonths % 12}m`
    : diffMonths > 0
      ? `${diffMonths} month${diffMonths !== 1 ? "s" : ""}`
      : `${diffDays} day${diffDays !== 1 ? "s" : ""}`;

  // Sort & filter lessons
  let filteredLessons = [...lessons];
  if (lessonFilter) {
    filteredLessons = filteredLessons.filter((l) => l.status === lessonFilter);
  }
  if (lessonSearch) {
    const s = lessonSearch.toLowerCase();
    filteredLessons = filteredLessons.filter((l) =>
      (l.subjects as { name: string } | null)?.name?.toLowerCase().includes(s) ||
      (l.learners as { full_name: string } | null)?.full_name?.toLowerCase().includes(s) ||
      (l.tutors as { profiles: { full_name: string } } | null)?.profiles?.full_name?.toLowerCase().includes(s)
    );
  }

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Button variant="ghost" size="sm" className="gap-1.5" render={<Link href="/admin/users" />}>
        <ArrowLeft className="h-4 w-4" />
        Back to Users
      </Button>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{profile.full_name}</h1>
          <p className="text-muted-foreground">{profile.email}</p>
        </div>
        <Badge variant="secondary" className={`text-xs ${roleColors[profile.role] || "bg-gray-100 text-gray-800"}`}>
          {profile.role}
        </Badge>
      </div>

      <TabBar tabs={adminTabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* Overview Tab */}
      {activeTab === "overview" && (
        <>
          {/* Info Cards Row */}
          <div className="grid gap-4 md:grid-cols-3">
            {/* Basic Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Account Info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <AccountInfoRow label="Account ID" value={profile.id} mono />
                <AccountInfoRow label="Member since" value={`${memberSince.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })} (${durationLabel})`} />
                <AccountInfoRow label="Phone" value={profile.phone ? formatPhone(profile.phone) : "—"} />
                <AccountInfoRow label="Time zone" value={profile.time_zone.replace(/_/g, " ")} />
                <AccountInfoRow label="Role" value={profile.role} />
                {learners.length > 0 && (
                  <div className="flex gap-4">
                    <span className="w-28 shrink-0 text-muted-foreground">Learners</span>
                    <span className="font-semibold">
                      {learners.map((l) => (
                        <span key={l.id} className="mr-2">
                          {l.full_name}
                          {l.is_self && <span className="text-muted-foreground text-xs font-normal"> (self)</span>}
                          {l.grade_level && <span className="text-muted-foreground text-xs font-normal"> · {l.grade_level}</span>}
                        </span>
                      ))}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Financial */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Financial Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <InfoRow label="Total lessons" value={String(financial?.lesson_count ?? 0)} />
                <InfoRow label="Total paid" value={`$${((financial?.total_paid_cents ?? 0) / 100).toFixed(2)}`} bold />
                <InfoRow label="Total refunded" value={`$${((financial?.total_refunded_cents ?? 0) / 100).toFixed(2)}`} bold />
                <Separator />
                <InfoRow label="Net revenue" value={`$${((financial?.net_revenue_cents ?? 0) / 100).toFixed(2)}`} bold />
              </CardContent>
            </Card>

            {/* Tutors */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Tutors</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                {tutors.length === 0 ? (
                  <p className="text-muted-foreground">No tutors yet.</p>
                ) : (
                  <ul className="space-y-1">
                    {tutors.map((t) => (
                      <li key={t.id} className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-green-500" />
                        <Link href={`/admin/users/${t.profile_id}`} className="text-primary underline-offset-2 hover:underline">
                          {t.full_name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Lessons Table */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium">Lessons ({filteredLessons.length})</h2>
              <div className="flex gap-2">
                <Input
                  placeholder="Search lessons..."
                  value={lessonSearch}
                  onChange={(e) => setLessonSearch(e.target.value)}
                  className="w-48"
                />
                <Select value={lessonFilter || "all"} onValueChange={(val) => setLessonFilter(val === "all" ? "" : (val ?? "") as LessonFilter)}>
                  <SelectTrigger className="w-36">
                    <SelectValue placeholder="All statuses">
                      {lessonFilter ? lessonFilter.replace("_", " ") : "All statuses"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="confirmed">Confirmed</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="canceled">Canceled</SelectItem>
                    <SelectItem value="late_cancel">Late Cancel</SelectItem>
                    <SelectItem value="no_show">No Show</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DataTable
              columns={lessonColumns}
              data={filteredLessons}
              rowKey={(row) => row.id}
              onRowClick={(row) => setSelectedLessonId(row.id)}
              defaultSort={{ key: "date", direction: "desc" }}
              emptyMessage="No lessons found."
            />
          </div>

          <LessonDetailModal
            lessonId={selectedLessonId}
            onClose={() => setSelectedLessonId(null)}
          />

          {/* Payments & Refunds */}
          {payments.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-medium">Payments ({payments.length})</h2>
              <DataTable
                columns={paymentColumns}
                data={payments}
                rowKey={(row) => row.id}
                onRowClick={(row) => {
                  if (row.lessons?.id) setSelectedLessonId(row.lessons.id);
                }}
                defaultSort={{ key: "date", direction: "desc" }}
                emptyMessage="No payments found."
              />
            </div>
          )}

          {/* Messages */}
          {conversations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Messages</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {conversations.map((convo) => {
                  const tutorData = convo.tutors as { profile_id: string; profiles: { full_name: string } } | null;
                  const tutorName = tutorData?.profiles?.full_name ?? "Tutor";
                  const msgs = convo.messages || [];
                  const recentMsgs = msgs
                    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                    .slice(0, 5);

                  return (
                    <div key={convo.id} className="rounded-lg border p-4">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-sm font-medium">Conversation with{" "}
                          {tutorData?.profile_id ? (
                            <Link href={`/admin/users/${tutorData.profile_id}`} className="text-primary underline-offset-2 hover:underline">
                              {tutorName}
                            </Link>
                          ) : tutorName}
                        </p>
                        <span className="text-xs text-muted-foreground">{msgs.length} messages</span>
                      </div>
                      {recentMsgs.length > 0 ? (
                        <div className="space-y-2">
                          {recentMsgs.map((msg) => {
                            const isSender = msg.sender_id === profile.id;
                            return (
                              <div key={msg.id} className="flex gap-2 text-sm">
                                <span className={`shrink-0 font-medium ${isSender ? "text-foreground" : "text-primary"}`}>
                                  {isSender ? profile.full_name.split(" ")[0] : tutorName.split(" ")[0]}:
                                </span>
                                <span className="text-muted-foreground line-clamp-1">{msg.content}</span>
                                <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                                  {new Date(msg.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                                </span>
                              </div>
                            );
                          })}
                          {msgs.length > 5 && (
                            <p className="text-xs text-muted-foreground">...and {msgs.length - 5} more messages</p>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">No messages yet.</p>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Settings Tab */}
      {activeTab === "settings" && (
        <div className="space-y-6">
          <ProfileForm profileId={profile.id} onSaved={loadData} />
          {isClient && (
            <CollapsibleCard title="Learners" description="Manage learners for this account.">
              <CardContent>
                <ManageLearners profileId={profile.id} />
              </CardContent>
            </CollapsibleCard>
          )}
          <ChangePasswordForm profileId={profile.id} email={profile.email} />
        </div>
      )}

      {/* Tutor Profile Tab */}
      {activeTab === "tutor-profile" && isTutor && (
        <TutorProfileContent targetProfileId={profile.id} />
      )}
    </div>
  );
}

function AccountInfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-4">
      <span className="w-28 shrink-0 text-muted-foreground">{label}</span>
      <span className={`font-semibold ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
    </div>
  );
}

function InfoRow({ label, value, mono, bold }: { label: string; value: string; mono?: boolean; bold?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className={`text-right ${mono ? "font-mono text-xs" : ""} ${bold ? "font-bold" : ""}`}>{value}</span>
    </div>
  );
}
