"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const DEGREE_LEVELS = [
  "Associate's",
  "Bachelor's",
  "Master's",
  "Doctorate / PhD",
  "Professional (JD, MD, etc.)",
];

export default function ApplyPage() {
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [degreeLevel, setDegreeLevel] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const form = e.currentTarget;
    const formData = new FormData(form);
    formData.set("degree_level", degreeLevel);

    // Validate
    if (!degreeLevel) {
      setError("Please select your level of degree.");
      setSubmitting(false);
      return;
    }

    const resume = formData.get("resume") as File;
    if (!resume || resume.size === 0) {
      setError("Please upload your resume.");
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetch("/api/apply", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Something went wrong. Please try again.");
        setSubmitting(false);
        return;
      }

      setSubmitted(true);
    } catch {
      setError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b">
          <div className="mx-auto flex h-16 max-w-3xl items-center px-6">
            <Link href="/" className="text-lg font-bold tracking-tight">TutorApp</Link>
          </div>
        </header>
        <div className="mx-auto max-w-xl px-6 py-20 text-center space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-600"><path d="m5 12 5 5L20 7" /></svg>
          </div>
          <h1 className="text-2xl font-bold">Application Submitted!</h1>
          <p className="text-muted-foreground">
            Thank you for your interest in joining our tutoring team. We&apos;ve sent a confirmation to your email. Someone from our team will be in touch soon.
          </p>
          <Button render={<Link href="/" />}>Back to Home</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex h-16 max-w-3xl items-center px-6">
          <Link href="/" className="text-lg font-bold tracking-tight">TutorApp</Link>
        </div>
      </header>

      <div className="mx-auto max-w-xl px-6 py-12">
        <div className="space-y-2 mb-8">
          <h1 className="text-3xl font-bold">Apply to Become a Tutor</h1>
          <p className="text-muted-foreground">
            Join our team of expert tutors. Fill out the form below and we&apos;ll review your application.
          </p>
        </div>

        <form ref={formRef} onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="first_name" required>First Name</Label>
              <Input id="first_name" name="first_name" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="last_name" required>Last Name</Label>
              <Input id="last_name" name="last_name" required />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email" required>Email</Label>
            <Input id="email" name="email" type="email" required />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="phone" required>Phone Number</Label>
            <Input id="phone" name="phone" type="tel" required />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="college" required>College / University</Label>
            <Input id="college" name="college" required />
          </div>

          <div className="space-y-1.5">
            <Label required>Level of Degree</Label>
            <Select value={degreeLevel} onValueChange={(v) => setDegreeLevel(v ?? "")}>
              <SelectTrigger>
                <SelectValue placeholder="Select degree level" />
              </SelectTrigger>
              <SelectContent>
                {DEGREE_LEVELS.map((level) => (
                  <SelectItem key={level} value={level}>{level}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="resume" required>Resume</Label>
            <div className="relative">
              <Input
                id="resume"
                name="resume"
                type="file"
                accept=".pdf,.doc,.docx"
                required
                onChange={(e) => setFileName(e.target.files?.[0]?.name || null)}
                className="cursor-pointer"
              />
              {fileName && (
                <p className="text-xs text-muted-foreground mt-1">{fileName}</p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="linkedin_url">LinkedIn Profile URL</Label>
            <Input id="linkedin_url" name="linkedin_url" type="url" placeholder="https://linkedin.com/in/..." />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="why_good_fit">Why would you be a good fit? (optional)</Label>
            <Textarea id="why_good_fit" name="why_good_fit" rows={4} placeholder="Tell us about your teaching experience, areas of expertise, and what makes you a great tutor..." />
          </div>

          {error && (
            <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">{error}</p>
          )}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Submitting..." : "Submit Application"}
          </Button>
        </form>
      </div>
    </div>
  );
}
