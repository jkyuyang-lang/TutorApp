"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GradeLevelSelect } from "@/components/grade-level-select";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";

interface Learner {
  id: string;
  full_name: string;
  grade_level: string | null;
  is_self: boolean;
}

interface ManageLearnersProps {
  profileId: string;
}

export function ManageLearners({ profileId }: ManageLearnersProps) {
  const [learners, setLearners] = useState<Learner[]>([]);
  const [loading, setLoading] = useState(true);

  // Add learner state
  const [showAddLearner, setShowAddLearner] = useState(false);
  const [newLearnerName, setNewLearnerName] = useState("");
  const [newLearnerGrade, setNewLearnerGrade] = useState("");
  const [addingLearner, setAddingLearner] = useState(false);

  // Edit learner state
  const [editingLearnerId, setEditingLearnerId] = useState<string | null>(null);
  const [editLearnerName, setEditLearnerName] = useState("");
  const [editLearnerGrade, setEditLearnerGrade] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const loadLearners = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("learners")
      .select("id, full_name, grade_level, is_self")
      .eq("account_holder_id", profileId)
      .order("is_self", { ascending: false });
    setLearners(data ?? []);
    setLoading(false);
  }, [profileId]);

  useEffect(() => {
    loadLearners();
  }, [loadLearners]);

  async function addLearner() {
    if (!newLearnerName.trim()) return;
    setAddingLearner(true);
    const supabase = createClient();

    const { error } = await supabase.from("learners").insert({
      account_holder_id: profileId,
      full_name: newLearnerName.trim(),
      grade_level: newLearnerGrade.trim() || null,
      is_self: false,
    });

    if (!error) {
      setNewLearnerName("");
      setNewLearnerGrade("");
      await loadLearners();
    }
    setAddingLearner(false);
  }

  async function removeLearner(id: string) {
    const supabase = createClient();
    await supabase.from("learners").delete().eq("id", id);
    setLearners((prev) => prev.filter((l) => l.id !== id));
  }

  function startEditLearner(learner: Learner) {
    setEditingLearnerId(learner.id);
    setEditLearnerName(learner.full_name);
    setEditLearnerGrade(learner.grade_level ?? "");
  }

  function cancelEditLearner() {
    setEditingLearnerId(null);
    setEditLearnerName("");
    setEditLearnerGrade("");
  }

  async function updateLearner() {
    if (!editingLearnerId || !editLearnerName.trim()) return;
    setSavingEdit(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("learners")
      .update({
        full_name: editLearnerName.trim(),
        grade_level: editLearnerGrade.trim() || null,
      })
      .eq("id", editingLearnerId);

    if (!error) {
      setLearners((prev) =>
        prev.map((l) =>
          l.id === editingLearnerId
            ? { ...l, full_name: editLearnerName.trim(), grade_level: editLearnerGrade.trim() || null }
            : l
        )
      );
      cancelEditLearner();
    }
    setSavingEdit(false);
  }

  if (loading) {
    return <p className="py-4 text-center text-sm text-muted-foreground">Loading...</p>;
  }

  return (
    <div className="space-y-4">
      {/* Existing learners */}
      {learners.length === 0 ? (
        <p className="text-sm text-muted-foreground">No learners added yet.</p>
      ) : (
        <div className="space-y-2">
          {learners.map((learner) =>
            editingLearnerId === learner.id ? (
              <div key={learner.id} className="rounded-md border p-3 space-y-2">
                <div className="space-y-1">
                  <Label className="text-xs" required>Name</Label>
                  <Input
                    value={editLearnerName}
                    onChange={(e) => setEditLearnerName(e.target.value)}
                    placeholder="Full name"
                    required
                    autoFocus
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Grade level (optional)</Label>
                  <GradeLevelSelect
                    value={editLearnerGrade}
                    onChange={setEditLearnerGrade}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={updateLearner}
                    disabled={!editLearnerName.trim() || savingEdit}
                  >
                    <Check className="size-4 mr-1" />
                    {savingEdit ? "Saving..." : "Save"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={cancelEditLearner}>
                    <X className="size-4 mr-1" />
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div key={learner.id} className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <p className="text-sm font-medium">
                    {learner.full_name}
                    {learner.is_self && (
                      <span className="ml-2 text-xs text-muted-foreground">(myself)</span>
                    )}
                  </p>
                  {learner.grade_level && (
                    <p className="text-xs text-muted-foreground">Grade: {learner.grade_level}</p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => startEditLearner(learner)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  {!learner.is_self && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => removeLearner(learner.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
              </div>
            )
          )}
        </div>
      )}

      {/* Add new learner */}
      {showAddLearner ? (
        <div className="space-y-3 rounded-md border p-3">
          <p className="text-sm font-medium">Add a learner</p>
          <div className="space-y-2">
            <Label className="text-xs" required>Name</Label>
            <Input
              value={newLearnerName}
              onChange={(e) => setNewLearnerName(e.target.value)}
              placeholder="Full name"
              required
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Grade level (optional)</Label>
            <GradeLevelSelect
              value={newLearnerGrade}
              onChange={setNewLearnerGrade}
            />
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={async () => {
                await addLearner();
                setShowAddLearner(false);
              }}
              disabled={!newLearnerName.trim() || addingLearner}
            >
              <Plus className="size-4 mr-1" />
              {addingLearner ? "Adding..." : "Add Learner"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => {
              setShowAddLearner(false);
              setNewLearnerName("");
              setNewLearnerGrade("");
            }}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="w-full rounded-lg border-2 border-dashed border-muted p-4 text-sm text-muted-foreground hover:border-gold-400/30 hover:text-foreground transition-colors"
          onClick={() => setShowAddLearner(true)}
        >
          <Plus className="size-4 inline mr-1" />
          Add a Learner
        </button>
      )}
    </div>
  );
}
