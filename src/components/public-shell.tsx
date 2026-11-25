import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { AppNav } from "@/components/app-nav";
import { Button } from "@/components/ui/button";

export async function PublicShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createServiceClient();

  // Get tutor name for branding
  const { data: tutor } = await supabase
    .from("tutors")
    .select("profile_id")
    .limit(1)
    .single();

  let tutorName = "TutorApp";
  if (tutor) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", tutor.profile_id)
      .single();
    if (profile) tutorName = profile.full_name;
  }

  // Check auth
  const authSupabase = await createClient();
  const { data: { user } } = await authSupabase.auth.getUser();
  let authProfile = null;
  if (user) {
    const { data } = await authSupabase
      .from("profiles")
      .select("id, role, full_name, avatar_url")
      .eq("user_id", user.id)
      .single();
    authProfile = data;
  }

  return (
    <div className="flex min-h-screen flex-col">
      {user && authProfile ? (
        <AppNav user={user} profile={authProfile} />
      ) : (
        <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
            <Link href="/" className="text-lg font-bold tracking-tight">TutorApp</Link>
            <nav className="hidden items-center gap-6 sm:flex">
              <Link href="/#hero-search" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Find a Tutor</Link>
              <Link href="/#faq" className="text-sm text-muted-foreground hover:text-foreground transition-colors">How Lessons Work</Link>
              <Link href="/#faq" className="text-sm text-muted-foreground hover:text-foreground transition-colors">FAQs</Link>
              <Link href="/apply" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Become a Tutor</Link>
              <Link href="/#about" className="text-sm text-muted-foreground hover:text-foreground transition-colors">About Us</Link>
            </nav>
            <div className="flex items-center gap-3">
              <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Log in</Link>
              <Button size="sm" render={<Link href="/signup" />}>Sign up</Button>
            </div>
          </div>
        </header>
      )}

      <main className="flex-1">
        {children}
      </main>

      <footer className="bg-navy-900 text-gold-100">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="grid gap-10 sm:grid-cols-3">
            <div>
              <span className="text-lg font-bold text-white">{tutorName} Tutoring</span>
              <p className="mt-3 text-sm text-gold-100/50 leading-relaxed">
                Personalized one-on-one tutoring to help students build confidence and achieve their goals.
              </p>
            </div>
            <div>
              <p className="fh-label text-gold-400 mb-4">Navigate</p>
              <div className="space-y-2 text-sm">
                <Link href="/#hero-search" className="block text-gold-100/60 hover:text-white transition-colors">Find a Tutor</Link>
                <Link href="/#faq" className="block text-gold-100/60 hover:text-white transition-colors">How Lessons Work</Link>
                <Link href="/#faq" className="block text-gold-100/60 hover:text-white transition-colors">FAQs</Link>
                <Link href="/apply" className="block text-gold-100/60 hover:text-white transition-colors">Become a Tutor</Link>
                <Link href="/#about" className="block text-gold-100/60 hover:text-white transition-colors">About Us</Link>
              </div>
            </div>
            <div>
              <p className="fh-label text-gold-400 mb-4">Get started</p>
              <div className="space-y-2 text-sm">
                <Link href="/signup" className="block text-gold-100/60 hover:text-white transition-colors">Create account</Link>
                <Link href="/login" className="block text-gold-100/60 hover:text-white transition-colors">Log in</Link>
                <Link href="/inquiry" className="block text-gold-100/60 hover:text-white transition-colors">Send inquiry</Link>
              </div>
            </div>
          </div>
          <div className="mt-12 border-t border-white/10 pt-8 text-center text-xs text-gold-100/40">
            &copy; {new Date().getFullYear()} {tutorName} Tutoring. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
