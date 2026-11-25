import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { notify } from "@/lib/notify";

/**
 * Called by the client after sending a message to trigger email notification.
 * POST { conversation_id, content }
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", user.id)
    .single();
  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 400 });
  }

  const { conversation_id, content } = await req.json();
  if (!conversation_id || !content) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  notify("new_message", {
    conversation_id,
    sender_profile_id: profile.id,
    content,
  });

  return NextResponse.json({ ok: true });
}
