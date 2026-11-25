"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trash2, Pencil, Check, X, Plus, GripVertical } from "lucide-react";
import Link from "next/link";
import { CollapsibleCard } from "@/components/collapsible-card";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface SubjectRow {
  id: string;
  name: string;
  category: string | null;
  sort_order: number;
  category_sort_order: number;
  tutors: { name: string }[];
}

/* ------------------------------------------------------------------ */
/*  Sortable category wrapper                                          */
/* ------------------------------------------------------------------ */
function SortableCategoryCard({
  category,
  children,
}: {
  category: string;
  children: (props: { listeners: Record<string, unknown>; attributes: Record<string, unknown> }) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: `cat::${category}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className="rounded-lg border bg-white">
      {children({ listeners: listeners as unknown as Record<string, unknown>, attributes: attributes as unknown as Record<string, unknown> })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sortable subject row                                               */
/* ------------------------------------------------------------------ */
function SortableSubjectRow({
  subject,
  editingSubjectId,
  editingSubjectName,
  setEditingSubjectId,
  setEditingSubjectName,
  handleRenameSubject,
  deletingId,
  handleDeleteSubject,
}: {
  subject: SubjectRow;
  editingSubjectId: string | null;
  editingSubjectName: string;
  setEditingSubjectId: (id: string | null) => void;
  setEditingSubjectName: (name: string) => void;
  handleRenameSubject: (id: string) => void;
  deletingId: string | null;
  handleDeleteSubject: (id: string, name: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: subject.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center justify-between px-4 py-2.5 bg-white"
    >
      {editingSubjectId === subject.id ? (
        <form
          className="flex items-center gap-2 flex-1"
          onSubmit={(e) => { e.preventDefault(); handleRenameSubject(subject.id); }}
        >
          <Input
            value={editingSubjectName}
            onChange={(e) => setEditingSubjectName(e.target.value)}
            className="h-8 max-w-64 text-sm"
            autoFocus
          />
          <Button type="submit" variant="ghost" size="sm" className="text-green-600 shrink-0">
            <Check className="size-4" />
          </Button>
          <Button type="button" variant="ghost" size="sm" className="shrink-0" onClick={() => setEditingSubjectId(null)}>
            <X className="size-4" />
          </Button>
        </form>
      ) : (
        <>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <button
              type="button"
              className="cursor-grab text-muted-foreground hover:text-foreground shrink-0 touch-none"
              {...attributes}
              {...listeners}
            >
              <GripVertical className="size-4" />
            </button>
            <span className="text-sm font-medium">{subject.name}</span>
            {subject.tutors.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {subject.tutors.map((t, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">
                    {t.name}
                  </Badge>
                ))}
              </div>
            )}
            {subject.tutors.length === 0 && (
              <span className="text-xs text-muted-foreground">No tutors</span>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => { setEditingSubjectId(subject.id); setEditingSubjectName(subject.name); }}
            >
              <Pencil className="size-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive"
              disabled={deletingId === subject.id}
              onClick={() => handleDeleteSubject(subject.id, subject.name)}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */
export default function AdminSettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refundHours, setRefundHours] = useState(3);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Meeting platforms state
  const [meetingPlatforms, setMeetingPlatforms] = useState<string[]>([]);
  const [googleMeetEmail, setGoogleMeetEmail] = useState<string | null>(null);
  const [zoomLink, setZoomLink] = useState("");
  const [zoomConfigured, setZoomConfigured] = useState(false);
  const [meetingSaving, setMeetingSaving] = useState(false);
  const [meetingMessage, setMeetingMessage] = useState<string | null>(null);

  // Subjects state
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [subjectsLoading, setSubjectsLoading] = useState(true);
  const [newSubjectName, setNewSubjectName] = useState("");
  const [newSubjectCategory, setNewSubjectCategory] = useState("");
  const [subjectSaving, setSubjectSaving] = useState(false);
  const [subjectMessage, setSubjectMessage] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Inline editing state
  const [editingSubjectId, setEditingSubjectId] = useState<string | null>(null);
  const [editingSubjectName, setEditingSubjectName] = useState("");
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");

  // Inline add subject to category
  const [addingToCategory, setAddingToCategory] = useState<string | null>(null);
  const [addingSubjectName, setAddingSubjectName] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    async function check() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("user_id", user.id)
        .single();
      if (profile?.role !== "superadmin") { router.push("/dashboard"); return; }
      setAuthorized(true);
    }
    check();
  }, [router]);

  // Handle OAuth callback params
  useEffect(() => {
    if (searchParams.get("meet") === "connected") {
      setMeetingMessage("Google Meet connected successfully.");
      router.replace("/admin/settings", { scroll: false });
    } else if (searchParams.get("error") === "oauth_failed") {
      setMeetingMessage("Error: Failed to connect Google account. Please try again.");
      router.replace("/admin/settings", { scroll: false });
    }
  }, [searchParams, router]);

  useEffect(() => {
    if (!authorized) return;
    async function load() {
      const res = await fetch("/api/admin/settings");
      const data = await res.json();
      if (res.ok && data.settings) {
        setRefundHours(data.settings.refund_period_hours ?? 3);
        setMeetingPlatforms((data.settings.meeting_platforms as string[]) ?? []);
        setZoomLink((data.settings.zoom_meeting_link as string) ?? "");
        setZoomConfigured(!!data.zoom_api_configured);
        const gmCreds = data.settings.google_meet_credentials as { email?: string } | null;
        setGoogleMeetEmail(gmCreds?.email ?? null);
      }
      setLoading(false);
    }
    load();
  }, [authorized]);

  const loadSubjects = useCallback(async () => {
    const supabase = createClient();

    const { data: subjectsData } = await supabase
      .from("subjects")
      .select("id, name, category, sort_order, category_sort_order")
      .order("category_sort_order")
      .order("sort_order");

    const { data: tutorSubjectsData } = await supabase
      .from("tutor_subjects")
      .select("subject_id, tutors(profile_id, profiles(full_name))")
      .eq("active", true);

    const tutorsBySubject: Record<string, { name: string }[]> = {};
    for (const ts of tutorSubjectsData ?? []) {
      const tutorData = ts.tutors as unknown as { profile_id: string; profiles: { full_name: string } } | null;
      const name = tutorData?.profiles?.full_name ?? "Unknown";
      if (!tutorsBySubject[ts.subject_id]) tutorsBySubject[ts.subject_id] = [];
      tutorsBySubject[ts.subject_id].push({ name });
    }

    setSubjects(
      (subjectsData ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        category: s.category,
        sort_order: s.sort_order ?? 0,
        category_sort_order: s.category_sort_order ?? 0,
        tutors: tutorsBySubject[s.id] ?? [],
      }))
    );
    setSubjectsLoading(false);
  }, []);

  useEffect(() => {
    if (!authorized) return;
    loadSubjects();
  }, [authorized, loadSubjects]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    const res = await fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "refund_period_hours", value: refundHours }),
    });

    if (res.ok) {
      setMessage("Settings saved.");
    } else {
      const data = await res.json();
      setMessage(`Error: ${data.error}`);
    }
    setSaving(false);
  }

  async function handleAddSubject(e: React.FormEvent) {
    e.preventDefault();
    if (!newSubjectName.trim() || !newSubjectCategory.trim()) return;
    setSubjectSaving(true);
    setSubjectMessage(null);

    const cat = newSubjectCategory.trim();
    // Determine sort orders for new subject
    const catSubjects = subjects.filter((s) => s.category === cat);
    const newSortOrder = catSubjects.length > 0 ? Math.max(...catSubjects.map((s) => s.sort_order)) + 1 : 0;
    const existingCatOrder = catSubjects.length > 0 ? catSubjects[0].category_sort_order : Math.max(0, ...subjects.map((s) => s.category_sort_order)) + 1;

    const supabase = createClient();
    const { error } = await supabase.from("subjects").insert({
      name: newSubjectName.trim(),
      category: cat,
      sort_order: newSortOrder,
      category_sort_order: existingCatOrder,
    });

    if (error) {
      setSubjectMessage(
        error.code === "23505"
          ? "Error: A subject with that name already exists."
          : `Error: ${error.message}`
      );
    } else {
      setNewSubjectName("");
      setNewSubjectCategory("");
      setSubjectMessage("Subject added.");
      await loadSubjects();
    }
    setSubjectSaving(false);
  }

  async function handleDeleteSubject(id: string, name: string) {
    const tutorCount = subjects.find((s) => s.id === id)?.tutors.length ?? 0;
    const msg = tutorCount > 0
      ? `"${name}" is used by ${tutorCount} tutor(s). Deleting it will remove it from their profiles too. Continue?`
      : `Delete "${name}"? This cannot be undone.`;
    if (!confirm(msg)) return;

    setDeletingId(id);
    const supabase = createClient();
    const { error } = await supabase.from("subjects").delete().eq("id", id);

    if (error) {
      setSubjectMessage(`Error: ${error.message}`);
    } else {
      setSubjectMessage(`"${name}" deleted.`);
      await loadSubjects();
    }
    setDeletingId(null);
  }

  async function handleRenameSubject(id: string) {
    const trimmed = editingSubjectName.trim();
    if (!trimmed) return;
    const supabase = createClient();
    const { error } = await supabase.from("subjects").update({ name: trimmed }).eq("id", id);
    if (error) {
      setSubjectMessage(`Error: ${error.message}`);
    } else {
      setSubjectMessage("Subject renamed.");
      await loadSubjects();
    }
    setEditingSubjectId(null);
  }

  async function handleRenameCategory(oldCategory: string) {
    const trimmed = editingCategoryName.trim() || null;
    const supabase = createClient();
    const { error } = await supabase
      .from("subjects")
      .update({ category: trimmed })
      .eq("category", oldCategory);
    if (error) {
      setSubjectMessage(`Error: ${error.message}`);
    } else {
      setSubjectMessage("Category renamed.");
      await loadSubjects();
    }
    setEditingCategory(null);
  }

  async function handleDeleteCategory(category: string) {
    const catSubjects = subjects.filter((s) => (s.category || "Uncategorized") === category);
    const totalTutors = catSubjects.reduce((sum, s) => sum + s.tutors.length, 0);
    const msg = totalTutors > 0
      ? `Delete category "${category}" and all ${catSubjects.length} subject(s)? ${totalTutors} tutor assignment(s) will also be removed. This cannot be undone.`
      : `Delete category "${category}" and all ${catSubjects.length} subject(s)? This cannot be undone.`;
    if (!confirm(msg)) return;

    const supabase = createClient();
    const ids = catSubjects.map((s) => s.id);
    const { error } = await supabase.from("subjects").delete().in("id", ids);
    if (error) {
      setSubjectMessage(`Error: ${error.message}`);
    } else {
      setSubjectMessage(`Category "${category}" and ${catSubjects.length} subject(s) deleted.`);
      await loadSubjects();
    }
  }

  async function handleAddSubjectToCategory(category: string) {
    const trimmed = addingSubjectName.trim();
    if (!trimmed) return;
    const catSubjects = subjects.filter((s) => (s.category || "Uncategorized") === category);
    const newSortOrder = catSubjects.length > 0 ? Math.max(...catSubjects.map((s) => s.sort_order)) + 1 : 0;
    const catSortOrder = catSubjects.length > 0 ? catSubjects[0].category_sort_order : 0;

    const supabase = createClient();
    const { error } = await supabase.from("subjects").insert({
      name: trimmed,
      category,
      sort_order: newSortOrder,
      category_sort_order: catSortOrder,
    });
    if (error) {
      setSubjectMessage(
        error.code === "23505"
          ? "Error: A subject with that name already exists."
          : `Error: ${error.message}`
      );
    } else {
      setSubjectMessage("Subject added.");
      await loadSubjects();
    }
    setAddingToCategory(null);
    setAddingSubjectName("");
  }

  /* ---------------------------------------------------------------- */
  /*  Drag end handlers                                                */
  /* ---------------------------------------------------------------- */
  async function handleCategoryDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeKey = (active.id as string).replace("cat::", "");
    const overKey = (over.id as string).replace("cat::", "");

    // Get ordered category list
    const orderedCategories = getOrderedCategories();
    const oldIndex = orderedCategories.indexOf(activeKey);
    const newIndex = orderedCategories.indexOf(overKey);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(orderedCategories, oldIndex, newIndex);

    // Optimistic update
    setSubjects((prev) => {
      const updated = [...prev];
      for (const s of updated) {
        const cat = s.category || "Uncategorized";
        const idx = reordered.indexOf(cat);
        if (idx !== -1) s.category_sort_order = idx;
      }
      return updated;
    });

    // Persist: update category_sort_order for each category
    const supabase = createClient();
    const promises = reordered.map((cat, idx) => {
      if (cat === "Uncategorized") {
        return supabase.from("subjects").update({ category_sort_order: idx }).is("category", null);
      }
      return supabase.from("subjects").update({ category_sort_order: idx }).eq("category", cat);
    });
    await Promise.all(promises);
  }

  async function handleSubjectDragEnd(event: DragEndEvent, category: string) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const catSubjects = getSubjectsForCategory(category);
    const oldIndex = catSubjects.findIndex((s) => s.id === active.id);
    const newIndex = catSubjects.findIndex((s) => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(catSubjects, oldIndex, newIndex);

    // Optimistic update
    setSubjects((prev) => {
      const updated = [...prev];
      for (let i = 0; i < reordered.length; i++) {
        const target = updated.find((s) => s.id === reordered[i].id);
        if (target) target.sort_order = i;
      }
      return updated;
    });

    // Persist
    const supabase = createClient();
    const promises = reordered.map((s, idx) =>
      supabase.from("subjects").update({ sort_order: idx }).eq("id", s.id)
    );
    await Promise.all(promises);
  }

  /* ---------------------------------------------------------------- */
  /*  Helpers                                                          */
  /* ---------------------------------------------------------------- */
  function getOrderedCategories(): string[] {
    const catMap: Record<string, number> = {};
    for (const s of subjects) {
      const cat = s.category || "Uncategorized";
      if (!(cat in catMap) || s.category_sort_order < catMap[cat]) {
        catMap[cat] = s.category_sort_order;
      }
    }
    return Object.entries(catMap)
      .sort(([, a], [, b]) => a - b)
      .map(([cat]) => cat);
  }

  function getSubjectsForCategory(category: string): SubjectRow[] {
    return subjects
      .filter((s) => (s.category || "Uncategorized") === category)
      .sort((a, b) => a.sort_order - b.sort_order);
  }

  if (!authorized || loading) {
    return <p className="py-12 text-center text-muted-foreground">Loading...</p>;
  }

  const orderedCategories = getOrderedCategories();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Admin Settings</h1>

      {/* Quick Links */}
      <div className="flex gap-3">
        <Button variant="outline" render={<Link href="/admin/users" />}>
          User Management
        </Button>
        <Button variant="outline" render={<Link href="/admin/refunds" />}>
          Issue Refunds
        </Button>
      </div>

      {/* Refund Period */}
      <CollapsibleCard title="Refund Policy" description="Set the minimum hours before a lesson that a student can cancel and receive a full refund.">
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            {message && (
              <div
                className={`rounded-md p-3 text-sm ${
                  message.startsWith("Error")
                    ? "bg-destructive/10 text-destructive"
                    : "bg-green-500/10 text-green-700"
                }`}
              >
                {message}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="refund-hours" required>Full refund cutoff (hours before lesson)</Label>
              <div className="flex items-center gap-3">
                <Input
                  id="refund-hours"
                  type="number"
                  min={0}
                  max={168}
                  step={0.5}
                  required
                  value={refundHours}
                  onChange={(e) => setRefundHours(parseFloat(e.target.value) || 0)}
                  className="max-w-32"
                />
                <span className="text-sm text-muted-foreground">
                  hours before lesson start
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Default: 3 hours. Students canceling after this cutoff will be charged a late-cancel fee.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => window.location.reload()}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </form>
        </CardContent>
      </CollapsibleCard>

      {/* Meeting Platforms */}
      <CollapsibleCard
        title="Meeting Platforms"
        description="Configure video meeting options for tutoring sessions. When a lesson is booked, a meeting link is automatically generated and sent to the tutor and student."
      >
        <CardContent className="space-y-6">
          {meetingMessage && (
            <div
              className={`rounded-md p-3 text-sm ${
                meetingMessage.startsWith("Error")
                  ? "bg-destructive/10 text-destructive"
                  : "bg-green-500/10 text-green-700"
              }`}
            >
              {meetingMessage}
            </div>
          )}

          {/* Google Meet */}
          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <svg className="h-5 w-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  Google Meet
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Auto-generates a unique Meet link for each lesson.
                </p>
              </div>
              <button
                type="button"
                onClick={async () => {
                  const enabled = meetingPlatforms.includes("google_meet");
                  const updated = enabled
                    ? meetingPlatforms.filter((p) => p !== "google_meet")
                    : [...meetingPlatforms, "google_meet"];
                  setMeetingPlatforms(updated);
                  await fetch("/api/admin/settings", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ key: "meeting_platforms", value: updated }),
                  });
                }}
                className={`relative h-6 w-11 rounded-full transition-colors ${
                  meetingPlatforms.includes("google_meet") ? "bg-primary" : "bg-muted"
                }`}
              >
                <span
                  className={`block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                    meetingPlatforms.includes("google_meet") ? "translate-x-5" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>
            {meetingPlatforms.includes("google_meet") && (
              <div className="pt-2 border-t space-y-2">
                {googleMeetEmail ? (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="bg-green-500/10 text-green-700">Connected</Badge>
                      <span className="text-sm">{googleMeetEmail}</span>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={async () => {
                        if (!confirm("Disconnect Google Meet? New lessons will no longer get Meet links.")) return;
                        await fetch("/api/admin/settings", {
                          method: "PUT",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ key: "google_meet_credentials", value: null }),
                        });
                        setGoogleMeetEmail(null);
                        setMeetingMessage("Google Meet disconnected.");
                      }}
                    >
                      Disconnect
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      window.location.href = "/api/admin/meetings/google/connect";
                    }}
                  >
                    <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                    Connect Google Account
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Zoom */}
          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none">
                    <rect width="24" height="24" rx="4" fill="#2D8CFF"/>
                    <path d="M5 8.5C5 7.67 5.67 7 6.5 7H14.5C15.33 7 16 7.67 16 8.5V15.5C16 16.33 15.33 17 14.5 17H6.5C5.67 17 5 16.33 5 15.5V8.5Z" fill="white"/>
                    <path d="M16 10.5L19.5 8V16L16 13.5V10.5Z" fill="white"/>
                  </svg>
                  Zoom
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {zoomConfigured
                    ? "Auto-creates a unique Zoom meeting for each lesson."
                    : "Uses a shared Zoom meeting link for all lessons."}
                </p>
              </div>
              <button
                type="button"
                onClick={async () => {
                  const enabled = meetingPlatforms.includes("zoom");
                  const updated = enabled
                    ? meetingPlatforms.filter((p) => p !== "zoom")
                    : [...meetingPlatforms, "zoom"];
                  setMeetingPlatforms(updated);
                  await fetch("/api/admin/settings", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ key: "meeting_platforms", value: updated }),
                  });
                }}
                className={`relative h-6 w-11 rounded-full transition-colors ${
                  meetingPlatforms.includes("zoom") ? "bg-primary" : "bg-muted"
                }`}
              >
                <span
                  className={`block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                    meetingPlatforms.includes("zoom") ? "translate-x-5" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>
            {meetingPlatforms.includes("zoom") && (
              <div className="pt-2 border-t space-y-3">
                {zoomConfigured && (
                  <div className="rounded-md bg-green-500/10 p-3 text-sm text-green-700 flex items-center gap-2">
                    <Check className="size-4" />
                    Zoom API connected — unique meetings will be created automatically for each lesson.
                  </div>
                )}
                <div className="space-y-1">
                  <Label className="text-xs">
                    {zoomConfigured ? "Fallback Zoom link (optional)" : "Zoom meeting link"}
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      type="url"
                      value={zoomLink}
                      onChange={(e) => setZoomLink(e.target.value)}
                      placeholder="https://zoom.us/j/..."
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      size="sm"
                      disabled={meetingSaving}
                      onClick={async () => {
                        setMeetingSaving(true);
                        await fetch("/api/admin/settings", {
                          method: "PUT",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ key: "zoom_meeting_link", value: zoomLink }),
                        });
                        setMeetingMessage("Zoom link saved.");
                        setMeetingSaving(false);
                      }}
                    >
                      Save
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {zoomConfigured
                      ? "Used as a fallback if the Zoom API fails to create a meeting."
                      : "This link will be shared with students and tutors for all Zoom lessons. To auto-create unique meetings per lesson, add ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, and ZOOM_CLIENT_SECRET to your environment variables."}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Info text */}
          {meetingPlatforms.length > 0 && (
            <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
              {meetingPlatforms.length === 2 ? (
                <p>Both platforms are enabled. Each tutor can choose their preferred platform in their profile.</p>
              ) : meetingPlatforms.includes("google_meet") ? (
                <p>All lessons will use Google Meet. A unique link is generated for each lesson.</p>
              ) : (
                <p>{zoomConfigured ? "All lessons will use Zoom. A unique meeting is created for each lesson." : "All lessons will use Zoom with the shared meeting link above."}</p>
              )}
              <p>Meeting links are automatically included in booking confirmations and calendar invites sent to both the student and tutor.</p>
            </div>
          )}
        </CardContent>
      </CollapsibleCard>

      {/* Subject Catalog */}
      <CollapsibleCard
        title="Subject Catalog"
        description="Manage the subjects available for tutors to select. Drag to reorder categories and subjects."
        defaultOpen
      >
        <CardContent className="space-y-6">
          {subjectMessage && (
            <div
              className={`rounded-md p-3 text-sm ${
                subjectMessage.startsWith("Error")
                  ? "bg-destructive/10 text-destructive"
                  : "bg-green-500/10 text-green-700"
              }`}
            >
              {subjectMessage}
            </div>
          )}

          {/* Add subject form */}
          <form onSubmit={handleAddSubject} className="rounded-lg border-2 border-primary p-4 space-y-3">
            <p className="text-sm font-medium">Add New Subject</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs" required>Category</Label>
                <Input
                  required
                  value={newSubjectCategory}
                  onChange={(e) => setNewSubjectCategory(e.target.value)}
                  placeholder="e.g. Mathematics"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs" required>Subject Name</Label>
                <Input
                  required
                  value={newSubjectName}
                  onChange={(e) => setNewSubjectName(e.target.value)}
                  placeholder="e.g. Trigonometry"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => { setNewSubjectName(""); setNewSubjectCategory(""); }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={subjectSaving || !newSubjectName.trim() || !newSubjectCategory.trim()}>
                {subjectSaving ? "Adding..." : "Add"}
              </Button>
            </div>
          </form>

          {/* Subject list */}
          {subjectsLoading ? (
            <p className="text-sm text-muted-foreground">Loading subjects...</p>
          ) : subjects.length === 0 ? (
            <p className="text-sm text-muted-foreground">No subjects yet. Add one above.</p>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleCategoryDragEnd}
            >
              <SortableContext
                items={orderedCategories.map((c) => `cat::${c}`)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-6">
                  {orderedCategories.map((category) => {
                    const catSubjects = getSubjectsForCategory(category);
                    return (
                      <SortableCategoryCard key={category} category={category}>
                        {({ listeners, attributes }: { listeners: Record<string, unknown>; attributes: Record<string, unknown> }) => (
                          <>
                            {/* Category header */}
                            <div className="flex items-center justify-between border-b px-4 py-3">
                              {editingCategory === category ? (
                                <form
                                  className="flex items-center gap-2 flex-1"
                                  onSubmit={(e) => { e.preventDefault(); handleRenameCategory(category); }}
                                >
                                  <Input
                                    value={editingCategoryName}
                                    onChange={(e) => setEditingCategoryName(e.target.value)}
                                    className="h-8 max-w-64 text-sm"
                                    autoFocus
                                  />
                                  <Button type="submit" variant="ghost" size="sm" className="text-green-600 shrink-0">
                                    <Check className="size-4" />
                                  </Button>
                                  <Button type="button" variant="ghost" size="sm" className="shrink-0" onClick={() => setEditingCategory(null)}>
                                    <X className="size-4" />
                                  </Button>
                                </form>
                              ) : (
                                <>
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      className="cursor-grab text-muted-foreground hover:text-foreground shrink-0 touch-none"
                                      {...attributes}
                                      {...listeners}
                                    >
                                      <GripVertical className="size-4" />
                                    </button>
                                    <h3 className="text-sm font-bold uppercase tracking-wider">
                                      {category}
                                    </h3>
                                    <Badge variant="secondary" className="text-xs">
                                      {catSubjects.length}
                                    </Badge>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    {category !== "Uncategorized" && (
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="shrink-0"
                                        onClick={() => { setEditingCategory(category); setEditingCategoryName(category); }}
                                      >
                                        <Pencil className="size-3.5" />
                                      </Button>
                                    )}
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="text-destructive shrink-0"
                                      onClick={() => handleDeleteCategory(category)}
                                    >
                                      <Trash2 className="size-3.5" />
                                    </Button>
                                  </div>
                                </>
                              )}
                            </div>

                            {/* Subjects in this category */}
                            <DndContext
                              sensors={sensors}
                              collisionDetection={closestCenter}
                              onDragEnd={(event) => handleSubjectDragEnd(event, category)}
                            >
                              <SortableContext
                                items={catSubjects.map((s) => s.id)}
                                strategy={verticalListSortingStrategy}
                              >
                                <div className="divide-y">
                                  {catSubjects.map((subject) => (
                                    <SortableSubjectRow
                                      key={subject.id}
                                      subject={subject}
                                      editingSubjectId={editingSubjectId}
                                      editingSubjectName={editingSubjectName}
                                      setEditingSubjectId={setEditingSubjectId}
                                      setEditingSubjectName={setEditingSubjectName}
                                      handleRenameSubject={handleRenameSubject}
                                      deletingId={deletingId}
                                      handleDeleteSubject={handleDeleteSubject}
                                    />
                                  ))}

                                  {/* Add subject to category */}
                                  {addingToCategory === category ? (
                                    <form
                                      className="flex items-center gap-2 px-4 py-2.5"
                                      onSubmit={(e) => { e.preventDefault(); handleAddSubjectToCategory(category); }}
                                    >
                                      <Input
                                        value={addingSubjectName}
                                        onChange={(e) => setAddingSubjectName(e.target.value)}
                                        placeholder="New subject name"
                                        className="h-8 text-sm"
                                        autoFocus
                                      />
                                      <Button type="submit" variant="ghost" size="sm" className="text-green-600 shrink-0" disabled={!addingSubjectName.trim()}>
                                        <Check className="size-4" />
                                      </Button>
                                      <Button type="button" variant="ghost" size="sm" className="shrink-0" onClick={() => { setAddingToCategory(null); setAddingSubjectName(""); }}>
                                        <X className="size-4" />
                                      </Button>
                                    </form>
                                  ) : (
                                    <div className="px-4 py-2.5">
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="w-full bg-gray-200 text-gray-700 hover:bg-gray-300 border-gray-300"
                                        onClick={() => { setAddingToCategory(category); setAddingSubjectName(""); }}
                                      >
                                        <Plus className="size-3.5 mr-1.5" />
                                        Add Subject
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              </SortableContext>
                            </DndContext>
                          </>
                        )}
                      </SortableCategoryCard>
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>
          )}

          <p className="text-xs text-muted-foreground">
            {subjects.length} subject{subjects.length !== 1 ? "s" : ""} total
          </p>
        </CardContent>
      </CollapsibleCard>
    </div>
  );
}
