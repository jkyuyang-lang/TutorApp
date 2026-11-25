"use client";

declare global {
  interface Window { __loggingOut?: boolean; }
}

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { User } from "@supabase/supabase-js";

interface Profile {
  id: string;
  role: string;
  full_name: string;
  avatar_url: string | null;
}

const clientLinks = [
  { href: "/lessons", label: "Lessons" },
  { href: "/messages", label: "Messages" },
  { href: "/progress", label: "Progress" },
];

const tutorLinks = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/tutor-lessons", label: "Lessons" },
  { href: "/clients", label: "Clients" },
  { href: "/messages", label: "Messages" },
  { href: "/inbox", label: "Inbox" },
];

const superadminLinks = [
  ...tutorLinks,
  { href: "/policies", label: "Policies" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/settings", label: "Admin" },
];

export function AppNav({ user, profile, transparent }: { user: User; profile: Profile | null; transparent?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);

  useEffect(() => {
    if (!transparent) return;
    function handleScroll() {
      setScrolled(window.scrollY > 10);
    }
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [transparent]);

  const links = profile?.role === "superadmin" ? superadminLinks : profile?.role === "tutor" ? tutorLinks : clientLinks;
  const initials = profile?.full_name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "?";
  const isTransparentTop = transparent && !scrolled;

  const loadUnread = useCallback(async () => {
    if (!profile) return;
    const supabase = createClient();

    // For tutors, find their tutor record to scope conversations
    // Superadmin sees all conversations
    let convos: { id: string }[] | null = null;
    if (profile.role === "superadmin") {
      const { data } = await supabase.from("conversations").select("id");
      convos = data;
    } else if (profile.role === "tutor") {
      const { data: tutor } = await supabase
        .from("tutors")
        .select("id")
        .eq("profile_id", profile.id)
        .single();
      if (tutor) {
        const { data } = await supabase.from("conversations").select("id").eq("tutor_id", tutor.id);
        convos = data;
      }
    } else {
      const { data } = await supabase.from("conversations").select("id").eq("account_holder_id", profile.id);
      convos = data;
    }

    if (!convos || convos.length === 0) { setUnreadMessages(0); return; }

    const convoIds = convos.map((c) => c.id);

    if (profile.role === "superadmin") {
      // Superadmin: count all unread messages (read_at is null) across all conversations.
      // Since read_at is shared between tutor/client, this shows messages
      // that neither participant has read yet.
      const { count } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .in("conversation_id", convoIds)
        .is("read_at", null);
      setUnreadMessages(count ?? 0);
    } else {
      const { count } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .in("conversation_id", convoIds)
        .neq("sender_id", profile.id)
        .is("read_at", null);
      setUnreadMessages(count ?? 0);
    }
  }, [profile]);

  useEffect(() => {
    loadUnread();
  }, [loadUnread]);

  // Realtime: listen for new messages and read receipts
  useEffect(() => {
    if (!profile) return;
    const supabase = createClient();

    const channel = supabase
      .channel("nav-unread")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        () => { loadUnread(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [profile, loadUnread]);

  // Detect account deletion: heartbeat + visibility check + auth state change
  useEffect(() => {
    if (!profile) return;
    const supabase = createClient();

    async function checkAuth() {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) {
        forceLogout();
      }
    }

    // Realtime: if our profile row is deleted, force logout
    const channel = supabase
      .channel("nav-profile-watch")
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "profiles", filter: `id=eq.${profile.id}` },
        () => { forceLogout(); }
      )
      .subscribe();

    // Listen for auth state changes (token refresh failure = deleted user)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "TOKEN_REFRESHED") {
        // TOKEN_REFRESHED with no session means user was deleted
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (!session) forceLogout();
        });
      }
    });

    // Check when tab becomes visible (not on a timer — realtime handles the rest)
    function handleVisibility() {
      if (document.visibilityState === "visible") {
        checkAuth();
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      supabase.removeChannel(channel);
      subscription.unsubscribe();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [profile]);

  function forceLogout() {
    if (window.__loggingOut) return;
    window.__loggingOut = true;
    window.location.href = "/login";
  }

  async function handleLogout() {
    if (window.__loggingOut) return;
    window.__loggingOut = true;
    const supabase = createClient();
    try {
      await Promise.race([
        supabase.auth.signOut(),
        new Promise((resolve) => setTimeout(resolve, 2000)),
      ]);
    } catch {
      // Ignore errors — we're logging out regardless
    }
    window.location.href = "/login";
  }

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        transparent && !scrolled
          ? "bg-transparent border-b border-transparent"
          : "border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
      }`}
    >
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-6">
          <Link href={profile?.role === "tutor" || profile?.role === "superadmin" ? "/dashboard" : "/"} className={`font-semibold transition-colors ${isTransparentTop ? "text-white" : ""}`}>
            TutorApp
          </Link>
          <nav className="hidden gap-4 sm:flex">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`relative text-sm transition-colors ${
                  isTransparentTop
                    ? pathname.startsWith(link.href)
                      ? "text-white font-medium"
                      : "text-white/70 hover:text-white"
                    : pathname.startsWith(link.href)
                      ? "text-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {link.label}
                {link.href === "/messages" && unreadMessages > 0 && (
                  <span className="absolute -top-2 -right-4 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                    {unreadMessages > 99 ? "99+" : unreadMessages}
                  </span>
                )}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className={`relative ${isTransparentTop ? "text-white hover:bg-white/10 hover:text-white" : ""}`} render={<Link href="/notifications" />}>
            <BellIcon />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger openOnHover delay={0} render={<button type="button" className={`group flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring ${isTransparentTop ? "text-white" : ""}`} />}>
              <Avatar className="h-7 w-7">
                <AvatarFallback className={`text-xs transition-colors ${isTransparentTop ? "bg-white/20 text-white group-hover:bg-white/30" : "bg-primary text-primary-foreground group-hover:bg-primary/80"}`}>{initials}</AvatarFallback>
              </Avatar>
              <span className={`hidden text-sm sm:inline transition-colors ${isTransparentTop ? "text-white/80 group-hover:text-white" : "text-muted-foreground group-hover:text-foreground"}`}>{profile?.full_name ? `${profile.full_name.split(" ")[0]} ${profile.full_name.split(" ").slice(1).map((n) => n[0]).join("").toUpperCase()}.` : ""}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="px-1.5 py-1">
                <p className="text-sm font-medium truncate">{profile?.full_name}</p>
                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
              </div>
              {(profile?.role === "tutor" || profile?.role === "superadmin") && (
                <DropdownMenuItem onClick={() => router.push("/profile")}>
                  Edit Profile
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => router.push("/settings")}>
                Settings
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push("/billing")}>
                Billing
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleLogout}>Log out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Mobile nav */}
      <nav className={`flex gap-1 overflow-x-auto px-4 sm:hidden ${isTransparentTop ? "border-t border-white/10" : "border-t"}`}>
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`relative whitespace-nowrap px-3 py-2 text-sm transition-colors ${
              isTransparentTop
                ? pathname.startsWith(link.href)
                  ? "border-b-2 border-white text-white font-medium"
                  : "text-white/70"
                : pathname.startsWith(link.href)
                  ? "border-b-2 border-primary text-foreground font-medium"
                  : "text-muted-foreground"
            }`}
          >
            {link.label}
            {link.href === "/messages" && unreadMessages > 0 && (
              <span className="absolute -top-0.5 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                {unreadMessages > 99 ? "99+" : unreadMessages}
              </span>
            )}
          </Link>
        ))}
      </nav>
    </header>
  );
}

function BellIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}
