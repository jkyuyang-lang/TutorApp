"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GripVertical } from "lucide-react";
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

interface Subject {
  id: string;
  name: string;
  category: string | null;
}

interface TutorSubject {
  id: string;
  subject_id: string;
  levels: string[];
  format: string;
  durations: number[];
  prices: Record<string, number>;
  active: boolean;
  sort_order: number;
  subjects: Subject;
}

/* ------------------------------------------------------------------ */
/*  Sortable subject card                                              */
/* ------------------------------------------------------------------ */
function SortableSubjectCard({
  ts,
  onToggleActive,
  onRemove,
}: {
  ts: TutorSubject;
  onToggleActive: (ts: TutorSubject) => void;
  onRemove: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: ts.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
  };

  return (
    <Card ref={setNodeRef} style={style} className={!ts.active ? "opacity-60" : ""}>
      <CardContent className="flex items-center gap-3 p-4">
        <button
          type="button"
          className="cursor-grab text-muted-foreground hover:text-foreground shrink-0 touch-none"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
        <div className="space-y-1 flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium">{ts.subjects.name}</span>
            {!ts.active && <Badge variant="secondary">Inactive</Badge>}
          </div>
          <div className="flex flex-wrap gap-1">
            {ts.levels.map((level) => (
              <Badge key={level} variant="outline" className="text-xs">
                {level}
              </Badge>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            {ts.durations.map((d) => (
              <span key={d} className="mr-3">
                {d} min — <span className="font-bold">${ts.prices[String(d)] ?? "?"}</span>
              </span>
            ))}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="ghost" size="sm" onClick={() => onToggleActive(ts)}>
            {ts.active ? "Deactivate" : "Activate"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            onClick={() => onRemove(ts.id)}
          >
            Remove
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */
export default function SubjectsPage() {
  const [tutorId, setTutorId] = useState<string | null>(null);
  const [allSubjects, setAllSubjects] = useState<Subject[]>([]);
  const [tutorSubjects, setTutorSubjects] = useState<TutorSubject[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Add form
  const [selectedSubject, setSelectedSubject] = useState("");
  const [levels, setLevels] = useState("");
  const [durations, setDurations] = useState("60");
  const [prices, setPrices] = useState("70");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const loadData = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from("profiles").select("id").eq("user_id", user.id).single();
    if (!profile) return;

    const { data: tutor } = await supabase
      .from("tutors").select("id").eq("profile_id", profile.id).single();
    if (!tutor) return;

    setTutorId(tutor.id);

    const [subjectsRes, tutorSubjectsRes] = await Promise.all([
      supabase.from("subjects").select("*").order("category").order("name"),
      supabase
        .from("tutor_subjects")
        .select("*, subjects(*)")
        .eq("tutor_id", tutor.id)
        .order("sort_order"),
    ]);

    setAllSubjects(subjectsRes.data ?? []);
    setTutorSubjects(tutorSubjectsRes.data as TutorSubject[] ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function addSubject() {
    if (!tutorId || !selectedSubject) return;
    setSaving(true);
    setMessage(null);

    const durationArr = durations.split(",").map((d) => parseInt(d.trim())).filter(Boolean);
    const priceArr = prices.split(",").map((p) => parseFloat(p.trim())).filter(Boolean);
    const priceMap: Record<string, number> = {};
    durationArr.forEach((d, i) => {
      priceMap[String(d)] = priceArr[i] ?? priceArr[0] ?? 0;
    });

    const newSortOrder = tutorSubjects.length > 0
      ? Math.max(...tutorSubjects.map((ts) => ts.sort_order)) + 1
      : 0;

    const supabase = createClient();
    const { error } = await supabase.from("tutor_subjects").insert({
      tutor_id: tutorId,
      subject_id: selectedSubject,
      levels: levels
        .split(",")
        .map((l) => l.trim())
        .filter(Boolean),
      durations: durationArr,
      prices: priceMap,
      format: "online",
      active: true,
      sort_order: newSortOrder,
    });

    if (error) {
      setMessage(`Error: ${error.message}`);
    } else {
      setMessage("Subject added.");
      setSelectedSubject("");
      setLevels("");
      await loadData();
    }
    setSaving(false);
  }

  async function toggleActive(ts: TutorSubject) {
    const supabase = createClient();
    await supabase
      .from("tutor_subjects")
      .update({ active: !ts.active })
      .eq("id", ts.id);
    await loadData();
  }

  async function removeSubject(id: string) {
    const supabase = createClient();
    await supabase.from("tutor_subjects").delete().eq("id", id);
    await loadData();
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = tutorSubjects.findIndex((ts) => ts.id === active.id);
    const newIndex = tutorSubjects.findIndex((ts) => ts.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(tutorSubjects, oldIndex, newIndex);

    // Optimistic update
    setTutorSubjects(reordered.map((ts, i) => ({ ...ts, sort_order: i })));

    // Persist
    const supabase = createClient();
    await Promise.all(
      reordered.map((ts, idx) =>
        supabase.from("tutor_subjects").update({ sort_order: idx }).eq("id", ts.id)
      )
    );
  }

  if (loading) {
    return <p className="py-12 text-center text-muted-foreground">Loading...</p>;
  }

  // Subjects not yet added
  const addedIds = new Set(tutorSubjects.map((ts) => ts.subject_id));
  const available = allSubjects.filter((s) => !addedIds.has(s.id));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Subjects & Pricing</h1>

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

      {/* Current subjects */}
      {tutorSubjects.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No subjects added yet. Add your first subject below.
          </CardContent>
        </Card>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={tutorSubjects.map((ts) => ts.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-3">
              {tutorSubjects.map((ts) => (
                <SortableSubjectCard
                  key={ts.id}
                  ts={ts}
                  onToggleActive={toggleActive}
                  onRemove={removeSubject}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <Separator />

      {/* Add subject */}
      <Card>
        <CardHeader>
          <CardTitle>Add a Subject</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label required>Subject</Label>
            <Select value={selectedSubject} onValueChange={setSelectedSubject}>
              <SelectTrigger>
                <SelectValue placeholder="Select a subject..." />
              </SelectTrigger>
              <SelectContent>
                {available.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} ({s.category})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Levels (comma-separated)</Label>
            <Input
              value={levels}
              onChange={(e) => setLevels(e.target.value)}
              placeholder="e.g., Grade 8, Grade 9, Grade 10"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label required>Durations (minutes, comma-separated)</Label>
              <Input
                required
                value={durations}
                onChange={(e) => setDurations(e.target.value)}
                placeholder="e.g., 30, 60, 90"
              />
            </div>
            <div className="space-y-2">
              <Label required>Prices ($, comma-separated, matching durations)</Label>
              <Input
                required
                value={prices}
                onChange={(e) => setPrices(e.target.value)}
                placeholder="e.g., 40, 70, 100"
              />
            </div>
          </div>
          <Button onClick={addSubject} disabled={saving || !selectedSubject}>
            {saving ? "Adding..." : "Add subject"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
