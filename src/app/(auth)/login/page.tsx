"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/password-input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/lessons";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // Check if user has a profile — if not, redirect to onboarding
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("user_id", currentUser!.id)
      .single();

    // Full page navigation to refresh the nav/layout with authenticated state
    if (!profile) {
      window.location.href = "/onboarding";
    } else if (profile.role === "tutor" || profile.role === "superadmin") {
      window.location.href = "/dashboard";
    } else {
      window.location.href = redirect;
    }
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle>Welcome back</CardTitle>
        <p className="text-sm text-muted-foreground">
          Log in to your tutoring account.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        {(searchParams.get("error") === "auth" || searchParams.get("error") === "verification") && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            There was a problem verifying your email. Please try again.
          </div>
        )}
        {searchParams.get("verified") === "true" && (
          <div className="rounded-md bg-green-500/10 p-3 text-sm text-green-700">
            Email verified successfully! Please log in.
          </div>
        )}
        {searchParams.get("message") === "password-reset" && (
          <div className="rounded-md bg-green-500/10 p-3 text-sm text-green-700">
            Password updated successfully. Please log in.
          </div>
        )}

        {/* Email login */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email" required>Email</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password" required>Password</Label>
              <Link
                href="/forgot-password"
                className="text-sm text-muted-foreground hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <PasswordInput
              id="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Logging in..." : "Log in"}
          </Button>
        </form>
      </CardContent>

      <CardFooter className="justify-center">
        <p className="text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="text-primary font-medium hover:underline">
            Sign up
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
