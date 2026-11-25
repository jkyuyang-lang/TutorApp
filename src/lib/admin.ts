import { createClient } from "@/lib/supabase/server";

/**
 * Verify the current user is a superadmin. Returns profile or null.
 */
export async function requireSuperadmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, full_name")
    .eq("user_id", user.id)
    .single();

  if (!profile || profile.role !== "superadmin") return null;

  return { user, profile, supabase };
}
