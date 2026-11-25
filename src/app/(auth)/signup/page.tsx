"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/password-input";
import { formatPhone } from "@/lib/phone";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function SignUpPage() {
  const router = useRouter();
  const searchParams = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const redirectTo = searchParams.get("redirect") || "";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);
  const [otpDigits, setOtpDigits] = useState<string[]>(Array(8).fill(""));
  const [verifying, setVerifying] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const otpCode = otpDigits.join("");

  const handleOtpChange = useCallback((index: number, value: string) => {
    // Handle paste of full code
    if (value.length > 1) {
      const digits = value.replace(/\D/g, "").slice(0, 8).split("");
      const newDigits = [...otpDigits];
      digits.forEach((d, i) => {
        if (index + i < 8) newDigits[index + i] = d;
      });
      setOtpDigits(newDigits);
      const nextIndex = Math.min(index + digits.length, 7);
      inputRefs.current[nextIndex]?.focus();
      return;
    }

    // Single digit
    const digit = value.replace(/\D/g, "");
    const newDigits = [...otpDigits];
    newDigits[index] = digit;
    setOtpDigits(newDigits);

    if (digit && index < 7) {
      inputRefs.current[index + 1]?.focus();
    }
  }, [otpDigits]);

  const handleOtpKeyDown = useCallback((index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !otpDigits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }, [otpDigits]);

  const handleOtpPaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 8);
    if (pasted) {
      const digits = pasted.split("");
      const newDigits = Array(8).fill("");
      digits.forEach((d, i) => { newDigits[i] = d; });
      setOtpDigits(newDigits);
      const nextIndex = Math.min(digits.length, 7);
      inputRefs.current[nextIndex]?.focus();
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: `${firstName.trim()} ${lastName.trim()}`,
          phone: phone || null,
        },
      },
    });

    if (error) {
      // Ignore email sending errors — we'll send it ourselves
      if (!error.message.toLowerCase().includes("sending confirmation")) {
        setError(error.message);
        setLoading(false);
        return;
      }
    }

    // If auto-confirmed (no email verification required), go straight to lessons
    if (data?.session) {
      window.location.href = redirectTo || "/lessons";
      return;
    }

    // Send verification email via our own SMTP
    try {
      const res = await fetch("/api/auth/send-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, full_name: `${firstName.trim()} ${lastName.trim()}` }),
      });
      const result = await res.json();
      if (!res.ok) {
        setError(result.error || "Failed to send verification email");
        setLoading(false);
        return;
      }
    } catch {
      setError("Failed to send verification email");
      setLoading(false);
      return;
    }

    setCheckEmail(true);
    setLoading(false);
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setVerifying(true);

    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: otpCode.trim(),
      type: "signup",
    });

    if (error) {
      setError(error.message);
      setVerifying(false);
      return;
    }

    // Full page navigation to refresh the nav/layout with authenticated state
    // Profile will be auto-created by ensure-profile API
    window.location.href = redirectTo || "/lessons";
  }

  async function handleResendCode() {
    setError(null);
    try {
      const res = await fetch("/api/auth/send-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const result = await res.json();
      if (!res.ok) {
        setError(result.error || "Failed to resend code");
      }
    } catch {
      setError("Failed to resend code");
    }
  }

  if (checkEmail) {
    return (
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Verify your email</CardTitle>
          <p className="text-sm text-muted-foreground">
            We sent a verification code to <strong>{email}</strong>. Enter the code below to activate your account.
          </p>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive mb-4">
              {error}
            </div>
          )}
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div className="flex items-center justify-center gap-3">
              <Label required className="shrink-0">Verification code</Label>
              <div className="flex gap-2" onPaste={handleOtpPaste}>
                {otpDigits.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => { inputRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    autoComplete={i === 0 ? "one-time-code" : "off"}
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(i, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(i, e)}
                    className="h-12 w-10 rounded-lg border border-input bg-white text-center text-lg font-semibold focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 outline-none transition-colors"
                    autoFocus={i === 0}
                  />
                ))}
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={verifying || otpCode.length < 8}>
              {verifying ? "Verifying..." : "Verify"}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center">
          <p className="text-sm text-muted-foreground">
            Didn&apos;t receive the code?{" "}
            <button
              type="button"
              onClick={handleResendCode}
              className="text-primary font-medium hover:underline"
            >
              Resend
            </button>
          </p>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">
          Welcome!
          <br />
          Create a free account to get started.
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="text-primary font-medium hover:underline">
            Log in
          </Link>
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Email signup */}
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="firstName" required>First name</Label>
                <Input
                  id="firstName"
                  type="text"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Jane"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName" required>Last name</Label>
                <Input
                  id="lastName"
                  type="text"
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Smith"
                />
              </div>
            </div>
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
              <Label htmlFor="password" required>Password</Label>
              <PasswordInput
                id="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 8 characters"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password" required>Confirm Password</Label>
              <PasswordInput
                id="confirm-password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm your password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone number (optional)</Label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(formatPhone(e.target.value))}
                placeholder="404-333-5554"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Creating account..." : "Create account"}
            </Button>
          </form>
      </CardContent>

      <CardFooter className="justify-center">
        <p className="text-sm text-muted-foreground">
          Interested in becoming a tutor?{" "}
          <Link href="/apply" className="text-primary font-medium hover:underline">
            Apply today
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}

