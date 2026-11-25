import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  // Public routes that don't require auth
  const publicRoutes = ["/", "/login", "/signup", "/forgot-password", "/inquiry", "/auth/callback", "/auth/confirm", "/book"];
  const isPublicRoute = publicRoutes.some(
    (route) => path === route || path.startsWith("/auth/") || path.startsWith("/book") || path.startsWith("/tutor/") || path.startsWith("/browse") || path.startsWith("/apply") || path.startsWith("/tutor-setup")
  );

  // API routes are handled separately
  if (path.startsWith("/api/")) {
    return supabaseResponse;
  }

  const isEmailVerified = !!user?.email_confirmed_at;

  // Treat unverified users the same as unauthenticated for protected routes
  if ((!user || !isEmailVerified) && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", path);
    return NextResponse.redirect(url);
  }

  // Redirect verified users away from auth pages (only if they have a profile)
  if (user && isEmailVerified && (path === "/login" || path === "/signup")) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("user_id", user.id)
      .single();

    // No profile = let them through to auth pages (they may need to log in as a different user)
    if (profile) {
      const url = request.nextUrl.clone();
      if (profile.role === "tutor" || profile.role === "superadmin") {
        url.pathname = "/dashboard";
      } else {
        url.pathname = "/lessons";
      }
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
