import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Get or create a conversation between the current user and a tutor.
 * POST { tutor_id }
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { tutor_id } = await req.json();
  if (!tutor_id) {
    return NextResponse.json({ error: "Missing tutor_id" }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("profiles").select("id").eq("user_id", user.id).single();
  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 400 });
  }

  // Check for existing conversation
  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("tutor_id", tutor_id)
    .eq("account_holder_id", profile.id)
    .single();

  if (existing) {
    return NextResponse.json({ conversation_id: existing.id });
  }

  // Create new conversation
  const { data: conv, error } = await supabase
    .from("conversations")
    .insert({ tutor_id, account_holder_id: profile.id })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ conversation_id: conv.id });
}
