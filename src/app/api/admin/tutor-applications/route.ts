import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireSuperadmin } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/admin";
import { sendEmail, tutorApplicationStatusEmail } from "@/lib/email";

export async function GET() {
  const auth = await requireSuperadmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("tutor_applications")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ applications: data });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireSuperadmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id, status, admin_notes } = await req.json();

  if (!id || !status) {
    return NextResponse.json({ error: "id and status are required" }, { status: 400 });
  }

  if (!["pending", "approved", "needs_more_info", "denied", "onboarded"].includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Get current application to find email
  const { data: app } = await supabase
    .from("tutor_applications")
    .select("email, first_name, status, invite_token")
    .eq("id", id)
    .single();

  if (!app) return NextResponse.json({ error: "Application not found" }, { status: 404 });

  const updateData: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (admin_notes !== undefined) updateData.admin_notes = admin_notes;

  // Generate invite token on approval
  let inviteToken = app.invite_token;
  if (status === "approved" && !inviteToken) {
    inviteToken = randomBytes(32).toString("hex");
    updateData.invite_token = inviteToken;
  }

  const { error } = await supabase
    .from("tutor_applications")
    .update(updateData)
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Send status email if status changed and not pending
  if (status !== "pending" && status !== app.status) {
    const emailContent = tutorApplicationStatusEmail({
      firstName: app.first_name,
      status: status as "approved" | "needs_more_info" | "denied",
      inviteToken: status === "approved" ? inviteToken ?? undefined : undefined,
    });
    await sendEmail({
      to: app.email,
      subject: emailContent.subject,
      html: emailContent.html,
    });
  }

  return NextResponse.json({ success: true });
}
