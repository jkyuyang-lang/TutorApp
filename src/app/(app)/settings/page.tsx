"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CardContent } from "@/components/ui/card";
import { CollapsibleCard } from "@/components/collapsible-card";
import { LoadingPlaceholder } from "@/components/loading-placeholder";
import { ManageLearners } from "@/components/manage-learners";
import { ProfileForm } from "@/components/profile-form";
import { ChangePasswordForm } from "@/components/change-password-form";

export default function SettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    async function loadProfile() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      const { data } = await supabase
        .from("profiles")
        .select("id, role")
        .eq("user_id", user.id)
        .single();

      if (data) {
        setProfileId(data.id);
        setRole(data.role);
      }
      setLoading(false);
    }
    loadProfile();
  }, [router]);

  if (loading || !profileId) {
    return <LoadingPlaceholder />;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>
      <ProfileForm profileId={profileId} />
      {role !== "tutor" && (
        <CollapsibleCard title="Learners" description="Manage your learners.">
          <CardContent>
            <ManageLearners profileId={profileId} />
          </CardContent>
        </CollapsibleCard>
      )}
      <ChangePasswordForm />
    </div>
  );
}
