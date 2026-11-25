"use client";

import { useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/password-input";
import { createClient } from "@/lib/supabase/client";

export default function TutorSetupPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch("/api/tutor-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        setSubmitting(false);
        return;
      }

      // Sign in with the new credentials
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: data.email,
        password,
      });

      if (signInError) {
        // Account created but sign-in failed — redirect to login
        router.push("/login");
        return;
      }

      // Redirect to tutor profile page to complete setup
      router.push("/profile");
    } catch {
      setError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex h-16 max-w-3xl items-center px-6">
          <Link href="/" className="text-lg font-bold tracking-tight">TutorApp</Link>
        </div>
      </header>

      <div className="mx-auto max-w-xl px-6 py-16">
        <div className="text-center space-y-4 mb-10">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-600"><path d="m5 12 5 5L20 7" /></svg>
          </div>
          <h1 className="text-3xl font-bold">Congratulations, You&apos;re Approved!</h1>
          <p className="text-muted-foreground max-w-md mx-auto">
            Welcome to the team! It&apos;s time to set up your tutor profile so you can start accepting students.
          </p>
        </div>

        <div className="rounded-xl border bg-muted/30 p-6 mb-8 space-y-3">
          <h2 className="font-semibold text-lg">Here&apos;s what you&apos;ll be able to do:</h2>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="text-primary font-bold mt-0.5">1.</span>
              <span><strong className="text-foreground">Set your rates</strong> — Choose your hourly rate and session durations.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary font-bold mt-0.5">2.</span>
              <span><strong className="text-foreground">Pick your subjects</strong> — Select the subjects and levels you want to teach.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary font-bold mt-0.5">3.</span>
              <span><strong className="text-foreground">Set your schedule</strong> — Define your weekly availability so students can book.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary font-bold mt-0.5">4.</span>
              <span><strong className="text-foreground">Complete your profile</strong> — Add a bio, credentials, and education to attract students.</span>
            </li>
          </ul>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <h2 className="font-semibold text-lg">Create your password to get started</h2>

          <div className="space-y-1.5">
            <Label htmlFor="password" required>Password</Label>
            <PasswordInput
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              required
              minLength={8}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirm_password" required>Confirm Password</Label>
            <PasswordInput
              id="confirm_password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter your password"
              required
            />
          </div>

          {error && (
            <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">{error}</p>
          )}

          <Button type="submit" className="w-full" size="md" disabled={submitting}>
            {submitting ? "Setting up your account..." : "Create Account & Start Setup"}
          </Button>
        </form>
      </div>
    </div>
  );
}
