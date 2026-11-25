import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { sendEmail, tutorApplicationReceivedEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const firstName = formData.get("first_name") as string;
    const lastName = formData.get("last_name") as string;
    const email = formData.get("email") as string;
    const phone = formData.get("phone") as string;
    const college = formData.get("college") as string;
    const degreeLevel = formData.get("degree_level") as string;
    const linkedinUrl = formData.get("linkedin_url") as string | null;
    const whyGoodFit = formData.get("why_good_fit") as string | null;
    const resume = formData.get("resume") as File | null;

    // Validate required fields
    if (!firstName || !lastName || !email || !phone || !college || !degreeLevel || !resume) {
      return NextResponse.json({ error: "All required fields must be filled" }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Upload resume
    const ext = resume.name.split(".").pop() || "pdf";
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("resumes")
      .upload(filename, resume, {
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ error: "Failed to upload resume" }, { status: 500 });
    }

    const { data: urlData } = supabase.storage
      .from("resumes")
      .getPublicUrl(filename);

    // Insert application
    const { error: insertError } = await supabase
      .from("tutor_applications")
      .insert({
        first_name: firstName,
        last_name: lastName,
        email,
        phone,
        college,
        degree_level: degreeLevel,
        resume_url: urlData.publicUrl,
        linkedin_url: linkedinUrl || null,
        why_good_fit: whyGoodFit || null,
      });

    if (insertError) {
      return NextResponse.json({ error: "Failed to submit application" }, { status: 500 });
    }

    // Send confirmation email
    const emailContent = tutorApplicationReceivedEmail({ firstName });
    await sendEmail({
      to: email,
      subject: emailContent.subject,
      html: emailContent.html,
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
