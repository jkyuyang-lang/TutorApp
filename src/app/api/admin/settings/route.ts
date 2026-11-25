import { NextRequest, NextResponse } from "next/server";
import { requireSuperadmin } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/admin";

// GET /api/admin/settings
export async function GET() {
  const auth = await requireSuperadmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = createServiceClient();
  const { data, error } = await supabase.from("app_settings").select("*");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const settings: Record<string, unknown> = {};
  for (const row of data || []) {
    settings[row.key] = row.value;
  }

  // Check if Zoom Server-to-Server OAuth env vars are configured
  const zoomApiConfigured = !!(
    process.env.ZOOM_ACCOUNT_ID &&
    process.env.ZOOM_CLIENT_ID &&
    process.env.ZOOM_CLIENT_SECRET
  );

  return NextResponse.json({ settings, zoom_api_configured: zoomApiConfigured });
}

// PUT /api/admin/settings
export async function PUT(req: NextRequest) {
  const auth = await requireSuperadmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { key, value } = await req.json();

  if (!key || value === undefined) {
    return NextResponse.json({ error: "key and value required" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("app_settings")
    .upsert({
      key,
      value: typeof value === "object" ? value : JSON.parse(JSON.stringify(value)),
      updated_by: auth.profile.id,
    });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
