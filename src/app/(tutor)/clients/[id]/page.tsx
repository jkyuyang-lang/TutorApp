"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

interface ClientProfile {
  id: string;
  full_name: string;
  phone: string | null;
  time_zone: string;
}

interface Learner {
  id: string;
  full_name: string;
  grade_level: string | null;
  school: string | null;
  is_self: boolean;
}

interface Lesson {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  focus_notes: string | null;
  subjects: { name: string };
  learners: { full_name: string };
  lesson_notes: Array<{
    id: string;
    covered: string | null;
    homework: string | null;
    next_steps: string | null;
    status: string;
  }>;
}

interface PrivateNote {
  id: string;
  learner_id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

interface Goal {
  id: string;
  learner_id: string;
  title: string;
  description: string | null;
  status: string;
  subjects: { name: string };
}

export default function ClientDetailPage() {
  const params = useParams();
  const clientProfileId = params.id as string;
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [tutorId, setTutorId] = useState("");
  const [clientProfile, setClientProfile] = useState<ClientProfile | null>(null);
  const [learners, setLearners] = useState<Learner[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [privateNotes, setPrivateNotes] = useState<PrivateNote[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [clientNotes, setClientNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  // New private note form
  const [newNoteLearnerId, setNewNoteLearnerId] = useState("");
  const [newNoteContent, setNewNoteContent] = useState("");
  const [savingPrivateNote, setSavingPrivateNote] = useState(false);

  // New goal form
  const [newGoalLearnerId, setNewGoalLearnerId] = useState("");
  const [newGoalSubjectId, setNewGoalSubjectId] = useState("");
  const [newGoalTitle, setNewGoalTitle] = useState("");
  const [newGoalDesc, setNewGoalDesc] = useState("");
  const [savingGoal, setSavingGoal] = useState(false);
  const [subjects, setSubjects] = useState<{ id: string; name: string }[]>([]);

  const loadData = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: myProfile } = await supabase
      .from("profiles").select("id").eq("user_id", user.id).single();
    if (!myProfile) return;

    const { data: tutor } = await supabase
      .from("tutors").select("id").eq("profile_id", myProfile.id).single();
    if (!tutor) return;
    setTutorId(tutor.id);

    // Client profile
    const { data: cp } = await supabase
      .from("profiles")
      .select("id, full_name, phone, time_zone")
      .eq("id", clientProfileId)
      .single();
    setClientProfile(cp);

    // Client relationship notes
    const { data: tc } = await supabase
      .from("tutor_clients")
      .select("notes")
      .eq("tutor_id", tutor.id)
      .eq("account_holder_id", clientProfileId)
      .single();
    setClientNotes(tc?.notes || "");

    // Learners
    const { data: lrs } = await supabase
      .from("learners")
      .select("id, full_name, grade_level, school, is_self")
      .eq("account_holder_id", clientProfileId);
    setLearners(lrs ?? []);
    if (lrs && lrs.length > 0) {
      setNewNoteLearnerId(lrs[0].id);
      setNewGoalLearnerId(lrs[0].id);
    }

    // Lessons
    const { data: lsns } = await supabase
      .from("lessons")
      .select("id, starts_at, ends_at, status, focus_notes, subjects(name), learners(full_name), lesson_notes(id, covered, homework, next_steps, status)")
      .eq("tutor_id", tutor.id)
      .eq("booked_by", clientProfileId)
      .order("starts_at", { ascending: false })
      .limit(50);
    setLessons((lsns as unknown as Lesson[]) ?? []);

    // Private notes for this client's learners
    const learnerIds = (lrs ?? []).map((l) => l.id);
    if (learnerIds.length > 0) {
      const { data: pn } = await supabase
        .from("private_notes")
        .select("*")
        .eq("tutor_id", tutor.id)
        .in("learner_id", learnerIds)
        .order("created_at", { ascending: false });
      setPrivateNotes(pn ?? []);
    }

    // Goals
    if (learnerIds.length > 0) {
      const { data: gs } = await supabase
        .from("goals")
        .select("*, subjects(name)")
        .eq("tutor_id", tutor.id)
        .in("learner_id", learnerIds)
        .order("created_at", { ascending: false });
      setGoals((gs as unknown as Goal[]) ?? []);
    }

    // Subjects for goal creation
    const { data: subs } = await supabase
      .from("tutor_subjects")
      .select("subject_id, subjects(name)")
      .eq("tutor_id", tutor.id)
      .eq("active", true);
    setSubjects(
      (subs ?? []).map((s) => ({
        id: s.subject_id,
        name: (s.subjects as unknown as { name: string })?.name || "",
      }))
    );
    if (subs && subs.length > 0) {
      setNewGoalSubjectId(subs[0].subject_id);
    }

    setLoading(false);
  }, [clientProfileId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function saveClientNotes() {
    setSavingNotes(true);
    const supabase = createClient();
    await supabase
      .from("tutor_clients")
      .update({ notes: clientNotes || null })
      .eq("tutor_id", tutorId)
      .eq("account_holder_id", clientProfileId);
    setSavingNotes(false);
  }

  async function addPrivateNote() {
    if (!newNoteContent.trim()) return;
    setSavingPrivateNote(true);
    const supabase = createClient();
    await supabase.from("private_notes").insert({
      tutor_id: tutorId,
      learner_id: newNoteLearnerId,
      content: newNoteContent.trim(),
    });
    setNewNoteContent("");
    await loadData();
    setSavingPrivateNote(false);
  }

  async function addGoal() {
    if (!newGoalTitle.trim()) return;
    setSavingGoal(true);
    const supabase = createClient();
    await supabase.from("goals").insert({
      tutor_id: tutorId,
      learner_id: newGoalLearnerId,
      subject_id: newGoalSubjectId,
      title: newGoalTitle.trim(),
      description: newGoalDesc.trim() || null,
    });
    setNewGoalTitle("");
    setNewGoalDesc("");
    await loadData();
    setSavingGoal(false);
  }

  async function updateGoalStatus(goalId: string, status: string) {
    const supabase = createClient();
    await supabase.from("goals").update({ status }).eq("id", goalId);
    await loadData();
  }

  async function deletePrivateNote(noteId: string) {
    const supabase = createClient();
    await supabase.from("private_notes").delete().eq("id", noteId);
    await loadData();
  }

  if (loading) {
    return <p className="py-12 text-center text-muted-foreground">Loading...</p>;
  }

  if (!clientProfile) {
    return <p className="py-12 text-center text-muted-foreground">Client not found.</p>;
  }

  const getLearnerName = (id: string) =>
    learners.find((l) => l.id === id)?.full_name || "Unknown";

  const goalStatusColors: Record<string, string> = {
    not_started: "bg-gray-100 text-gray-800",
    in_progress: "bg-blue-100 text-blue-800",
    met: "bg-green-100 text-green-800",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{clientProfile.full_name}</h1>
          <p className="text-sm text-muted-foreground">
            {clientProfile.time_zone}
            {clientProfile.phone && ` · ${clientProfile.phone}`}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => router.push("/clients")}>
          Back
        </Button>
      </div>

      {/* Learners */}
      {learners.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {learners.map((l) => (
            <Badge key={l.id} variant="outline">
              {l.full_name}
              {l.grade_level && ` · ${l.grade_level}`}
              {l.school && ` · ${l.school}`}
              {l.is_self && " (self)"}
            </Badge>
          ))}
        </div>
      )}

      <Tabs defaultValue="lessons">
        <TabsList>
          <TabsTrigger value="lessons">
            Lessons ({lessons.length})
          </TabsTrigger>
          <TabsTrigger value="notes">
            Notes ({privateNotes.length})
          </TabsTrigger>
          <TabsTrigger value="goals">
            Goals ({goals.length})
          </TabsTrigger>
        </TabsList>

        {/* Lessons Tab */}
        <TabsContent value="lessons" className="space-y-3 mt-4">
          {lessons.length === 0 ? (
            <Card>
              <CardContent className="py-6 text-center text-sm text-muted-foreground">
                No lessons yet.
              </CardContent>
            </Card>
          ) : (
            lessons.map((lesson) => {
              const start = new Date(lesson.starts_at);
              const end = new Date(lesson.ends_at);
              const hasNotes = lesson.lesson_notes?.length > 0;
              const needsNotes =
                lesson.status === "completed" && !hasNotes;

              return (
                <Card key={lesson.id}>
                  <CardContent className="flex items-center justify-between p-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {lesson.subjects?.name}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {lesson.learners?.full_name}
                        </Badge>
                        <Badge
                          variant="secondary"
                          className={`text-xs ${
                            lesson.status === "completed"
                              ? "bg-blue-100 text-blue-800"
                              : lesson.status === "confirmed"
                              ? "bg-green-100 text-green-800"
                              : ""
                          }`}
                        >
                          {lesson.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {start.toLocaleDateString(undefined, {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                        })}{" "}
                        {start.toLocaleTimeString(undefined, {
                          hour: "numeric",
                          minute: "2-digit",
                        })}{" "}
                        &ndash;{" "}
                        {end.toLocaleTimeString(undefined, {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {needsNotes && (
                        <Button
                          size="sm"
                          variant="outline"
                          render={
                            <Link
                              href={`/clients/${clientProfileId}/notes/${lesson.id}`}
                            />
                          }
                        >
                          Add notes
                        </Button>
                      )}
                      {hasNotes && (
                        <Button
                          size="sm"
                          variant="ghost"
                          render={
                            <Link
                              href={`/clients/${clientProfileId}/notes/${lesson.id}`}
                            />
                          }
                        >
                          View notes
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        {/* Private Notes Tab */}
        <TabsContent value="notes" className="space-y-4 mt-4">
          {/* Client-level notes */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Client Notes</CardTitle>
              <CardDescription>
                General notes about this client (only visible to you).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Textarea
                value={clientNotes}
                onChange={(e) => setClientNotes(e.target.value)}
                rows={3}
                placeholder="Notes about preferences, scheduling, etc..."
              />
            </CardContent>
            <CardFooter>
              <Button size="sm" onClick={saveClientNotes} disabled={savingNotes}>
                {savingNotes ? "Saving..." : "Save"}
              </Button>
            </CardFooter>
          </Card>

          <Separator />

          {/* Add private note */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Add Private Note</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {learners.length > 1 && (
                <div className="space-y-1">
                  <Label className="text-xs">Learner</Label>
                  <select
                    className="w-full rounded-md border px-3 py-2 text-sm"
                    value={newNoteLearnerId}
                    onChange={(e) => setNewNoteLearnerId(e.target.value)}
                  >
                    {learners.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.full_name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <Textarea
                value={newNoteContent}
                onChange={(e) => setNewNoteContent(e.target.value)}
                rows={2}
                placeholder="Private observation, progress note..."
              />
            </CardContent>
            <CardFooter>
              <Button
                size="sm"
                onClick={addPrivateNote}
                disabled={savingPrivateNote || !newNoteContent.trim()}
              >
                {savingPrivateNote ? "Adding..." : "Add note"}
              </Button>
            </CardFooter>
          </Card>

          {/* List private notes */}
          {privateNotes.map((note) => (
            <Card key={note.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      {getLearnerName(note.learner_id)} &middot;{" "}
                      {new Date(note.created_at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                    <p className="text-sm">{note.content}</p>
                  </div>
                  <button
                    onClick={() => deletePrivateNote(note.id)}
                    className="text-xs text-muted-foreground hover:text-destructive"
                  >
                    Delete
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* Goals Tab */}
        <TabsContent value="goals" className="space-y-4 mt-4">
          {/* Add goal */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Add Goal</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {learners.length > 1 && (
                  <div className="space-y-1">
                    <Label className="text-xs">Learner</Label>
                    <select
                      className="w-full rounded-md border px-3 py-2 text-sm"
                      value={newGoalLearnerId}
                      onChange={(e) => setNewGoalLearnerId(e.target.value)}
                    >
                      {learners.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.full_name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="space-y-1">
                  <Label className="text-xs">Subject</Label>
                  <select
                    className="w-full rounded-md border px-3 py-2 text-sm"
                    value={newGoalSubjectId}
                    onChange={(e) => setNewGoalSubjectId(e.target.value)}
                  >
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Goal title</Label>
                <input
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  value={newGoalTitle}
                  onChange={(e) => setNewGoalTitle(e.target.value)}
                  placeholder="e.g., Master quadratic equations"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Description (optional)</Label>
                <Textarea
                  value={newGoalDesc}
                  onChange={(e) => setNewGoalDesc(e.target.value)}
                  rows={2}
                  placeholder="Details about what this goal entails..."
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button
                size="sm"
                onClick={addGoal}
                disabled={savingGoal || !newGoalTitle.trim()}
              >
                {savingGoal ? "Adding..." : "Add goal"}
              </Button>
            </CardFooter>
          </Card>

          {/* List goals */}
          {goals.length === 0 ? (
            <p className="text-sm text-muted-foreground">No goals set yet.</p>
          ) : (
            goals.map((goal) => (
              <Card key={goal.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">
                          {goal.title}
                        </span>
                        <Badge
                          variant="secondary"
                          className={`text-xs ${goalStatusColors[goal.status] || ""}`}
                        >
                          {goal.status.replace("_", " ")}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {getLearnerName(goal.learner_id)} &middot;{" "}
                        {goal.subjects?.name}
                      </p>
                      {goal.description && (
                        <p className="text-sm text-muted-foreground">
                          {goal.description}
                        </p>
                      )}
                    </div>
                    <select
                      className="rounded border px-2 py-1 text-xs"
                      value={goal.status}
                      onChange={(e) =>
                        updateGoalStatus(goal.id, e.target.value)
                      }
                    >
                      <option value="not_started">Not Started</option>
                      <option value="in_progress">In Progress</option>
                      <option value="met">Met</option>
                    </select>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
