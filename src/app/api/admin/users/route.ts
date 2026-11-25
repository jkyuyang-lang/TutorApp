import { NextRequest, NextResponse } from "next/server";
import { requireSuperadmin } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/admin";

// GET /api/admin/users — list users with search, filter, sort
export async function GET(req: NextRequest) {
  const auth = await requireSuperadmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = createServiceClient();
  const url = req.nextUrl;
  const search = url.searchParams.get("search") || "";
  const role = url.searchParams.get("role") || "";
  const sortBy = url.searchParams.get("sort") || "created_at";
  const order = url.searchParams.get("order") === "asc" ? true : false;
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = 25;
  const offset = (page - 1) * limit;

  let query = supabase
    .from("profiles")
    .select("id, user_id, role, full_name, phone, time_zone, created_at, updated_at", { count: "exact" });

  if (role) {
    query = query.eq("role", role);
  }

  if (search) {
    query = query.or(`full_name.ilike.%${search}%,phone.ilike.%${search}%`);
  }

  const validSorts = ["full_name", "role", "created_at", "updated_at"];
  const sortCol = validSorts.includes(sortBy) ? sortBy : "created_at";
  query = query.order(sortCol, { ascending: order });
  query = query.range(offset, offset + limit - 1);

  const { data: profiles, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Fetch emails from auth.users for each profile
  const userIds = (profiles || []).map((p) => p.user_id);
  const usersWithEmail: Record<string, string> = {};
  for (const uid of userIds) {
    const { data } = await supabase.auth.admin.getUserById(uid);
    if (data?.user) {
      usersWithEmail[uid] = data.user.email || "";
    }
  }

  // For client roles, fetch lesson counts and CLV
  const profileIds = (profiles || []).map((p) => p.id);
  const lessonStats: Record<string, { lesson_count: number; clv_cents: number }> = {};

  if (profileIds.length > 0) {
    // Get lesson counts via booked_by
    const { data: lessons } = await supabase
      .from("lessons")
      .select("booked_by, status")
      .in("booked_by", profileIds)
      .not("status", "eq", "held");

    // Get payment totals
    const { data: payments } = await supabase
      .from("payments")
      .select("payer_id, amount_cents, status")
      .in("payer_id", profileIds)
      .eq("status", "succeeded");

    for (const pid of profileIds) {
      const userLessons = (lessons || []).filter((l) => l.booked_by === pid);
      const userPayments = (payments || []).filter((p) => p.payer_id === pid);
      lessonStats[pid] = {
        lesson_count: userLessons.length,
        clv_cents: userPayments.reduce((sum, p) => sum + p.amount_cents, 0),
      };
    }
  }

  const users = (profiles || []).map((p) => ({
    ...p,
    email: usersWithEmail[p.user_id] || "",
    lesson_count: lessonStats[p.id]?.lesson_count ?? 0,
    clv_cents: lessonStats[p.id]?.clv_cents ?? 0,
  }));

  return NextResponse.json({ users, total: count || 0, page, limit });
}

// POST /api/admin/users — create a new user
export async function POST(req: NextRequest) {
  const auth = await requireSuperadmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { email, password, full_name, role, phone, time_zone } = body;

  if (!email || !password || !full_name || !role) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const validRoles = ["client", "tutor", "admin", "superadmin"];
  if (!validRoles.includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Create auth user
  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name },
  });

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 400 });
  }

  // Create profile
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .insert({
      user_id: authUser.user.id,
      role,
      full_name,
      phone: phone || null,
      time_zone: time_zone || "America/New_York",
    })
    .select("id")
    .single();

  if (profileError) {
    // Rollback auth user
    await supabase.auth.admin.deleteUser(authUser.user.id);
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  // If tutor or superadmin, create tutor record
  if (role === "tutor" || role === "superadmin") {
    await supabase.from("tutors").insert({
      profile_id: profile.id,
      buffer_minutes: 10,
      min_notice_hours: 12,
      booking_window_days: 60,
    });
  }


  return NextResponse.json({ success: true, profile_id: profile.id });
}

// PUT /api/admin/users — update user
export async function PUT(req: NextRequest) {
  const auth = await requireSuperadmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { profile_id, full_name, role, phone, time_zone, password } = body;

  if (!profile_id) {
    return NextResponse.json({ error: "profile_id required" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Get the profile to find user_id
  const { data: existing } = await supabase
    .from("profiles")
    .select("user_id, role")
    .eq("id", profile_id)
    .single();

  if (!existing) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Update profile fields
  const updates: Record<string, unknown> = {};
  if (full_name) updates.full_name = full_name;
  if (role) updates.role = role;
  if (phone !== undefined) updates.phone = phone || null;
  if (time_zone) updates.time_zone = time_zone;

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", profile_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  // If role changed to tutor/superadmin, ensure tutor record exists
  if (role && (role === "tutor" || role === "superadmin") && existing.role !== "tutor" && existing.role !== "superadmin") {
    const { data: existingTutor } = await supabase
      .from("tutors")
      .select("id")
      .eq("profile_id", profile_id)
      .single();

    if (!existingTutor) {
      await supabase.from("tutors").insert({
        profile_id,
        buffer_minutes: 10,
        min_notice_hours: 12,
        booking_window_days: 60,
      });
    }
  }

  // Update password if provided
  if (password) {
    const { error } = await supabase.auth.admin.updateUserById(existing.user_id, { password });
    if (error) {
      return NextResponse.json({ error: `Password update failed: ${error.message}` }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}

// DELETE /api/admin/users — delete user
export async function DELETE(req: NextRequest) {
  const auth = await requireSuperadmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { profile_id } = await req.json();

  if (!profile_id) {
    return NextResponse.json({ error: "profile_id required" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Get user_id
  const { data: profile } = await supabase
    .from("profiles")
    .select("user_id, role")
    .eq("id", profile_id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Prevent deleting yourself
  if (profile.user_id === auth.user.id) {
    return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 });
  }

  // Clean up records that reference profiles without ON DELETE CASCADE
  // Delete messages sent by this user
  await supabase.from("messages").delete().eq("sender_id", profile_id);
  // Delete payments for this user
  await supabase.from("payments").delete().eq("payer_id", profile_id);
  // Nullify canceled_by references (nullable column)
  await supabase.from("lessons").update({ canceled_by: null }).eq("canceled_by", profile_id);
  // Delete lessons booked by this user (cascades to lesson_notes, etc.)
  await supabase.from("lessons").delete().eq("booked_by", profile_id);

  // Delete auth user (cascades to profile via FK)
  const { error } = await supabase.auth.admin.deleteUser(profile.user_id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
