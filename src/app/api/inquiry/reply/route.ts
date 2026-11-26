import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, full_name")
    .eq("user_id", user.id)
    .single();

  if (!profile || !["tutor", "superadmin"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { inquiryId, replyMessage } = await req.json();
  if (!inquiryId || !replyMessage?.trim()) {
    return NextResponse.json({ error: "Missing inquiry ID or reply message" }, { status: 400 });
  }

  const admin = createServiceClient();

  // Fetch the inquiry
  const { data: inquiry } = await admin
    .from("inquiries")
    .select("*")
    .eq("id", inquiryId)
    .single();

  if (!inquiry) {
    return NextResponse.json({ error: "Inquiry not found" }, { status: 404 });
  }

  // Send reply email to the inquiry sender
  const senderName = profile.full_name || "TutorApp";

  await sendEmail({
    to: inquiry.email,
    subject: `Re: Your inquiry${inquiry.subject ? ` about ${inquiry.subject}` : ""}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #111; margin: 0 0 16px;">Reply from ${senderName}</h2>
        <p style="color: #333; font-size: 15px; line-height: 1.5;">
          Hi ${inquiry.name},
        </p>
        <div style="background: #f7f7f7; border-radius: 8px; padding: 16px; margin: 16px 0;">
          <p style="margin: 0; color: #333; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${replyMessage}</p>
        </div>
        <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 24px 0;" />
        <p style="color: #888; font-size: 12px;">
          This is a reply to your inquiry on TutorApp. You can reply directly to this email.
        </p>
        <div style="margin-top: 16px; padding: 12px; background: #fafafa; border-radius: 8px;">
          <p style="color: #999; font-size: 12px; margin: 0 0 4px;">Your original message:</p>
          <p style="color: #888; font-size: 13px; margin: 0; line-height: 1.4;">${inquiry.message}</p>
        </div>
      </div>
    `,
  });

  // Update inquiry status to "replied"
  await admin
    .from("inquiries")
    .update({ status: "replied" })
    .eq("id", inquiryId);

  return NextResponse.json({ ok: true });
}
