"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface Inquiry {
  id: string;
  name: string;
  email: string;
  learner_grade: string | null;
  subject: string | null;
  message: string;
  status: string;
  created_at: string;
}

export default function InboxPage() {
  const [tutorId, setTutorId] = useState<string | null>(null);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from("profiles").select("id").eq("user_id", user.id).single();
    if (!profile) return;

    const { data: tutor } = await supabase
      .from("tutors").select("id").eq("profile_id", profile.id).single();
    if (!tutor) return;

    setTutorId(tutor.id);

    const { data } = await supabase
      .from("inquiries")
      .select("*")
      .eq("tutor_id", tutor.id)
      .order("created_at", { ascending: false });

    setInquiries(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function updateStatus(id: string, status: string) {
    const supabase = createClient();
    await supabase.from("inquiries").update({ status }).eq("id", id);
    await loadData();
  }

  if (loading) {
    return <p className="py-12 text-center text-muted-foreground">Loading...</p>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Inbox & Inquiries</h1>

      {inquiries.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No inquiries yet. They&apos;ll appear here when visitors submit the contact form.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {inquiries.map((inq) => (
            <Card key={inq.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{inq.name}</CardTitle>
                  <Badge
                    variant={inq.status === "new" ? "default" : "secondary"}
                  >
                    {inq.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm text-muted-foreground">{inq.email}</p>
                {(inq.subject || inq.learner_grade) && (
                  <p className="text-sm text-muted-foreground">
                    {inq.subject && <>Subject: {inq.subject}</>}
                    {inq.subject && inq.learner_grade && " · "}
                    {inq.learner_grade && <>Grade: {inq.learner_grade}</>}
                  </p>
                )}
                <p className="text-sm">{inq.message}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(inq.created_at).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
                {inq.status === "new" && (
                  <div className="flex gap-2 pt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => updateStatus(inq.id, "replied")}
                    >
                      Mark replied
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => updateStatus(inq.id, "closed")}
                    >
                      Close
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
