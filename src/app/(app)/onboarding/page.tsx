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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Step = "role" | "learners" | "done";

interface LearnerForm {
  full_name: string;
  grade_level: string;
}

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("role");
  const [role, setRole] = useState<"student" | "parent">("student");
  const [timeZone, setTimeZone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone
  );
  const [learners, setLearners] = useState<LearnerForm[]>([
    { full_name: "", grade_level: "" },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRoleSubmit() {
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/login");
      return;
    }

    // Check if profile already exists
    const { data: existing } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (existing) {
      // Profile already exists, skip to lessons
      router.push("/lessons");
      return;
    }

    // Create profile
    const { error: profileError } = await supabase.from("profiles").insert({
      user_id: user.id,
      role,
      full_name: user.user_metadata?.full_name || user.email?.split("@")[0] || "User",
      time_zone: timeZone,
    });

    if (profileError) {
      setError(profileError.message);
      setLoading(false);
      return;
    }

    if (role === "student") {
      // Create a self-learner record
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (profile) {
        await supabase.from("learners").insert({
          account_holder_id: profile.id,
          is_self: true,
          full_name: user.user_metadata?.full_name || "Self",
        });
      }

      router.push("/lessons");
      router.refresh();
    } else {
      setStep("learners");
    }
    setLoading(false);
  }

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

    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!profile) {
      setError("Profile not found. Please try again.");
      setLoading(false);
      return;
    }

    const { error: learnersError } = await supabase.from("learners").insert(
      validLearners.map((l) => ({
        account_holder_id: profile.id,
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

    router.push("/lessons");
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

  if (step === "role") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Welcome! Let&apos;s get started</CardTitle>
            <CardDescription>
              Tell us about yourself so we can set up your account.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label>I am a...</Label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setRole("student")}
                  className={`rounded-lg border-2 p-4 text-left transition-colors ${
                    role === "student"
                      ? "border-primary bg-primary/5"
                      : "border-muted hover:border-muted-foreground/30"
                  }`}
                >
                  <div className="font-medium">Student</div>
                  <div className="text-sm text-muted-foreground">
                    I&apos;m booking lessons for myself
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setRole("parent")}
                  className={`rounded-lg border-2 p-4 text-left transition-colors ${
                    role === "parent"
                      ? "border-primary bg-primary/5"
                      : "border-muted hover:border-muted-foreground/30"
                  }`}
                >
                  <div className="font-medium">Parent</div>
                  <div className="text-sm text-muted-foreground">
                    I&apos;m booking for my child
                  </div>
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="timezone">Time zone</Label>
              <Select value={timeZone} onValueChange={(val) => { if (val) setTimeZone(val); }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Intl.supportedValuesOf("timeZone")
                    .filter((tz) => tz.startsWith("America/") || tz.startsWith("US/") || tz.startsWith("Europe/") || tz.startsWith("Asia/") || tz.startsWith("Pacific/"))
                    .map((tz) => (
                      <SelectItem key={tz} value={tz}>
                        {tz.replace(/_/g, " ")}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
          <CardFooter>
            <Button onClick={handleRoleSubmit} className="w-full" disabled={loading}>
              {loading ? "Setting up..." : "Continue"}
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // Step: learners (parent flow)
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
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
            <div key={index} className="space-y-3 rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Child {index + 1}</span>
                {learners.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeLearner(index)}
                    className="text-sm text-muted-foreground hover:text-destructive"
                  >
                    Remove
                  </button>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor={`name-${index}`}>Name</Label>
                <Input
                  id={`name-${index}`}
                  value={learner.full_name}
                  onChange={(e) => updateLearner(index, "full_name", e.target.value)}
                  placeholder="Child's name"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`grade-${index}`}>Grade level (optional)</Label>
                <Input
                  id={`grade-${index}`}
                  value={learner.grade_level}
                  onChange={(e) => updateLearner(index, "grade_level", e.target.value)}
                  placeholder="e.g., 8th grade"
                />
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" onClick={addLearner} className="w-full">
            + Add another child
          </Button>
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
