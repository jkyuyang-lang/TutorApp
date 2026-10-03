"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function InquiryPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [learnerGrade, setLearnerGrade] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [tutorId, setTutorId] = useState<string | null>(null);

  useEffect(() => {
    async function getTutor() {
      const supabase = createClient();
      const { data } = await supabase
        .from("tutors")
        .select("id")
        .limit(1)
        .single();
      if (data) setTutorId(data.id);
    }
    getTutor();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tutorId) return;
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.from("inquiries").insert({
      tutor_id: tutorId,
      name,
      email,
      learner_grade: learnerGrade || null,
      subject: subject || null,
      message,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setSent(true);
    setLoading(false);
  }

  if (sent) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Message sent!</CardTitle>
          <CardDescription>
            Thanks for reaching out. The tutor will get back to you by email.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Link href="/" className="text-sm text-muted-foreground hover:underline">
            Back to profile
          </Link>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ask a question</CardTitle>
        <CardDescription>
          Send a message before signing up. No account needed.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Your name</Label>
              <Input
                id="name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="grade">Learner&apos;s grade (optional)</Label>
              <Input
                id="grade"
                value={learnerGrade}
                onChange={(e) => setLearnerGrade(e.target.value)}
                placeholder="e.g., 10th grade"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="subject">Subject (optional)</Label>
              <Input
                id="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g., Algebra"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="message">Message</Label>
            <Textarea
              id="message"
              required
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              placeholder="Tell us what you're looking for..."
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button type="submit" className="w-full" disabled={loading || !tutorId}>
            {loading ? "Sending..." : "Send message"}
          </Button>
          <Link href="/" className="text-sm text-muted-foreground hover:underline">
            Back to profile
          </Link>
        </CardFooter>
      </form>
    </Card>
  );
}
