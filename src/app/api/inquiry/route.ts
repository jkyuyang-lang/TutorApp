import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export async function POST(req: Request) {
  const body = await req.json();
  const { tutor_id, name, email, learner_grade, subject, message } = body;

  if (!tutor_id || !name || !email || !message) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const admin = createServiceClient();

  // Insert inquiry
  const { error: insertError } = await admin.from("inquiries").insert({
    tutor_id,
    name,
    email,
    learner_grade: learner_grade || null,
    subject: subject || null,
    message,
  });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // Get tutor's profile to find their email, plus superadmin emails
  const { data: tutor } = await admin
    .from("tutors")
    .select("profile_id")
    .eq("id", tutor_id)
    .single();

  const emailRecipients: string[] = [];

  if (tutor) {
    // Get tutor's auth email
    const { data: tutorProfile } = await admin
      .from("profiles")
      .select("user_id, full_name")
      .eq("id", tutor.profile_id)
      .single();

    if (tutorProfile) {
      const { data: { user: tutorUser } } = await admin.auth.admin.getUserById(tutorProfile.user_id);
      if (tutorUser?.email) emailRecipients.push(tutorUser.email);
    }
  }

  // Also notify superadmins
  const { data: superadmins } = await admin
    .from("profiles")
    .select("user_id")
    .eq("role", "superadmin");

  for (const sa of superadmins ?? []) {
    const { data: { user: saUser } } = await admin.auth.admin.getUserById(sa.user_id);
    if (saUser?.email && !emailRecipients.includes(saUser.email)) {
      emailRecipients.push(saUser.email);
    }
  }

  // Send email notifications
  const subjectLine = subject ? ` about ${subject}` : "";
  const gradeInfo = learner_grade ? `<p style="margin: 4px 0; color: #333;"><strong>Grade:</strong> ${learner_grade}</p>` : "";

  for (const recipient of emailRecipients) {
    await sendEmail({
      to: recipient,
      subject: `New Inquiry from ${name}${subjectLine}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #111; margin: 0 0 16px;">New Inquiry</h2>
          <p style="color: #333; font-size: 15px; line-height: 1.5;">
            <strong>${name}</strong> (${email}) sent an inquiry:
          </p>
          <div style="background: #f7f7f7; border-radius: 8px; padding: 16px; margin: 16px 0;">
            <p style="margin: 4px 0; color: #333;"><strong>Name:</strong> ${name}</p>
            <p style="margin: 4px 0; color: #333;"><strong>Email:</strong> ${email}</p>
            ${subject ? `<p style="margin: 4px 0; color: #333;"><strong>Subject:</strong> ${subject}</p>` : ""}
            ${gradeInfo}
          </div>
          <div style="background: #f7f7f7; border-radius: 8px; padding: 16px; margin: 8px 0;">
            <p style="margin: 0; color: #555; font-size: 14px; line-height: 1.5; white-space: pre-wrap;">${message}</p>
          </div>
          <a href="${SITE_URL}/dashboard" style="display: inline-block; background: #111; color: #fff; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-size: 14px; font-weight: 500; margin-top: 8px;">View on Dashboard</a>
          <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 24px 0;" />
          <p style="color: #888; font-size: 12px;">
            You can reply directly to ${name} at <a href="mailto:${email}" style="color: #888;">${email}</a>.
          </p>
        </div>
      `,
    });
  }

  return NextResponse.json({ ok: true });
}
