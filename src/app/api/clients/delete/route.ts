import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

/**
 * DELETE /api/clients/delete
 * Fully removes client accounts. Tutor-only.
 * Body: { profile_ids: string[] }
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify caller is a tutor
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("user_id", user.id)
    .single();

  if (!profile || profile.role !== "tutor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { profile_ids } = await req.json();
  if (!Array.isArray(profile_ids) || profile_ids.length === 0) {
    return NextResponse.json({ error: "Missing profile_ids" }, { status: 400 });
  }

  const admin = createServiceClient();

  const errors: string[] = [];

  for (const profileId of profile_ids) {
    // Get the auth user_id for this profile
    const { data: clientProfile, error: profileError } = await admin
      .from("profiles")
      .select("user_id")
      .eq("id", profileId)
      .single();

    if (!clientProfile) {
      console.error(`[client-delete] No profile found for ${profileId}:`, profileError);
      errors.push(`Profile ${profileId} not found`);
      continue;
    }

    const authUserId = clientProfile.user_id;
    console.log(`[client-delete] Deleting profile ${profileId} (auth: ${authUserId})`);

    // Delete all related data
    await admin.from("lessons").delete().eq("booked_by", profileId);
    await admin.from("learners").delete().eq("account_holder_id", profileId);
    await admin.from("tutor_clients").delete().eq("account_holder_id", profileId);

    const { data: convos } = await admin
      .from("conversations")
      .select("id")
      .eq("account_holder_id", profileId);

    if (convos && convos.length > 0) {
      const convoIds = convos.map((c) => c.id);
      await admin.from("messages").delete().in("conversation_id", convoIds);
      await admin.from("conversations").delete().eq("account_holder_id", profileId);
    }

    await admin.from("payments").delete().eq("payer_id", profileId);

    // Delete profile row
    const { error: delProfileErr } = await admin.from("profiles").delete().eq("id", profileId);
    if (delProfileErr) {
      console.error(`[client-delete] Failed to delete profile ${profileId}:`, delProfileErr);
      errors.push(`Failed to delete profile: ${delProfileErr.message}`);
    }

    // Delete the auth user — this is the critical step
    const { error: delAuthErr } = await admin.auth.admin.deleteUser(authUserId);
    if (delAuthErr) {
      console.error(`[client-delete] Failed to delete auth user ${authUserId}:`, delAuthErr);
      errors.push(`Failed to delete auth user: ${delAuthErr.message}`);
    } else {
      console.log(`[client-delete] Successfully deleted auth user ${authUserId}`);
    }
  }

  if (errors.length > 0) {
    return NextResponse.json({ success: false, errors, deleted: profile_ids.length - errors.length }, { status: 207 });
  }

  return NextResponse.json({ success: true, deleted: profile_ids.length });
}
