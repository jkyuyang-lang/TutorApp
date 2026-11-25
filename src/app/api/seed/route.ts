import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";

/**
 * One-time seed endpoint. Creates a tutor account with sample data.
 * Visit /api/seed to run.
 * DELETE THIS FILE before going to production.
 */
export async function GET() {
  const supabase = createServiceClient();

  const TUTOR_EMAIL = "tutor@tutorapp.test";
  const TUTOR_PASSWORD = "TutorApp123!";

  // Check if tutor already seeded
  const { data: existingTutor } = await supabase
    .from("tutors")
    .select("id")
    .limit(1)
    .single();

  // Always ensure superadmin exists (even if tutor was seeded previously)
  const SUPERADMIN_EMAIL = "jkyuyang@gmail.com";
  const SUPERADMIN_PASSWORD = "12345678";

  // Apply the role constraint update (idempotent)
  // Check if superadmin already exists
  const { data: existingSA } = await supabase.auth.admin.listUsers();
  const saExists = existingSA?.users?.some((u) => u.email === SUPERADMIN_EMAIL);

  if (!saExists) {
    const { data: superadminAuth, error: saAuthErr } = await supabase.auth.admin.createUser({
      email: SUPERADMIN_EMAIL,
      password: SUPERADMIN_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: "JK Yang" },
    });

    if (saAuthErr) {
      return NextResponse.json({ error: `Superadmin auth: ${saAuthErr.message}` }, { status: 500 });
    }

    if (superadminAuth?.user) {
      const { data: saProfile, error: saProfileErr } = await supabase
        .from("profiles")
        .insert({
          user_id: superadminAuth.user.id,
          role: "superadmin",
          full_name: "JK Yang",
          time_zone: "America/Denver",
        })
        .select("id")
        .single();

      if (saProfileErr) {
        // Likely the role constraint hasn't been updated — clean up and return instructions
        await supabase.auth.admin.deleteUser(superadminAuth.user.id);
        return NextResponse.json({
          error: "Cannot create superadmin profile. Run this SQL in the Supabase Dashboard SQL Editor first:",
          sql: "ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check; ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('client', 'tutor', 'admin', 'superadmin'));",
        }, { status: 500 });
      }

      if (saProfile) {
        await supabase.from("tutors").insert({
          profile_id: saProfile.id,
          bio: "Platform administrator",
          buffer_minutes: 10,
          min_notice_hours: 12,
          booking_window_days: 60,
        });
      }
    }
  }

  if (existingTutor) {
    return NextResponse.json({
      message: "Tutor already seeded. Superadmin ensured.",
      accounts: {
        tutor: { email: TUTOR_EMAIL, password: TUTOR_PASSWORD },
        superadmin: { email: SUPERADMIN_EMAIL, password: SUPERADMIN_PASSWORD },
      },
    });
  }

  // 1. Create auth user (auto-confirmed)
  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email: TUTOR_EMAIL,
    password: TUTOR_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: "Sarah Johnson" },
  });

  if (authError) {
    return NextResponse.json({ error: `Auth: ${authError.message}` }, { status: 500 });
  }

  const userId = authUser.user.id;

  // 2. Create profile
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .insert({
      user_id: userId,
      role: "tutor",
      full_name: "Sarah Johnson",
      phone: "(555) 123-4567",
      time_zone: "America/New_York",
    })
    .select("id")
    .single();

  if (profileError) {
    return NextResponse.json({ error: `Profile: ${profileError.message}` }, { status: 500 });
  }

  // 3. Create tutor record
  const { data: tutor, error: tutorError } = await supabase
    .from("tutors")
    .insert({
      profile_id: profile.id,
      bio: "I'm a passionate math and science tutor with over 10 years of experience helping students succeed. I specialize in making complex concepts accessible and building confidence through personalized instruction. Whether you're preparing for a test or want to get ahead, I'm here to help!",
      credentials: "M.S. Mathematics, NYU · Certified Math Teacher · SAT/ACT Prep Specialist",
      years_experience: 12,
      meeting_link: "https://zoom.us/j/1234567890",
      buffer_minutes: 10,
      min_notice_hours: 12,
      booking_window_days: 60,
      max_lessons_per_day: 8,
      cancellation_policy: {
        full_refund_hours: 24,
        partial_refund_pct: 50,
        no_show_charge_pct: 100,
      },
    })
    .select("id")
    .single();

  if (tutorError) {
    return NextResponse.json({ error: `Tutor: ${tutorError.message}` }, { status: 500 });
  }

  // 4. Get subject IDs from the catalog
  const { data: subjects } = await supabase
    .from("subjects")
    .select("id, name")
    .in("name", [
      "Algebra",
      "Geometry",
      "Calculus",
      "Physics",
      "Chemistry",
      "SAT Math",
      "ACT Prep",
    ]);

  if (!subjects || subjects.length === 0) {
    return NextResponse.json({ error: "No subjects found. Run the seed migration first." }, { status: 500 });
  }

  // 5. Create tutor_subjects with pricing
  const tutorSubjects = subjects.map((s) => {
    const pricing: Record<string, Record<string, number>> = {
      "Algebra": { "30": 40, "60": 70, "90": 100 },
      "Geometry": { "30": 40, "60": 70, "90": 100 },
      "Calculus": { "60": 85, "90": 120 },
      "Physics": { "60": 80, "90": 110 },
      "Chemistry": { "60": 80, "90": 110 },
      "SAT Math": { "60": 90, "90": 130 },
      "ACT Prep": { "60": 90, "90": 130 },
    };
    const durations: Record<string, number[]> = {
      "Algebra": [30, 60, 90],
      "Geometry": [30, 60, 90],
      "Calculus": [60, 90],
      "Physics": [60, 90],
      "Chemistry": [60, 90],
      "SAT Math": [60, 90],
      "ACT Prep": [60, 90],
    };
    const levels: Record<string, string[]> = {
      "Algebra": ["Pre-Algebra", "Algebra 1", "Algebra 2", "College Algebra"],
      "Geometry": ["High School", "Honors"],
      "Calculus": ["AP Calculus AB", "AP Calculus BC", "College"],
      "Physics": ["Conceptual", "AP Physics 1", "AP Physics C"],
      "Chemistry": ["Honors", "AP Chemistry"],
      "SAT Math": ["SAT"],
      "ACT Prep": ["ACT"],
    };

    return {
      tutor_id: tutor.id,
      subject_id: s.id,
      levels: levels[s.name] || [],
      format: "online" as const,
      durations: durations[s.name] || [60],
      prices: pricing[s.name] || { "60": 75 },
      active: true,
    };
  });

  await supabase.from("tutor_subjects").insert(tutorSubjects);

  // 6. Create weekly availability (Mon-Fri 9am-5pm, Sat 10am-2pm)
  const availabilityRules = [
    { tutor_id: tutor.id, day_of_week: 1, start_time: "09:00", end_time: "12:00", format: "online" },
    { tutor_id: tutor.id, day_of_week: 1, start_time: "13:00", end_time: "17:00", format: "online" },
    { tutor_id: tutor.id, day_of_week: 2, start_time: "09:00", end_time: "12:00", format: "online" },
    { tutor_id: tutor.id, day_of_week: 2, start_time: "13:00", end_time: "17:00", format: "online" },
    { tutor_id: tutor.id, day_of_week: 3, start_time: "09:00", end_time: "12:00", format: "online" },
    { tutor_id: tutor.id, day_of_week: 3, start_time: "13:00", end_time: "17:00", format: "online" },
    { tutor_id: tutor.id, day_of_week: 4, start_time: "09:00", end_time: "12:00", format: "online" },
    { tutor_id: tutor.id, day_of_week: 4, start_time: "13:00", end_time: "17:00", format: "online" },
    { tutor_id: tutor.id, day_of_week: 5, start_time: "09:00", end_time: "12:00", format: "online" },
    { tutor_id: tutor.id, day_of_week: 5, start_time: "13:00", end_time: "17:00", format: "online" },
    { tutor_id: tutor.id, day_of_week: 6, start_time: "10:00", end_time: "14:00", format: "online" },
  ];

  await supabase.from("availability_rules").insert(availabilityRules);

  // 7. Create a sample student account too
  const STUDENT_EMAIL = "student@tutorapp.test";
  const STUDENT_PASSWORD = "Student123!";

  const { data: studentAuth } = await supabase.auth.admin.createUser({
    email: STUDENT_EMAIL,
    password: STUDENT_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: "Alex Chen" },
  });

  if (studentAuth?.user) {
    const { data: studentProfile } = await supabase
      .from("profiles")
      .insert({
        user_id: studentAuth.user.id,
        role: "client",
        full_name: "Alex Chen",
        time_zone: "America/New_York",
      })
      .select("id")
      .single();

    if (studentProfile) {
      await supabase.from("learners").insert({
        account_holder_id: studentProfile.id,
        is_self: true,
        full_name: "Alex Chen",
        grade_level: "11th grade",
      });
    }
  }

  // 8. Create a sample parent account with two kids
  const PARENT_EMAIL = "parent@tutorapp.test";
  const PARENT_PASSWORD = "Parent123!";

  const { data: parentAuth } = await supabase.auth.admin.createUser({
    email: PARENT_EMAIL,
    password: PARENT_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: "Maria Garcia" },
  });

  if (parentAuth?.user) {
    const { data: parentProfile } = await supabase
      .from("profiles")
      .insert({
        user_id: parentAuth.user.id,
        role: "client",
        full_name: "Maria Garcia",
        phone: "(555) 987-6543",
        time_zone: "America/New_York",
      })
      .select("id")
      .single();

    if (parentProfile) {
      await supabase.from("learners").insert([
        {
          account_holder_id: parentProfile.id,
          is_self: false,
          full_name: "Emma Garcia",
          grade_level: "9th grade",
          school: "Lincoln High School",
        },
        {
          account_holder_id: parentProfile.id,
          is_self: false,
          full_name: "Lucas Garcia",
          grade_level: "7th grade",
          school: "Jefferson Middle School",
        },
      ]);
    }
  }

  return NextResponse.json({
    message: "Seeded successfully!",
    accounts: {
      tutor: { email: TUTOR_EMAIL, password: TUTOR_PASSWORD, role: "Tutor / Admin" },
      student: { email: STUDENT_EMAIL, password: STUDENT_PASSWORD, role: "Client" },
      parent: { email: PARENT_EMAIL, password: PARENT_PASSWORD, role: "Client" },
      superadmin: { email: SUPERADMIN_EMAIL, password: SUPERADMIN_PASSWORD, role: "Superadmin" },
    },
    note: "Delete /api/seed before going to production.",
  });
}
