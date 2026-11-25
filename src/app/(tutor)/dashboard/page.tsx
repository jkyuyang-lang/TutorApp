"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TabBar } from "@/components/tab-bar";
import { calculateRefund, type CancellationPolicy } from "@/lib/refund-policy";
import { MessageCircle, Paperclip, Trash2, X, Calendar, List } from "lucide-react";
import Link from "next/link";
import { LoadingPlaceholder } from "@/components/loading-placeholder";
import { DataTable, type Column } from "@/components/data-table";

type View = "today" | "upcoming" | "inquiries" | "notes" | "earnings" | null;
type LessonDisplayMode = "list" | "calendar";

interface Lesson {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  format: string;
  focus_notes: string | null;
  meeting_link: string | null;
  cancel_reason: string | null;
  booked_by: string;
  subjects: { name: string } | null;
  learners: { full_name: string } | null;
  tutors: { profile_id: string; meeting_link: string | null; profiles: { full_name: string } } | null;
  payments: { amount_cents: number; status: string }[] | null;
}

interface ChatMessage {
  id: string;
  sender_id: string;
  content: string;
  attachments: { name: string; url: string; type: string }[];
  created_at: string;
  read_at: string | null;
}

type ModalTab = "details" | "messages";

interface Inquiry {
  id: string;
  name: string;
  email: string;
  subject: string | null;
  learner_grade: string | null;
  message: string;
  status: string;
  created_at: string;
}

interface NoteItem {
  id: string;
  lesson_id: string;
  covered: string | null;
  homework: string | null;
  next_steps: string | null;
  status: string;
  lessons: { starts_at: string; ends_at: string; booked_by: string; subjects: { name: string } | null; learners: { full_name: string } | null; tutors: { profile_id: string; profiles: { full_name: string } } | null } | null;
}

interface Payment {
  id: string;
  amount_cents: number;
  status: string;
  created_at: string;
  lessons: { starts_at: string; ends_at: string; status: string; cancel_reason: string | null; rescheduled_to: string | null; booked_by: string; subjects: { name: string } | null; learners: { full_name: string } | null; tutors: { profile_id: string; profiles: { full_name: string } } | null } | null;
}

interface TutorOption {
  id: string;
  name: string;
}

