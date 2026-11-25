import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";

// POST /api/auth/send-verification — generate OTP and send via our own SMTP
export async function POST(req: NextRequest) {
  const { email, password, full_name } = await req.json();

  if (!email) {
    return NextResponse.json({ error: "Email required" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Generate a signup confirmation link (also returns the OTP token)
  const linkOptions: { type: "signup"; email: string; password: string; options?: { data: Record<string, string> } } = {
    type: "signup",
    email,
    password: password || "placeholder-not-used",
  };
  if (full_name) {
    linkOptions.options = { data: { full_name } };
  }
  const { data, error } = await supabase.auth.admin.generateLink(linkOptions);

  if (error) {
    console.error("[send-verification] generateLink error:", error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const otp = data.properties?.email_otp;
  if (!otp) {
    return NextResponse.json({ error: "Could not generate verification code" }, { status: 500 });
  }

  // Send via our own SMTP
  const result = await sendEmail({
    to: email,
    subject: "Your TutorApp verification code",
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #111; margin: 0 0 16px;">Verify your email</h2>
        <p style="color: #333; font-size: 15px;">Your verification code is:</p>
        <h1 style="letter-spacing: 0.3em; font-size: 32px; text-align: center; padding: 16px; background: #f4f4f5; border-radius: 8px; color: #111;">${otp}</h1>
        <p style="color: #888; font-size: 13px;">This code expires in 1 hour.</p>
      </div>
    `,
  });

  if (!result) {
    return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
