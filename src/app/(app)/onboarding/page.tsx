"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { GradeLevelSelect } from "@/components/grade-level-select";
import { Trash2 } from "lucide-react";

interface LearnerForm {
  full_name: string;
  grade_level: string;
}

export default function OnboardingPage() {
  const router = useRouter();
  const searchParams = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const redirectTo = searchParams.get("redirect") || "";
  const [learners, setLearners] = useState<LearnerForm[]>([
    { full_name: "", grade_level: "" },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLearnersSubmit() {
    setLoading(true);
    setError(null);

    const validLearners = learners.filter((l) => l.full_name.trim());
    if (validLearners.length === 0) {
      setError("Please add at least one child.");
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/login");
      return;
    }

    // Ensure profile exists via API (bypasses RLS)
    const profileRes = await fetch("/api/auth/ensure-profile", { method: "POST" });
    if (!profileRes.ok) {
      setError("Failed to set up profile. Please try again.");
      setLoading(false);
      return;
    }
    const { profile_id } = await profileRes.json();

    const { error: learnersError } = await supabase.from("learners").insert(
      validLearners.map((l) => ({
        account_holder_id: profile_id,
        full_name: l.full_name.trim(),
        grade_level: l.grade_level || null,
        is_self: false,
      }))
    );

    if (learnersError) {
      setError(learnersError.message);
      setLoading(false);
      return;
    }

    router.push(redirectTo || "/lessons");
    router.refresh();
  }

  function addLearner() {
    setLearners([...learners, { full_name: "", grade_level: "" }]);
  }

  function updateLearner(index: number, field: keyof LearnerForm, value: string) {
    const updated = [...learners];
    updated[index] = { ...updated[index], [field]: value };
    setLearners(updated);
  }

  function removeLearner(index: number) {
    if (learners.length > 1) {
      setLearners(learners.filter((_, i) => i !== index));
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Add your children</CardTitle>
          <CardDescription>
            Add the learners you&apos;ll be booking lessons for.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          {learners.map((learner, index) => (
            <div key={index} className="flex items-center justify-between rounded-md border p-3">
              <div className="flex-1 space-y-3">
                <div className="space-y-2">
                  <Label htmlFor={`name-${index}`} className="text-xs" required>Name</Label>
                  <Input
                    id={`name-${index}`}
                    value={learner.full_name}
                    onChange={(e) => updateLearner(index, "full_name", e.target.value)}
                    placeholder="Child's name"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`grade-${index}`} className="text-xs">Grade level (optional)</Label>
                  <GradeLevelSelect
                    id={`grade-${index}`}
                    value={learner.grade_level}
                    onChange={(val) => updateLearner(index, "grade_level", val)}
                  />
                </div>
              </div>
              {learners.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-2 shrink-0 text-destructive hover:text-destructive"
                  onClick={() => removeLearner(index)}
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>
          ))}
          <button
            type="button"
            className="w-full rounded-lg border-2 border-dashed border-muted p-4 text-sm text-muted-foreground hover:border-gold-400/30 hover:text-foreground transition-colors"
            onClick={addLearner}
          >
            + Add another child
          </button>
        </CardContent>
        <CardFooter>
          <Button onClick={handleLearnersSubmit} className="w-full" disabled={loading}>
            {loading ? "Saving..." : "Finish setup"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
