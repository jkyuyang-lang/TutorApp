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

  // Fetch existing conversation thread
  const { data: thread } = await admin
    .from("inquiry_messages")
    .select("*")
    .eq("inquiry_id", inquiryId)
    .order("created_at", { ascending: true });

  const senderName = profile.full_name || "TutorApp";

  // Store the reply in inquiry_messages
  await admin.from("inquiry_messages").insert({
    inquiry_id: inquiryId,
    sender_type: "tutor",
    sender_name: senderName,
    content: replyMessage,
  });

  // Build conversation history HTML for the email
  const historyHtml = (thread ?? [])
    .map((msg) => {
      const isInquirer = msg.sender_type === "inquirer";
      const label = isInquirer ? msg.sender_name : `${msg.sender_name} (Tutor)`;
      const date = new Date(msg.created_at).toLocaleDateString(undefined, {
        month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
      });
      return `
        <div style="padding: 10px 12px; margin-bottom: 8px; border-radius: 8px; background: ${isInquirer ? "#f0f4ff" : "#f7f7f7"};">
          <p style="margin: 0 0 4px; font-size: 12px; color: #888;"><strong>${label}</strong> · ${date}</p>
          <p style="margin: 0; font-size: 14px; line-height: 1.5; color: #333; white-space: pre-wrap;">${msg.content}</p>
        </div>
      `;
    })
    .join("");

  // Send reply email with full conversation trail
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
        <p style="color: #888; font-size: 13px; font-weight: 600; margin-bottom: 8px;">Conversation history</p>
        ${historyHtml}
        <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 24px 0;" />
        <p style="color: #888; font-size: 12px;">
          This is a reply to your inquiry on TutorApp. You can reply directly to this email.
        </p>
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