export default function TutorDashboardPage() {
  const [tutorId, setTutorId] = useState<string | null>(null);
  const [cancellationPolicy, setCancellationPolicy] = useState<CancellationPolicy | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string>("");
  const [loading, setLoading] = useState(true);

  // Superadmin: all tutors list + selected filter
  const [allTutors, setAllTutors] = useState<TutorOption[]>([]);
  const [selectedTutorFilter, setSelectedTutorFilter] = useState<string>("all");

  // Stats
  const [todayCount, setTodayCount] = useState(0);
  const [weekCount, setWeekCount] = useState(0);
  const [inquiryCount, setInquiryCount] = useState(0);
  const [notesDueCount, setNotesDueCount] = useState(0);
  const [monthEarnings, setMonthEarnings] = useState(0);
  const [tutorAppsCount, setTutorAppsCount] = useState(0);

  // Active view
  const [activeView, setActiveView] = useState<View>("today");
  const [lessonDisplayMode, setLessonDisplayMode] = useState<LessonDisplayMode>("list");

  // List data
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [rescheduledDates, setRescheduledDates] = useState<Map<string, { starts_at: string; ends_at: string }>>(new Map());
  const [listLoading, setListLoading] = useState(false);

  // Lesson status filter
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Earnings date filter
  const [earningsFilter, setEarningsFilter] = useState<string>("month");
  const [earningsFrom, setEarningsFrom] = useState<string>("");
  const [earningsTo, setEarningsTo] = useState<string>("");

  // Edit modal
  const [editItem, setEditItem] = useState<Record<string, unknown> | null>(null);
  const [editType, setEditType] = useState<View>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [modalTab, setModalTab] = useState<ModalTab>("details");

  // Bulk selection & delete
  const [selectedLessons, setSelectedLessons] = useState<Set<string>>(new Set());
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatText, setChatText] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [chatAttachments, setChatAttachments] = useState<File[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Unread message counts per lesson_id
  const [unreadCounts, setUnreadCounts] = useState<Map<string, number>>(new Map());
  const [chatLessonId, setChatLessonId] = useState<string | null>(null);

  const loadStats = useCallback(async (tutorFilter?: string) => {
    // Auto-complete any past confirmed lessons (fire-and-forget)
    fetch("/api/lessons/complete-past", { method: "POST" }).catch(() => {});

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("user_id", user.id)
      .single();
    if (!profile) return;

    setProfileId(profile.id);
    setUserRole(profile.role);
    const isSuperadmin = profile.role === "superadmin";

    // For superadmin, load all tutors for the filter dropdown (only once)
    if (isSuperadmin && allTutors.length === 0) {
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

    // Get this user's own tutor record (if any)
    const { data: tutor } = await supabase
      .from("tutors")
      .select("id, cancellation_policy")
      .eq("profile_id", profile.id)
      .single();

    if (!isSuperadmin && !tutor) return;

    const ownTutorId = tutor?.id ?? null;
    setTutorId(ownTutorId);
    if (tutor?.cancellation_policy) setCancellationPolicy(tutor.cancellation_policy as unknown as CancellationPolicy);

    const effectiveFilter = tutorFilter ?? selectedTutorFilter;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    // Build queries with optional tutor filter
    let todayQ = supabase.from("lessons").select("id", { count: "exact", head: true })
      .gte("starts_at", today.toISOString()).lt("starts_at", tomorrow.toISOString()).neq("status", "held");
    let upcomingQ = supabase.from("lessons").select("id", { count: "exact", head: true })
      .gte("starts_at", today.toISOString()).eq("status", "confirmed");
    let inqQ = supabase.from("inquiries").select("id", { count: "exact", head: true }).eq("status", "new");
    let notesDraftQ = supabase.from("lesson_notes").select("id", { count: "exact", head: true }).eq("status", "draft");
    let noNotesQ = supabase.from("lessons").select("id", { count: "exact", head: true }).eq("status", "completed");
    let paymentsQ = supabase.from("payments").select("amount_cents")
      .in("status", ["succeeded", "partially_refunded"]).gte("created_at", monthStart.toISOString());

    if (isSuperadmin) {
      if (effectiveFilter !== "all") {
        todayQ = todayQ.eq("tutor_id", effectiveFilter);
        upcomingQ = upcomingQ.eq("tutor_id", effectiveFilter);
        inqQ = inqQ.eq("tutor_id", effectiveFilter);
        notesDraftQ = notesDraftQ.eq("tutor_id", effectiveFilter);
        noNotesQ = noNotesQ.eq("tutor_id", effectiveFilter);
        paymentsQ = paymentsQ.eq("tutor_id", effectiveFilter);
      }
    } else {
      todayQ = todayQ.eq("tutor_id", ownTutorId!);
      upcomingQ = upcomingQ.eq("tutor_id", ownTutorId!);
      inqQ = inqQ.eq("tutor_id", ownTutorId!);
      notesDraftQ = notesDraftQ.eq("tutor_id", ownTutorId!);
      noNotesQ = noNotesQ.eq("tutor_id", ownTutorId!);
      paymentsQ = paymentsQ.eq("tutor_id", ownTutorId!);
    }

    const [todayRes, upcomingRes, inqRes, notesDraftRes, noNotesRes, paymentsRes] = await Promise.all([
      todayQ, upcomingQ, inqQ, notesDraftQ, noNotesQ, paymentsQ,
    ]);

    setTodayCount(todayRes.count ?? 0);
    setWeekCount(upcomingRes.count ?? 0);
    setInquiryCount(inqRes.count ?? 0);
    setNotesDueCount((notesDraftRes.count ?? 0) + (noNotesRes.count ?? 0));
    setMonthEarnings((paymentsRes.data ?? []).reduce((sum, p) => sum + p.amount_cents, 0));

    // Tutor applications count (superadmin only)
    if (isSuperadmin) {
      try {
        const appsRes = await fetch("/api/admin/tutor-applications");
        if (appsRes.ok) {
          const appsData = await appsRes.json();
          const pending = (appsData.applications ?? []).filter((a: { status: string }) => a.status === "pending");
          setTutorAppsCount(pending.length);
        }
      } catch { /* ignore */ }
    }

    setLoading(false);

    // Load unread message counts per lesson_id only
    const { data: unreadMsgs } = await supabase
      .from("messages")
      .select("lesson_id")
      .neq("sender_id", profile.id)
      .is("read_at", null)
      .not("lesson_id", "is", null);

    if (unreadMsgs && unreadMsgs.length > 0) {
      const counts = new Map<string, number>();
      for (const msg of unreadMsgs) {
        if (msg.lesson_id) {
          counts.set(msg.lesson_id, (counts.get(msg.lesson_id) ?? 0) + 1);
        }
      }
      setUnreadCounts(counts);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTutorFilter]);

  const initialLoadDone = useRef(false);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // Auto-load "today" on initial mount
  useEffect(() => {
    if ((tutorId || userRole === "superadmin") && !initialLoadDone.current) {
      initialLoadDone.current = true;
      loadList("today");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tutorId, userRole]);

  // Reload stats + list when tutor filter changes (superadmin)
  useEffect(() => {
    if (userRole !== "superadmin") return;
    loadStats(selectedTutorFilter);
    if (activeView) loadList(activeView);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTutorFilter]);

  // Helper to get the effective tutor ID for queries
  function getEffectiveTutorId(): string | null {
    if (userRole === "superadmin") {
      return selectedTutorFilter === "all" ? null : selectedTutorFilter;
    }
    return tutorId;
  }

  async function loadList(view: View) {
    if (!view) return;
    if (userRole !== "superadmin" && !tutorId) return;
    setListLoading(true);
    setActiveView(view);
    setStatusFilter("all");

    const supabase = createClient();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const effectiveTutor = getEffectiveTutorId();
    const lessonSelect = "id, starts_at, ends_at, status, format, focus_notes, meeting_link, cancel_reason, booked_by, subjects(name), learners(full_name), tutors(profile_id, meeting_link, profiles(full_name)), payments(amount_cents, status)";

    if (view === "today") {
      let q = supabase.from("lessons").select(lessonSelect)
        .gte("starts_at", today.toISOString()).lt("starts_at", tomorrow.toISOString()).neq("status", "held").order("starts_at");
      if (effectiveTutor) q = q.eq("tutor_id", effectiveTutor);
      const { data } = await q;
      setLessons((data as unknown as Lesson[]) ?? []);
    } else if (view === "upcoming") {
      let q = supabase.from("lessons").select(lessonSelect)
        .gte("starts_at", today.toISOString()).in("status", ["confirmed", "completed", "canceled", "late_cancel", "no_show"]).order("starts_at");
      if (effectiveTutor) q = q.eq("tutor_id", effectiveTutor);
      const { data } = await q;
      setLessons((data as unknown as Lesson[]) ?? []);
    } else if (view === "inquiries") {
      let q = supabase.from("inquiries").select("*").eq("status", "new").order("created_at", { ascending: false });
      if (effectiveTutor) q = q.eq("tutor_id", effectiveTutor);
      const { data } = await q;
      setInquiries((data as Inquiry[]) ?? []);
    } else if (view === "notes") {
      let q = supabase.from("lesson_notes")
        .select("id, lesson_id, covered, homework, next_steps, status, lessons(starts_at, ends_at, booked_by, subjects(name), learners(full_name), tutors(profile_id, profiles(full_name)))")
        .eq("status", "draft");
      if (effectiveTutor) q = q.eq("tutor_id", effectiveTutor);
      const { data } = await q;
      setNotes((data as unknown as NoteItem[]) ?? []);
    } else if (view === "earnings") {
      await loadEarnings("month");
    }
    setListLoading(false);
  }

  async function loadEarnings(filter?: string) {
    if (userRole !== "superadmin" && !tutorId) return;
    const f = filter ?? earningsFilter;
    if (filter) {
      setEarningsFilter(f);
    }

    const supabase = createClient();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let fromDate: string;
    let toDate: string | null = null;

    if (f === "month") {
      fromDate = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();
    } else if (f === "year") {
      fromDate = new Date(today.getFullYear(), 0, 1).toISOString();
    } else {
      fromDate = earningsFrom ? new Date(earningsFrom).toISOString() : new Date(today.getFullYear(), today.getMonth(), 1).toISOString();
      toDate = earningsTo ? new Date(earningsTo + "T23:59:59").toISOString() : null;
    }

    const effectiveTutor = getEffectiveTutorId();
    let query = supabase
      .from("payments")
      .select("id, amount_cents, status, created_at, lessons(starts_at, ends_at, status, cancel_reason, rescheduled_to, booked_by, subjects(name), learners(full_name), tutors(profile_id, profiles(full_name)))")
      .in("status", ["succeeded", "partially_refunded", "refunded"])
      .gte("created_at", fromDate)
      .order("created_at", { ascending: false });

    if (effectiveTutor) query = query.eq("tutor_id", effectiveTutor);

    if (toDate) {
      query = query.lte("created_at", toDate);
    }

    const { data } = await query;
    const pmts = (data as unknown as Payment[]) ?? [];
    setPayments(pmts);

    // Fetch rescheduled lesson dates
    const rescheduledIds = pmts
      .filter((p) => p.lessons?.rescheduled_to)
      .map((p) => p.lessons!.rescheduled_to!);
    if (rescheduledIds.length > 0) {
      const { data: rescheduledLessons } = await supabase
        .from("lessons")
        .select("id, starts_at, ends_at")
        .in("id", rescheduledIds);
      const dateMap = new Map<string, { starts_at: string; ends_at: string }>();
      for (const rl of rescheduledLessons ?? []) {
        dateMap.set(rl.id, { starts_at: rl.starts_at, ends_at: rl.ends_at });
      }
      setRescheduledDates(dateMap);
    } else {
      setRescheduledDates(new Map());
    }
  }

  function filteredLessons() {
    if (statusFilter === "all") return lessons;
    if (statusFilter === "canceled") return lessons.filter((l) => l.status === "canceled" || l.status === "late_cancel");
    return lessons.filter((l) => l.status === statusFilter);
  }

  function toggleLessonSelect(id: string) {
    setSelectedLessons((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllLessons() {
    const visible = filteredLessons();
    if (selectedLessons.size === visible.length) {
      setSelectedLessons(new Set());
    } else {
      setSelectedLessons(new Set(visible.map((l) => l.id)));
    }
  }

  async function handleBulkDeleteLessons() {
    if (selectedLessons.size === 0) return;
    setBulkDeleting(true);
    const supabase = createClient();

    await supabase
      .from("lessons")
      .delete()
      .in("id", Array.from(selectedLessons));

    setLessons((prev) => prev.filter((l) => !selectedLessons.has(l.id)));
    setSelectedLessons(new Set());
    setBulkDeleting(false);
    setShowBulkDelete(false);
  }

  function openEdit(item: Record<string, unknown>, type: View) {
    setEditItem({ ...item });
    setEditType(type);
    setSaveMessage(null);
    setModalTab("details");
    setChatMessages([]);
    setConversationId(null);
    setChatLessonId(null);
    setChatText("");
    setChatAttachments([]);
  }

  async function handleSave() {
    if (!editItem || !editType) return;
    setSaving(true);
    setSaveMessage(null);
    const supabase = createClient();

    if (editType === "today" || editType === "upcoming") {
      const { error } = await supabase
        .from("lessons")
        .update({
          status: editItem.status as string,
          format: editItem.format as string,
          focus_notes: editItem.focus_notes as string || null,
          meeting_link: editItem.meeting_link as string || null,
          cancel_reason: editItem.cancel_reason as string || null,
        })
        .eq("id", editItem.id as string);

      if (error) { setSaveMessage(`Error: ${error.message}`); setSaving(false); return; }

      // Notify client of lesson changes (fire-and-forget)
      if (profileId) {
        fetch("/api/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "lesson_changed",
            payload: {
              lesson_id: editItem.id,
              changed_by_profile_id: profileId,
              change_description: `Status updated to ${editItem.status}`,
            },
          }),
        }).catch(() => {});
      }
    } else if (editType === "inquiries") {
      const { error } = await supabase
        .from("inquiries")
        .update({
          status: editItem.status as string,
        })
        .eq("id", editItem.id as string);

      if (error) { setSaveMessage(`Error: ${error.message}`); setSaving(false); return; }
    } else if (editType === "notes") {
      const { error } = await supabase
        .from("lesson_notes")
        .update({
          covered: editItem.covered as string || null,
          homework: editItem.homework as string || null,
          next_steps: editItem.next_steps as string || null,
          status: editItem.status as string,
          published_at: (editItem.status as string) === "published" ? new Date().toISOString() : null,
        })
        .eq("id", editItem.id as string);

      if (error) { setSaveMessage(`Error: ${error.message}`); setSaving(false); return; }
    } else if (editType === "earnings") {
      const { error } = await supabase
        .from("payments")
        .update({
          status: editItem.status as string,
        })
        .eq("id", editItem.id as string);

      if (error) { setSaveMessage(`Error: ${error.message}`); setSaving(false); return; }
    }

    setSaveMessage("Saved successfully.");
    setSaving(false);
    await loadList(activeView);
    await loadStats();
  }

  function updateEditField(field: string, value: string | null) {
    setEditItem((prev) => prev ? { ...prev, [field]: value } : null);
  }

  async function loadChat(accountHolderId: string, lessonId: string) {
    if (!tutorId || !profileId) return;
    setChatLoading(true);
    setChatLessonId(lessonId);
    const supabase = createClient();

    // Get or create conversation
    const { data: existing } = await supabase
      .from("conversations")
      .select("id")
      .eq("tutor_id", tutorId)
      .eq("account_holder_id", accountHolderId)
      .single();

    let convId = existing?.id;
    if (!convId) {
      const { data: created } = await supabase
        .from("conversations")
        .insert({ tutor_id: tutorId, account_holder_id: accountHolderId })
        .select("id")
        .single();
      convId = created?.id;
    }

    if (!convId) { setChatLoading(false); return; }
    setConversationId(convId);

    // Fetch messages for this lesson + general (null lesson_id) messages
    const { data: msgs } = await supabase
      .from("messages")
      .select("id, sender_id, content, attachments, created_at, read_at, lesson_id")
      .eq("conversation_id", convId)
      .or(`lesson_id.eq.${lessonId},lesson_id.is.null`)
      .order("created_at", { ascending: true });

    setChatMessages((msgs ?? []).map((m) => ({
      ...m,
      attachments: (m.attachments as ChatMessage["attachments"]) ?? [],
    })));

    // Mark unread as read (lesson-specific + general)
    await supabase
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .eq("conversation_id", convId)
      .or(`lesson_id.eq.${lessonId},lesson_id.is.null`)
      .neq("sender_id", profileId)
      .is("read_at", null);

    // Update local unread counts
    setUnreadCounts((prev) => {
      const next = new Map(prev);
      next.delete(lessonId);
      return next;
    });

    setChatLoading(false);
  }

  // Subscribe to realtime messages when conversation is open
  useEffect(() => {
    if (!conversationId || !profileId || !chatLessonId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`dash-messages:${conversationId}:${chatLessonId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const newMsg = payload.new as ChatMessage & { lesson_id?: string | null };
          // Show messages for this lesson OR general (null lesson_id)
          if (newMsg.lesson_id !== null && newMsg.lesson_id !== chatLessonId) return;
          setChatMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, { ...newMsg, attachments: (newMsg.attachments as unknown as ChatMessage["attachments"]) ?? [] }];
          });
          // Auto-mark as read
          if (newMsg.sender_id !== profileId) {
            supabase.from("messages").update({ read_at: new Date().toISOString() }).eq("id", newMsg.id);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [conversationId, profileId, chatLessonId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  async function handleChatSend() {
    if ((!chatText.trim() && chatAttachments.length === 0) || !conversationId || !profileId) return;
    setChatSending(true);

    const supabase = createClient();
    let attachmentData: { name: string; url: string; type: string }[] = [];

    // Upload attachments
    if (chatAttachments.length > 0) {
      for (const file of chatAttachments) {
        const filePath = `${conversationId}/${Date.now()}-${file.name}`;
        const { error } = await supabase.storage
          .from("message-attachments")
          .upload(filePath, file);

        if (!error) {
          const { data: urlData } = supabase.storage
            .from("message-attachments")
            .getPublicUrl(filePath);

          attachmentData.push({
            name: file.name,
            url: urlData.publicUrl,
            type: file.type,
          });
        }
      }
    }

    const { error } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender_id: profileId,
      content: chatText.trim() || (attachmentData.length > 0 ? `Sent ${attachmentData.length} attachment(s)` : ""),
      attachments: attachmentData.length > 0 ? attachmentData : [],
      lesson_id: chatLessonId,
    });

    if (!error) {
      const sentContent = chatText.trim() || (attachmentData.length > 0 ? `Sent ${attachmentData.length} attachment(s)` : "");
      setChatText("");
      setChatAttachments([]);
      await supabase
        .from("conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", conversationId);
      fetch("/api/messages/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: conversationId, content: sentContent }),
      }).catch(() => {});
    }
    setChatSending(false);
  }

  function handleChatKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleChatSend();
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    setChatAttachments((prev) => [...prev, ...files]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeAttachment(index: number) {
    setChatAttachments((prev) => prev.filter((_, i) => i !== index));
  }

  // Column definitions for DataTable (must be before early returns to satisfy Rules of Hooks)
  const lessonColumns = useMemo<Column<Lesson>[]>(() => [
    {
      key: "checkbox",
      label: "",
      header: (
        <input
          type="checkbox"
          checked={selectedLessons.size === filteredLessons().length && filteredLessons().length > 0}
          onChange={toggleAllLessons}
          className="size-4 rounded border-gray-300"
        />
      ),
      render: (row) => (
        <span onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={selectedLessons.has(row.id)}
            onChange={() => toggleLessonSelect(row.id)}
            className="size-4 rounded border-gray-300"
          />
        </span>
      ),
    },
    {
      key: "date",
      label: "Date",
      sortable: true,
      sortValue: (row) => row.starts_at,
      render: (row) =>
        new Date(row.starts_at).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }),
    },
    {
      key: "time",
      label: "Time",
      sortable: true,
      sortValue: (row) => row.starts_at,
      render: (row) => (
        <>
          {new Date(row.starts_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
          {" \u2013 "}
          {new Date(row.ends_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", timeZoneName: "short" })}
        </>
      ),
    },
    {
      key: "learner",
      label: "Learner",
      sortable: true,
      sortValue: (row) => row.learners?.full_name ?? "",
      render: (row) => (
        <span onClick={(e) => e.stopPropagation()}>
          {userRole === "superadmin" && row.booked_by ? (
            <Link href={`/admin/users/${row.booked_by}`} className="text-primary underline-offset-2 hover:underline">
              {row.learners?.full_name ?? "\u2014"}
            </Link>
          ) : userRole === "tutor" && row.booked_by ? (
            <Link href={`/clients/${row.booked_by}`} className="text-primary underline-offset-2 hover:underline">
              {row.learners?.full_name ?? "\u2014"}
            </Link>
          ) : (row.learners?.full_name ?? "\u2014")}
        </span>
      ),
    },
    ...(userRole === "superadmin" ? [{
      key: "tutor",
      label: "Tutor",
      sortable: true,
      sortValue: (row: Lesson) => row.tutors?.profiles?.full_name ?? "",
      render: (row: Lesson) => (
        <span onClick={(e: React.MouseEvent) => e.stopPropagation()}>
          {row.tutors?.profile_id ? (
            <Link href={`/admin/users/${row.tutors.profile_id}`} className="text-primary underline-offset-2 hover:underline">
              {row.tutors.profiles?.full_name ?? "\u2014"}
            </Link>
          ) : "\u2014"}
        </span>
      ),
    } as Column<Lesson>] : []),
    {
      key: "subject",
      label: "Subject",
      sortable: true,
      sortValue: (row) => row.subjects?.name ?? "",
      render: (row) => row.subjects?.name ?? "\u2014",
    },
    {
      key: "duration",
      label: "Duration",
      sortable: true,
      sortValue: (row) => new Date(row.ends_at).getTime() - new Date(row.starts_at).getTime(),
      render: (row) => {
        const durationMin = Math.round((new Date(row.ends_at).getTime() - new Date(row.starts_at).getTime()) / 60000);
        return `${durationMin} min`;
      },
    },
    {
      key: "price",
      label: "Price",
      sortable: true,
      sortValue: (row) => row.payments?.[0]?.amount_cents ?? 0,
      render: (row) => {
        const price = row.payments?.[0]?.amount_cents;
        return price != null ? <span className="font-bold">${(price / 100).toFixed(2)}</span> : "\u2014";
      },
    },
    {
      key: "format",
      label: "Format",
      sortable: true,
      sortValue: (row) => row.format,
      render: (row) => <span className="capitalize">{row.format}</span>,
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      sortValue: (row) => row.status,
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: "msg",
      label: "Msg",
      render: (row) => {
        const unread = unreadCounts.get(row.id) ?? 0;
        return (
          <div className="relative inline-flex">
            <MessageCircle className={`size-5 ${unread > 0 ? "text-primary" : "text-muted-foreground/50"}`} />
            {unread > 0 && (
              <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                {unread}
              </span>
            )}
          </div>
        );
      },
    },
  ], [userRole, selectedLessons, unreadCounts, lessons, statusFilter]);

  const inquiryColumns = useMemo<Column<Inquiry>[]>(() => [
    {
      key: "name",
      label: "Name",
      sortable: true,
      sortValue: (row) => row.name,
      render: (row) => row.name,
    },
    {
      key: "email",
      label: "Email",
      sortable: true,
      sortValue: (row) => row.email,
      render: (row) => row.email,
    },
    {
      key: "subject",
      label: "Subject",
      sortable: true,
      sortValue: (row) => row.subject ?? "",
      render: (row) => row.subject ?? "\u2014",
    },
    {
      key: "date",
      label: "Date",
      sortable: true,
      sortValue: (row) => row.created_at,
      render: (row) => new Date(row.created_at).toLocaleDateString(),
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      sortValue: (row) => row.status,
      render: (row) => <StatusBadge status={row.status} />,
    },
  ], []);

  const noteColumns = useMemo<Column<NoteItem>[]>(() => [
    {
      key: "date",
      label: "Date",
      sortable: true,
      sortValue: (row) => row.lessons?.starts_at ?? "",
      render: (row) => row.lessons ? new Date(row.lessons.starts_at).toLocaleDateString() : "\u2014",
    },
    {
      key: "learner",
      label: "Learner",
      sortable: true,
      sortValue: (row) => row.lessons?.learners?.full_name ?? "",
      render: (row) => (
        <span onClick={(e) => e.stopPropagation()}>
          {userRole === "superadmin" && row.lessons?.booked_by ? (
            <Link href={`/admin/users/${row.lessons.booked_by}`} className="text-primary underline-offset-2 hover:underline">
              {row.lessons?.learners?.full_name ?? "\u2014"}
            </Link>
          ) : userRole === "tutor" && row.lessons?.booked_by ? (
            <Link href={`/clients/${row.lessons.booked_by}`} className="text-primary underline-offset-2 hover:underline">
              {row.lessons?.learners?.full_name ?? "\u2014"}
            </Link>
          ) : (row.lessons?.learners?.full_name ?? "\u2014")}
        </span>
      ),
    },
    ...(userRole === "superadmin" ? [{
      key: "tutor",
      label: "Tutor",
      sortable: true,
      sortValue: (row: NoteItem) => row.lessons?.tutors?.profiles?.full_name ?? "",
      render: (row: NoteItem) => (
        <span onClick={(e: React.MouseEvent) => e.stopPropagation()}>
          {row.lessons?.tutors?.profile_id ? (
            <Link href={`/admin/users/${row.lessons.tutors.profile_id}`} className="text-primary underline-offset-2 hover:underline">
              {row.lessons.tutors.profiles?.full_name ?? "\u2014"}
            </Link>
          ) : "\u2014"}
        </span>
      ),
    } as Column<NoteItem>] : []),
    {
      key: "subject",
      label: "Subject",
      sortable: true,
      sortValue: (row) => row.lessons?.subjects?.name ?? "",
      render: (row) => row.lessons?.subjects?.name ?? "\u2014",
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      sortValue: (row) => row.status,
      render: (row) => <StatusBadge status={row.status} />,
    },
  ], [userRole]);

  const earningsColumns = useMemo<Column<Payment>[]>(() => [
    {
      key: "date",
      label: "Date",
      sortable: true,
      sortValue: (row) => row.lessons?.starts_at ?? row.created_at,
      render: (row) => {
        const isRescheduled = row.lessons?.cancel_reason === "Rescheduled";
        const rescheduledLesson = row.lessons?.rescheduled_to ? rescheduledDates.get(row.lessons.rescheduled_to) : null;
        return (
          <div>
            <div>
              {row.lessons
                ? new Date(row.lessons.starts_at).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
                : new Date(row.created_at).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
            </div>
            {isRescheduled && rescheduledLesson && (
              <div className="text-xs text-muted-foreground">
                → {new Date(rescheduledLesson.starts_at).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: "time",
      label: "Time",
      sortable: true,
      sortValue: (row) => row.lessons?.starts_at ?? "",
      render: (row) => {
        const isRescheduled = row.lessons?.cancel_reason === "Rescheduled";
        const rescheduledLesson = row.lessons?.rescheduled_to ? rescheduledDates.get(row.lessons.rescheduled_to) : null;
        return (
          <div>
            <div>
              {row.lessons
                ? new Date(row.lessons.starts_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", timeZoneName: "short" })
                : "\u2014"}
            </div>
            {isRescheduled && rescheduledLesson && (
              <div className="text-xs text-muted-foreground">
                → {new Date(rescheduledLesson.starts_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", timeZoneName: "short" })}
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: "learner",
      label: "Learner",
      sortable: true,
      sortValue: (row) => row.lessons?.learners?.full_name ?? "",
      render: (row) => (
        <span onClick={(e) => e.stopPropagation()}>
          {userRole === "superadmin" && row.lessons?.booked_by ? (
            <Link href={`/admin/users/${row.lessons.booked_by}`} className="text-primary underline-offset-2 hover:underline">
              {row.lessons?.learners?.full_name ?? "\u2014"}
            </Link>
          ) : userRole === "tutor" && row.lessons?.booked_by ? (
            <Link href={`/clients/${row.lessons.booked_by}`} className="text-primary underline-offset-2 hover:underline">
              {row.lessons?.learners?.full_name ?? "\u2014"}
            </Link>
          ) : (row.lessons?.learners?.full_name ?? "\u2014")}
        </span>
      ),
    },
    ...(userRole === "superadmin" ? [{
      key: "tutor",
      label: "Tutor",
      sortable: true,
      sortValue: (row: Payment) => row.lessons?.tutors?.profiles?.full_name ?? "",
      render: (row: Payment) => (
        <span onClick={(e: React.MouseEvent) => e.stopPropagation()}>
          {row.lessons?.tutors?.profile_id ? (
            <Link href={`/admin/users/${row.lessons.tutors.profile_id}`} className="text-primary underline-offset-2 hover:underline">
              {row.lessons.tutors.profiles?.full_name ?? "\u2014"}
            </Link>
          ) : "\u2014"}
        </span>
      ),
    } as Column<Payment>] : []),
    {
      key: "subject",
      label: "Subject",
      sortable: true,
      sortValue: (row) => row.lessons?.subjects?.name ?? "",
      render: (row) => row.lessons?.subjects?.name ?? "\u2014",
    },
    {
      key: "duration",
      label: "Duration",
      sortable: true,
      sortValue: (row) => row.lessons ? new Date(row.lessons.ends_at).getTime() - new Date(row.lessons.starts_at).getTime() : 0,
      render: (row) => {
        const durationMin = row.lessons
          ? Math.round((new Date(row.lessons.ends_at).getTime() - new Date(row.lessons.starts_at).getTime()) / 60000)
          : null;
        return durationMin != null ? `${durationMin} min` : "\u2014";
      },
    },
    {
      key: "amount",
      label: "Price",
      sortable: true,
      sortValue: (row) => row.amount_cents,
      render: (row) => <span className="font-bold">${(row.amount_cents / 100).toFixed(2)}</span>,
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      sortValue: (row) => row.lessons?.cancel_reason === "Rescheduled" ? "rescheduled" : (row.lessons?.status ?? row.status),
      render: (row) => <StatusBadge status={row.lessons?.cancel_reason === "Rescheduled" ? "rescheduled" : (row.lessons?.status ?? row.status)} />,
    },
  ], [userRole, rescheduledDates]);

  if (loading) {
    return <LoadingPlaceholder />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        {userRole === "superadmin" && allTutors.length > 0 && (
          <Select value={selectedTutorFilter} onValueChange={(v) => setSelectedTutorFilter(v ?? "all")}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All Tutors">
                {selectedTutorFilter === "all"
                  ? "All Tutors"
                  : allTutors.find((t) => t.id === selectedTutorFilter)?.name ?? "All Tutors"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tutors</SelectItem>
              {allTutors.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Stats grid */}
      <div className={`grid gap-4 sm:grid-cols-2 ${userRole === "superadmin" ? "lg:grid-cols-6" : "lg:grid-cols-5"}`}>
        <DashCard
          title="Today"
          value={todayCount}
          label="lessons"
          active={activeView === "today"}
          onClick={() => loadList("today")}
        />
        <DashCard
          title="Upcoming"
          value={weekCount}
          label="lessons"
          active={activeView === "upcoming"}
          onClick={() => loadList("upcoming")}
        />
        <DashCard
          title="Inquiries"
          value={inquiryCount}
          label="new"
          active={activeView === "inquiries"}
          onClick={() => loadList("inquiries")}
        />
        <DashCard
          title="Notes Due"
          value={notesDueCount}
          label="unpublished"
          active={activeView === "notes"}
          onClick={() => loadList("notes")}
        />
        <DashCard
          title="This Month"
          value={`$${(monthEarnings / 100).toFixed(0)}`}
          label="earned"
          active={activeView === "earnings"}
          onClick={() => loadList("earnings")}
        />
        {userRole === "superadmin" && (
          <Link href="/admin/tutor-applications">
            <DashCard
              title="Tutor Apps"
              value={tutorAppsCount}
              label="pending"
              active={false}
              onClick={() => {}}
            />
          </Link>
        )}
      </div>

      {/* List table */}
      {activeView && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold">
                {activeView === "today" ? "Today's Lessons" : activeView === "upcoming" ? "Upcoming Lessons" : activeView === "inquiries" ? "New Inquiries" : activeView === "notes" ? "Notes Due" : "Earnings"}
              </h2>
              {(activeView === "today" || activeView === "upcoming") && selectedLessons.size > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setShowBulkDelete(true)}
                >
                  <Trash2 className="mr-1 size-4" />
                  Delete {selectedLessons.size}
                </Button>
              )}
            </div>
            {(activeView === "today" || activeView === "upcoming") ? (
              <div className="flex items-center rounded-md border">
                <button
                  type="button"
                  onClick={() => setLessonDisplayMode("calendar")}
                  className={`p-1.5 rounded-l-md transition-colors ${lessonDisplayMode === "calendar" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  title="Calendar view"
                >
                  <Calendar className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setLessonDisplayMode("list")}
                  className={`p-1.5 rounded-r-md transition-colors ${lessonDisplayMode === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  title="List view"
                >
                  <List className="size-4" />
                </button>
              </div>
            ) : null}
          </div>
            {listLoading ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Loading...</p>
            ) : (activeView === "today" || activeView === "upcoming") ? (
              <div className="space-y-3">
                {/* Status filter — only in list mode */}
                {lessonDisplayMode === "list" && (
                  <TabBar
                    tabs={[
                      { key: "all", label: "All", count: lessons.length },
                      { key: "confirmed", label: "Confirmed", count: lessons.filter((l) => l.status === "confirmed").length },
                      { key: "completed", label: "Completed", count: lessons.filter((l) => l.status === "completed").length },
                      { key: "canceled", label: "Canceled", count: lessons.filter((l) => l.status === "canceled" || l.status === "late_cancel").length },
                    ]}
                    activeTab={statusFilter}
                    onChange={setStatusFilter}
                  />
                )}

                {lessonDisplayMode === "calendar" ? (
                  <LessonCalendar lessons={lessons} onSelect={(lesson) => openEdit(lesson as unknown as Record<string, unknown>, activeView)} />
                ) : (
                  <DataTable<Lesson>
                    columns={lessonColumns}
                    data={filteredLessons()}
                    rowKey={(row) => row.id}
                    onRowClick={(row) => openEdit(row as unknown as Record<string, unknown>, activeView)}
                    rowClassName={(row) => selectedLessons.has(row.id) ? "bg-yellow-50" : ""}
                    emptyMessage="No lessons found."
                    defaultSort={{ key: "date", direction: "asc" }}
                  />
                )}
              </div>
            ) : activeView === "inquiries" ? (
              <DataTable<Inquiry>
                columns={inquiryColumns}
                data={inquiries}
                rowKey={(row) => row.id}
                onRowClick={(row) => openEdit(row as unknown as Record<string, unknown>, "inquiries")}
                emptyMessage="No new inquiries."
              />
            ) : activeView === "notes" ? (
              <DataTable<NoteItem>
                columns={noteColumns}
                data={notes}
                rowKey={(row) => row.id}
                onRowClick={(row) => openEdit(row as unknown as Record<string, unknown>, "notes")}
                emptyMessage="No notes due."
              />
            ) : activeView === "earnings" ? (
              <div className="space-y-3">
                {/* Earnings date filter */}
                <div className="flex flex-wrap items-end gap-3">
                  <TabBar
                    tabs={[
                      { key: "month", label: "This Month", count: earningsFilter === "month" ? payments.length : undefined },
                      { key: "year", label: "This Year", count: earningsFilter === "year" ? payments.length : undefined },
                      { key: "custom", label: "Custom Range", count: earningsFilter === "custom" ? payments.length : undefined },
                    ]}
                    activeTab={earningsFilter}
                    onChange={(key) => {
                      if (key !== "custom") {
                        loadEarnings(key);
                      } else {
                        setEarningsFilter("custom");
                      }
                    }}
                  />

                  {earningsFilter === "custom" && (
                    <div className="flex items-end gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">From</Label>
                        <Input
                          type="date"
                          value={earningsFrom}
                          onChange={(e) => setEarningsFrom(e.target.value)}
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">To</Label>
                        <Input
                          type="date"
                          value={earningsTo}
                          onChange={(e) => setEarningsTo(e.target.value)}
                          className="h-8 text-xs"
                        />
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8"
                        onClick={() => loadEarnings("custom")}
                        disabled={!earningsFrom}
                      >
                        Apply
                      </Button>
                    </div>
                  )}
                </div>

                {/* Earnings total */}
                <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
                  Total: <span className="font-bold">${(payments.reduce((sum, p) => sum + p.amount_cents, 0) / 100).toFixed(2)}</span>
                  <span className="text-muted-foreground"> ({payments.length} payment{payments.length !== 1 ? "s" : ""})</span>
                </div>

                <DataTable<Payment>
                  columns={earningsColumns}
                  data={payments}
                  rowKey={(row) => row.id}
                  onRowClick={(row) => openEdit(row as unknown as Record<string, unknown>, "earnings")}
                  emptyMessage="No earnings found for this period."
                />
              </div>
            ) : null}
        </div>
      )}

      {/* Edit Modal */}
      <Dialog open={!!editItem} onOpenChange={(open) => { if (!open) { setEditItem(null); setEditType(null); setConversationId(null); } }}>
        <DialogContent className="max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {editType === "today" || editType === "upcoming"
                ? "Edit Lesson"
                : editType === "inquiries"
                  ? "Edit Inquiry"
                  : editType === "notes"
                    ? "Edit Notes"
                    : "Edit Payment"}
            </DialogTitle>
          </DialogHeader>

          {editItem && (
            <div className="flex-1 overflow-hidden flex flex-col">
              {saveMessage && (
                <div className={`rounded-md p-2 text-xs mb-2 ${saveMessage.startsWith("Error") ? "bg-destructive/10 text-destructive" : "bg-green-500/10 text-green-700"}`}>
                  {saveMessage}
                </div>
              )}

              {/* Tabs for lesson edit - show messages tab only for lessons */}
              {(editType === "today" || editType === "upcoming") ? (
                <Tabs
                  value={modalTab}
                  onValueChange={(v) => {
                    const tab = v as ModalTab;
                    setModalTab(tab);
                    if (tab === "messages" && editItem.booked_by && editItem.id) {
                      loadChat(editItem.booked_by as string, editItem.id as string);
                    }
                  }}
                  className="flex-1 overflow-hidden flex flex-col"
                >
                  <TabsList className="w-full">
                    <TabsTrigger value="details">Details</TabsTrigger>
                    <TabsTrigger value="messages" className="gap-1.5">
                      <MessageCircle className="size-4" />
                      Send Message
                      {(() => {
                        const unread = unreadCounts.get(editItem.id as string) ?? 0;
                        return unread > 0 ? (
                          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">{unread}</span>
                        ) : null;
                      })()}
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="details" className="overflow-y-auto">
                    <div className="space-y-4 py-2">
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="text-muted-foreground">Learner</span>
                          <p className="font-medium">
                            {userRole === "superadmin" && editItem.booked_by ? (
                              <Link href={`/admin/users/${editItem.booked_by}`} className="text-primary underline-offset-2 hover:underline">
                                {(editItem.learners as Lesson["learners"])?.full_name ?? "—"}
                              </Link>
                            ) : userRole === "tutor" && editItem.booked_by ? (
                              <Link href={`/clients/${editItem.booked_by}`} className="text-primary underline-offset-2 hover:underline">
                                {(editItem.learners as Lesson["learners"])?.full_name ?? "—"}
                              </Link>
                            ) : ((editItem.learners as Lesson["learners"])?.full_name ?? "—")}
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Subject</span>
                          <p className="font-medium">{(editItem.subjects as Lesson["subjects"])?.name ?? "—"}</p>
                        </div>
                        {userRole === "superadmin" && (editItem.tutors as Lesson["tutors"])?.profile_id && (
                          <div>
                            <span className="text-muted-foreground">Tutor</span>
                            <p className="font-medium">
                              <Link href={`/admin/users/${(editItem.tutors as Lesson["tutors"])!.profile_id}`} className="text-primary underline-offset-2 hover:underline">
                                {(editItem.tutors as Lesson["tutors"])?.profiles?.full_name ?? "—"}
                              </Link>
                            </p>
                          </div>
                        )}
                        <div>
                          <span className="text-muted-foreground">Time</span>
                          <p className="font-medium">
                            {new Date(editItem.starts_at as string).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                            {" \u2013 "}
                            {new Date(editItem.ends_at as string).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", timeZoneName: "short" })}
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Date</span>
                          <p className="font-medium">
                            {new Date(editItem.starts_at as string).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                          </p>
                        </div>
                        {(editItem.payments as Lesson["payments"])?.length ? (() => {
                          const p = (editItem.payments as Lesson["payments"])![0];
                          return (
                            <div>
                              <span className="text-muted-foreground">Amount</span>
                              <p className="font-medium capitalize">
                                <span className="font-bold">${(p.amount_cents / 100).toFixed(2)}</span>
                                {" — "}{p.status}
                              </p>
                            </div>
                          );
                        })() : null}
                        {((editItem.meeting_link as string) || (editItem.tutors as Lesson["tutors"])?.meeting_link) && (() => {
                          const link = (editItem.meeting_link as string) || (editItem.tutors as Lesson["tutors"])?.meeting_link;
                          return (
                            <div className="flex justify-between items-center text-sm">
                              <span className="text-muted-foreground">Meeting</span>
                              <a
                                href={link!}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="rounded-lg border-2 border-gold-400 bg-gold-400/20 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-gold-400/30"
                              >
                                {link!.includes("meet.google")
                                  ? "Join Google Meet ↗"
                                  : link!.includes("zoom")
                                    ? "Join Zoom ↗"
                                    : "Join Meeting ↗"}
                              </a>
                            </div>
                          );
                        })()}
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs" required>Status</Label>
                        <Select value={(editItem.status as string) ?? ""} onValueChange={(v) => updateEditField("status", v)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="confirmed">Confirmed</SelectItem>
                            <SelectItem value="completed">Completed</SelectItem>
                            <SelectItem value="canceled">Canceled</SelectItem>
                            <SelectItem value="no_show">No Show</SelectItem>
                            <SelectItem value="late_cancel">Late Cancel</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs" required>Format</Label>
                        <Select value={(editItem.format as string) ?? ""} onValueChange={(v) => updateEditField("format", v)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="online">Online</SelectItem>
                            <SelectItem value="in_person">In Person</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Focus Notes</Label>
                        <Textarea
                          value={(editItem.focus_notes as string) ?? ""}
                          onChange={(e) => updateEditField("focus_notes", e.target.value)}
                          rows={2}
                        />
                      </div>
                      {(editItem.status === "canceled" || editItem.status === "late_cancel") && (
                        <div className="space-y-2">
                          <Label className="text-xs">Cancel Reason</Label>
                          <Input
                            value={(editItem.cancel_reason as string) ?? ""}
                            onChange={(e) => updateEditField("cancel_reason", e.target.value)}
                          />
                        </div>
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="messages" className="flex-1 overflow-hidden flex flex-col">
                    {chatLoading ? (
                      <p className="py-8 text-center text-sm text-muted-foreground">Loading messages...</p>
                    ) : (
                      <>
                        {/* Chat messages */}
                        <div className="flex-1 overflow-y-auto py-2 space-y-2 min-h-0" style={{ maxHeight: "300px" }}>
                          {chatMessages.length === 0 && (
                            <p className="text-center text-sm text-muted-foreground py-6">
                              No messages yet. Start the conversation!
                            </p>
                          )}
                          {chatMessages.map((msg) => {
                            const isMine = msg.sender_id === profileId;
                            return (
                              <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                                <div
                                  className={`max-w-[80%] rounded-2xl px-3 py-2 ${
                                    isMine
                                      ? "bg-primary text-primary-foreground rounded-br-md"
                                      : "bg-card border border-border rounded-bl-md"
                                  }`}
                                >
                                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                                  {msg.attachments && msg.attachments.length > 0 && (
                                    <div className="mt-1 space-y-1">
                                      {msg.attachments.map((att, i) => (
                                        <a
                                          key={i}
                                          href={att.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className={`flex items-center gap-1 text-xs underline ${
                                            isMine ? "text-primary-foreground/80" : "text-primary"
                                          }`}
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          <Paperclip className="size-3" />
                                          {att.name}
                                        </a>
                                      ))}
                                    </div>
                                  )}
                                  <p className={`mt-1 text-[10px] ${isMine ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                                    {new Date(msg.created_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                          <div ref={chatEndRef} />
                        </div>

                        {/* Attachment preview */}
                        {chatAttachments.length > 0 && (
                          <div className="flex flex-wrap gap-2 px-1 py-1 border-t">
                            {chatAttachments.map((file, i) => (
                              <div key={i} className="flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs">
                                <Paperclip className="size-3" />
                                <span className="max-w-[120px] truncate">{file.name}</span>
                                <button type="button" onClick={() => removeAttachment(i)} className="text-muted-foreground hover:text-foreground">
                                  <X className="size-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Chat input */}
                        <div className="border-t pt-2 space-y-1">
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="shrink-0 px-2"
                              onClick={() => fileInputRef.current?.click()}
                            >
                              <Paperclip className="size-4" />
                            </Button>
                            <input
                              ref={fileInputRef}
                              type="file"
                              multiple
                              className="hidden"
                              onChange={handleFileSelect}
                            />
                            <Textarea
                              value={chatText}
                              onChange={(e) => setChatText(e.target.value)}
                              onKeyDown={handleChatKeyDown}
                              placeholder="Type a message..."
                              rows={1}
                              className="min-h-[36px] resize-none text-sm"
                            />
                            <Button
                              size="sm"
                              onClick={handleChatSend}
                              disabled={chatSending || (!chatText.trim() && chatAttachments.length === 0)}
                            >
                              Send
                            </Button>
                          </div>
                          <p className="text-[10px] text-muted-foreground">Enter to send, Shift+Enter for new line</p>
                        </div>
                      </>
                    )}
                  </TabsContent>
                </Tabs>
              ) : (
                <div className="space-y-4 py-2 overflow-y-auto">
              {/* Non-lesson edit forms remain the same */}

              {/* Inquiry edit form */}
              {editType === "inquiries" && (
                <>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-muted-foreground">Name</span>
                      <p className="font-medium">{editItem.name as string}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Email</span>
                      <p className="font-medium">{editItem.email as string}</p>
                    </div>
                    {editItem.subject ? (
                      <div>
                        <span className="text-muted-foreground">Subject</span>
                        <p className="font-medium">{String(editItem.subject)}</p>
                      </div>
                    ) : null}
                    {editItem.learner_grade ? (
                      <div>
                        <span className="text-muted-foreground">Grade</span>
                        <p className="font-medium">{String(editItem.learner_grade)}</p>
                      </div>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Message</Label>
                    <div className="rounded-md bg-muted/50 p-3 text-sm">{editItem.message as string}</div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs" required>Status</Label>
                    <Select value={(editItem.status as string) ?? ""} onValueChange={(v) => updateEditField("status", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="new">New</SelectItem>
                        <SelectItem value="replied">Replied</SelectItem>
                        <SelectItem value="converted">Converted</SelectItem>
                        <SelectItem value="closed">Closed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              {/* Notes edit form */}
              {editType === "notes" && (
                <>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-muted-foreground">Learner</span>
                      <p className="font-medium">{(editItem.lessons as NoteItem["lessons"])?.learners?.full_name ?? "—"}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Subject</span>
                      <p className="font-medium">{(editItem.lessons as NoteItem["lessons"])?.subjects?.name ?? "—"}</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Covered</Label>
                    <Textarea
                      value={(editItem.covered as string) ?? ""}
                      onChange={(e) => updateEditField("covered", e.target.value)}
                      rows={2}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Homework</Label>
                    <Textarea
                      value={(editItem.homework as string) ?? ""}
                      onChange={(e) => updateEditField("homework", e.target.value)}
                      rows={2}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Next Steps</Label>
                    <Textarea
                      value={(editItem.next_steps as string) ?? ""}
                      onChange={(e) => updateEditField("next_steps", e.target.value)}
                      rows={2}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs" required>Status</Label>
                    <Select value={(editItem.status as string) ?? ""} onValueChange={(v) => updateEditField("status", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="published">Published</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              {/* Payment edit form */}
              {editType === "earnings" && (
                <>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-muted-foreground">Learner</span>
                      <p className="font-medium">{(editItem.lessons as Payment["lessons"])?.learners?.full_name ?? "—"}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Subject</span>
                      <p className="font-medium">{(editItem.lessons as Payment["lessons"])?.subjects?.name ?? "—"}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Amount</span>
                      <p className="font-medium">${((editItem.amount_cents as number) / 100).toFixed(2)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Date</span>
                      <p className="font-medium">{new Date(editItem.created_at as string).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs" required>Status</Label>
                    <Select value={(editItem.status as string) ?? ""} onValueChange={(v) => updateEditField("status", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="succeeded">Succeeded</SelectItem>
                        <SelectItem value="failed">Failed</SelectItem>
                        <SelectItem value="refunded">Refunded</SelectItem>
                        <SelectItem value="partially_refunded">Partially Refunded</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            {modalTab === "details" && (
              <>
                {editItem?.status === "confirmed" && new Date(editItem.starts_at as string) > new Date() && (() => {
                  const amountCents = (editItem.payments as Lesson["payments"])?.[0]?.amount_cents ?? 0;
                  const inPenaltyWindow = cancellationPolicy && amountCents > 0 &&
                    calculateRefund(cancellationPolicy, new Date(editItem.starts_at as string), amountCents).charge_amount_cents > 0;
                  if (inPenaltyWindow) {
                    return (
                      <p className="text-sm text-muted-foreground">
                        Cannot reschedule — within the cancellation penalty window. The learner would be charged a fee.
                      </p>
                    );
                  }
                  return (
                    <Button
                      variant="outline"
                      size="sm"
                      render={<Link href={`/lessons/${editItem.id}/reschedule`} />}
                    >
                      Reschedule
                    </Button>
                  );
                })()}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setEditItem(null); setEditType(null); setConversationId(null); }}
                >
                  Cancel
                </Button>
                <Button size="sm" onClick={handleSave} disabled={saving}>
                  {saving ? "Saving..." : "Save"}
                </Button>
              </>
            )}
            {modalTab === "messages" && (
              <DialogClose render={<Button variant="outline" size="sm" />}>
                Close
              </DialogClose>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Lessons Dialog */}
      <Dialog open={showBulkDelete} onOpenChange={(open) => { if (!open) setShowBulkDelete(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {selectedLessons.size} {selectedLessons.size === 1 ? "Lesson" : "Lessons"}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to permanently delete {selectedLessons.size === 1 ? "this lesson" : `these ${selectedLessons.size} lessons`}? This action cannot be undone.
          </p>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" />}>
              Cancel
            </DialogClose>
            <Button
              size="sm"
              variant="destructive"
              onClick={handleBulkDeleteLessons}
              disabled={bulkDeleting}
            >
              {bulkDeleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LessonCalendar({ lessons, onSelect }: { lessons: Lesson[]; onSelect: (lesson: Lesson) => void }) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();

  // Group lessons by date string (YYYY-MM-DD local)
  const lessonsByDate = new Map<string, Lesson[]>();
  for (const l of lessons) {
    const d = new Date(l.starts_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (!lessonsByDate.has(key)) lessonsByDate.set(key, []);
    lessonsByDate.get(key)!.push(l);
  }

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const statusColor: Record<string, string> = {
    confirmed: "bg-green-500",
    held: "bg-yellow-500",
    completed: "bg-blue-500",
    canceled: "bg-red-400",
    late_cancel: "bg-orange-400",
    no_show: "bg-gray-400",
  };

  const legendItems = [
    { label: "Confirmed", color: "bg-green-500" },
    { label: "Pending", color: "bg-yellow-500" },
    { label: "Completed", color: "bg-blue-500" },
    { label: "Canceled", color: "bg-red-400" },
    { label: "Late Cancel", color: "bg-orange-400" },
    { label: "No Show", color: "bg-gray-400" },
  ];

  return (
    <div>
      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-3">
        {legendItems.map((item) => (
          <div key={item.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={`inline-block size-2.5 rounded-sm ${item.color}`} />
            {item.label}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={() => setCurrentMonth(new Date(year, month - 1, 1))}
          className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
        >
          &larr;
        </button>
        <span className="text-sm font-medium">
          {currentMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </span>
        <button
          type="button"
          onClick={() => setCurrentMonth(new Date(year, month + 1, 1))}
          className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
        >
          &rarr;
        </button>
      </div>
      <div className="grid grid-cols-7 gap-px text-center text-xs">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="py-1 font-medium text-muted-foreground">{d}</div>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <div key={`e-${i}`} />;
          const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const dayLessons = lessonsByDate.get(dateKey) ?? [];
          const isToday = dateKey === todayKey;

          return (
            <div
              key={dateKey}
              className={`min-h-[72px] rounded-md border p-1 ${isToday ? "border-primary bg-primary/5" : "border-transparent hover:bg-muted/50"}`}
            >
              <div className={`text-xs mb-0.5 ${isToday ? "font-bold text-primary" : "text-muted-foreground"}`}>{day}</div>
              <div className="space-y-0.5">
                {dayLessons.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => onSelect(l)}
                    className={`w-full truncate rounded px-1 py-0.5 text-[10px] text-white text-left ${statusColor[l.status] ?? "bg-gray-400"}`}
                    title={`${l.subjects?.name ?? "Lesson"} — ${l.learners?.full_name ?? ""} ${new Date(l.starts_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`}
                  >
                    {new Date(l.starts_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })} {l.subjects?.name ?? ""}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DashCard({
  title,
  value,
  label,
  active,
  onClick,
}: {
  title: string;
  value: number | string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="text-left">
      <Card className={`transition-colors hover:bg-yellow-50 ${active ? "ring-2 ring-primary" : ""}`}>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-3xl font-bold">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </CardContent>
      </Card>
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant = status === "confirmed" || status === "succeeded"
    ? "default"
    : status === "completed" || status === "published" || status === "converted"
      ? "secondary"
      : status === "canceled" || status === "failed" || status === "refunded" || status === "late_cancel"
        ? "destructive"
        : status === "rescheduled"
          ? "outline"
          : "outline";

  return <Badge variant={variant} className="text-xs capitalize">{status.replace(/_/g, " ")}</Badge>;
}
