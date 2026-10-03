"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export default function LessonNotesPage() {
  const params = useParams();
  const clientId = params.id as string;
  const lessonId = params.lessonId as string;
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [lessonInfo, setLessonInfo] = useState<{
    subject: string;
    learner: string;
    date: string;
    status: string;
  } | null>(null);

  const [noteId, setNoteId] = useState<string | null>(null);
  const [noteStatus, setNoteStatus] = useState<"draft" | "published">("draft");
  const [covered, setCovered] = useState("");
  const [homework, setHomework] = useState("");
  const [nextSteps, setNextSteps] = useState("");

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

    // Fetch lesson
    const { data: lesson } = await supabase
      .from("lessons")
      .select("id, starts_at, status, subjects(name), learners(full_name)")
      .eq("id", lessonId)
      .eq("tutor_id", tutor.id)
      .single();

    if (!lesson) {
      router.push(`/clients/${clientId}`);
      return;
    }

    setLessonInfo({
      subject: (lesson.subjects as unknown as { name: string })?.name || "",
      learner: (lesson.learners as unknown as { full_name: string })?.full_name || "",
      date: new Date(lesson.starts_at).toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
      }),
      status: lesson.status,
    });

    // Fetch existing notes
    const { data: note } = await supabase
      .from("lesson_notes")
      .select("*")
      .eq("lesson_id", lessonId)
      .eq("tutor_id", tutor.id)
      .single();

    if (note) {
      setNoteId(note.id);
      setNoteStatus(note.status as "draft" | "published");
      setCovered(note.covered || "");
      setHomework(note.homework || "");
      setNextSteps(note.next_steps || "");
    }

    setLoading(false);
  }, [lessonId, clientId, router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleSave(publish: boolean) {
    setSaving(true);
    setMessage(null);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from("profiles").select("id").eq("user_id", user.id).single();
    if (!profile) return;

    const { data: tutor } = await supabase
      .from("tutors").select("id").eq("profile_id", profile.id).single();
    if (!tutor) return;

    const noteData = {
      covered: covered || null,
      homework: homework || null,
      next_steps: nextSteps || null,
      status: publish ? "published" : "draft",
      published_at: publish ? new Date().toISOString() : null,
    };

    if (noteId) {
      const { error } = await supabase
        .from("lesson_notes")
        .update(noteData)
        .eq("id", noteId);

      if (error) {
        setMessage(`Error: ${error.message}`);
      } else {
        setNoteStatus(publish ? "published" : "draft");
        setMessage(publish ? "Notes published! The family can now see them." : "Draft saved.");
      }
    } else {
      const { error } = await supabase.from("lesson_notes").insert({
        lesson_id: lessonId,
        tutor_id: tutor.id,
        ...noteData,
      });

      if (error) {
        setMessage(`Error: ${error.message}`);
      } else {
        setMessage(publish ? "Notes published!" : "Draft saved.");
        await loadData();
      }
    }

    // If publishing, also mark lesson as completed
    if (publish) {
      await supabase
        .from("lessons")
        .update({ status: "completed" })
        .eq("id", lessonId)
        .in("status", ["confirmed"]);
    }

    setSaving(false);
  }

  if (loading) {
    return <p className="py-12 text-center text-muted-foreground">Loading...</p>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Lesson Notes</h1>
          {lessonInfo && (
            <p className="text-sm text-muted-foreground">
              {lessonInfo.subject} · {lessonInfo.learner} · {lessonInfo.date}
            </p>
          )}
        </div>
        <Badge variant={noteStatus === "published" ? "default" : "secondary"}>
          {noteStatus}
        </Badge>
      </div>

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

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Session Summary</CardTitle>
          <CardDescription>
            {noteStatus === "published"
              ? "These notes are visible to the family."
              : "Save as draft or publish to share with the family."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>What we covered</Label>
            <Textarea
              value={covered}
              onChange={(e) => setCovered(e.target.value)}
              rows={3}
              placeholder="Topics and concepts covered in this session..."
            />
          </div>
          <div className="space-y-2">
            <Label>Homework / Practice</Label>
            <Textarea
              value={homework}
              onChange={(e) => setHomework(e.target.value)}
              rows={3}
              placeholder="Assignments or practice recommendations..."
            />
          </div>
          <div className="space-y-2">
            <Label>Next steps</Label>
            <Textarea
              value={nextSteps}
              onChange={(e) => setNextSteps(e.target.value)}
              rows={3}
              placeholder="Plan for the next session..."
            />
          </div>
        </CardContent>
        <CardFooter className="flex gap-2">
          <Button variant="outline" onClick={() => router.push(`/clients/${clientId}`)}>
            Back
          </Button>
          <Button
            variant="outline"
            onClick={() => handleSave(false)}
            disabled={saving}
          >
            Save draft
          </Button>
          <Button
            onClick={() => handleSave(true)}
            disabled={saving}
            className="flex-1"
          >
            {saving
              ? "Saving..."
              : noteStatus === "published"
              ? "Update & publish"
              : "Publish to family"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
