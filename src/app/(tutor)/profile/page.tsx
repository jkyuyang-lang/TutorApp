"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function TutorProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [profileForm, setProfileForm] = useState({
    full_name: "",
    phone: "",
    time_zone: "",
  });
  const [tutorForm, setTutorForm] = useState({
    id: "",
    bio: "",
    credentials: "",
    years_experience: "",
    video_url: "",
    meeting_link: "",
  });

  const loadData = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", user.id)
      .single();
    if (!profile) return;

    const { data: tutor } = await supabase
      .from("tutors")
      .select("*")
      .eq("profile_id", profile.id)
      .single();
    if (!tutor) return;

    setProfileForm({
      full_name: profile.full_name || "",
      phone: profile.phone || "",
      time_zone: profile.time_zone || "",
    });
    setTutorForm({
      id: tutor.id,
      bio: tutor.bio || "",
      credentials: tutor.credentials || "",
      years_experience: tutor.years_experience?.toString() || "",
      video_url: tutor.video_url || "",
      meeting_link: tutor.meeting_link || "",
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [profileRes, tutorRes] = await Promise.all([
      supabase
        .from("profiles")
        .update({
          full_name: profileForm.full_name,
          phone: profileForm.phone || null,
          time_zone: profileForm.time_zone,
        })
        .eq("user_id", user.id),
      supabase
        .from("tutors")
        .update({
          bio: tutorForm.bio || null,
          credentials: tutorForm.credentials || null,
          years_experience: tutorForm.years_experience
            ? parseInt(tutorForm.years_experience)
            : null,
          video_url: tutorForm.video_url || null,
          meeting_link: tutorForm.meeting_link || null,
        })
        .eq("id", tutorForm.id),
    ]);

    if (profileRes.error || tutorRes.error) {
      setMessage(`Error: ${profileRes.error?.message || tutorRes.error?.message}`);
    } else {
      setMessage("Profile updated.");
      router.refresh();
    }
    setSaving(false);
  }

  if (loading) {
    return <p className="py-12 text-center text-muted-foreground">Loading...</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Edit Profile</h1>
        <Button variant="outline" size="sm" onClick={() => window.open("/", "_blank")}>
          Preview public profile
        </Button>
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

      <form onSubmit={handleSave} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Personal Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Full name</Label>
                <Input
                  value={profileForm.full_name}
                  onChange={(e) => setProfileForm({ ...profileForm, full_name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input
                  type="tel"
                  value={profileForm.phone}
                  onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Public Profile</CardTitle>
            <CardDescription>This is shown to visitors and prospective clients.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Bio</Label>
              <Textarea
                value={tutorForm.bio}
                onChange={(e) => setTutorForm({ ...tutorForm, bio: e.target.value })}
                rows={4}
                placeholder="Tell families about your teaching approach..."
              />
            </div>
            <div className="space-y-2">
              <Label>Credentials</Label>
              <Input
                value={tutorForm.credentials}
                onChange={(e) => setTutorForm({ ...tutorForm, credentials: e.target.value })}
                placeholder="e.g., M.S. Mathematics, Certified Teacher"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Years of experience</Label>
                <Input
                  type="number"
                  min="0"
                  value={tutorForm.years_experience}
                  onChange={(e) => setTutorForm({ ...tutorForm, years_experience: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Intro video URL</Label>
                <Input
                  type="url"
                  value={tutorForm.video_url}
                  onChange={(e) => setTutorForm({ ...tutorForm, video_url: e.target.value })}
                  placeholder="YouTube or Vimeo link"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Meeting link (Zoom / Google Meet)</Label>
              <Input
                type="url"
                value={tutorForm.meeting_link}
                onChange={(e) => setTutorForm({ ...tutorForm, meeting_link: e.target.value })}
                placeholder="https://zoom.us/j/..."
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save profile"}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
