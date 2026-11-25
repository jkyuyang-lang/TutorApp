import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("site_content")
    .select("section_key, content");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const content: Record<string, unknown> = {};
  for (const row of data ?? []) {
    content[row.section_key] = row.content;
  }
  return NextResponse.json({ content });
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient();

  // Verify superadmin
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .single();

  if (profile?.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { section_key, content } = body;

  if (!section_key || content === undefined) {
    return NextResponse.json({ error: "section_key and content required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("site_content")
    .upsert(
      { section_key, content, updated_at: new Date().toISOString() },
      { onConflict: "section_key" }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
