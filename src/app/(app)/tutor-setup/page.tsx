"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function TutorSetupPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    bio: "",
    credentials: "",
    years_experience: "",
    meeting_link: "",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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

    // Check if profile exists
    let { data: profile } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("user_id", user.id)
      .single();

    if (!profile) {
      // Create tutor profile
      const { data: newProfile, error: profileError } = await supabase
        .from("profiles")
        .insert({
          user_id: user.id,
          role: "tutor",
          full_name: user.user_metadata?.full_name || user.email?.split("@")[0] || "Tutor",
          time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        })
        .select()
        .single();

      if (profileError) {
        setError(profileError.message);
        setLoading(false);
        return;
      }
      profile = newProfile;
    } else if (profile.role !== "tutor") {
      // Update role to tutor
      await supabase
        .from("profiles")
        .update({ role: "tutor" })
        .eq("id", profile.id);
    }

    // Create tutor record
    const { error: tutorError } = await supabase.from("tutors").insert({
      profile_id: profile!.id,
      bio: form.bio || null,
      credentials: form.credentials || null,
      years_experience: form.years_experience ? parseInt(form.years_experience) : null,
      meeting_link: form.meeting_link || null,
    });

    if (tutorError) {
      if (tutorError.code === "23505") {
        // Already exists, just redirect
        router.push("/dashboard");
        return;
      }
      setError(tutorError.message);
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-lg">
        <form onSubmit={handleSubmit}>
          <CardHeader>
            <CardTitle>Set up your tutor profile</CardTitle>
            <CardDescription>
              Tell families about yourself. You can edit this later.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="bio">Bio</Label>
              <Textarea
                id="bio"
                value={form.bio}
                onChange={(e) => setForm({ ...form, bio: e.target.value })}
                rows={4}
                placeholder="Tell families about your teaching approach..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="credentials">Credentials</Label>
              <Input
                id="credentials"
                value={form.credentials}
                onChange={(e) => setForm({ ...form, credentials: e.target.value })}
                placeholder="e.g., M.S. Mathematics, Certified Teacher"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="experience">Years of experience</Label>
              <Input
                id="experience"
                type="number"
                min="0"
                value={form.years_experience}
                onChange={(e) => setForm({ ...form, years_experience: e.target.value })}
                placeholder="e.g., 8"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="meetingLink">Zoom / Google Meet link</Label>
              <Input
                id="meetingLink"
                type="url"
                value={form.meeting_link}
                onChange={(e) => setForm({ ...form, meeting_link: e.target.value })}
                placeholder="https://zoom.us/j/..."
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Setting up..." : "Create tutor profile"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
