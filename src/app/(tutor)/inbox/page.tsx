"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { TabBar } from "@/components/tab-bar";
import { EmptyState } from "@/components/empty-state";

interface InquiryMessage {
  id: string;
  inquiry_id: string;
  sender_type: "inquirer" | "tutor";
  sender_name: string;
  content: string;
  created_at: string;
}

interface Inquiry {
  id: string;
  name: string;
  email: string;
  learner_grade: string | null;
  subject: string | null;
  message: string;
  status: string;
  created_at: string;
  messages?: InquiryMessage[];
}

export default function InboxPage() {
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [activeTab, setActiveTab] = useState("active");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [expandedThread, setExpandedThread] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from("profiles").select("id, role").eq("user_id", user.id).single();
    if (!profile) return;

    // Superadmins see all inquiries, tutors see their own
    let query = supabase
      .from("inquiries")
      .select("*")
      .order("created_at", { ascending: false });

    if (profile.role === "tutor") {
      const { data: tutor } = await supabase
        .from("tutors").select("id").eq("profile_id", profile.id).single();
      if (!tutor) return;
      query = query.eq("tutor_id", tutor.id);
    }

    const { data } = await query;
    const inquiryList: Inquiry[] = data ?? [];

    // Fetch messages for all inquiries
    if (inquiryList.length > 0) {
      const ids = inquiryList.map((i) => i.id);
      const { data: messages } = await supabase
        .from("inquiry_messages")
        .select("*")
        .in("inquiry_id", ids)
        .order("created_at", { ascending: true });

      const msgsByInquiry = new Map<string, InquiryMessage[]>();
      for (const msg of messages ?? []) {
        const list = msgsByInquiry.get(msg.inquiry_id) ?? [];
        list.push(msg as InquiryMessage);
        msgsByInquiry.set(msg.inquiry_id, list);
      }
      for (const inq of inquiryList) {
        inq.messages = msgsByInquiry.get(inq.id) ?? [];
      }
    }

    setInquiries(inquiryList);
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

  async function deleteInquiry(id: string) {
    setDeleting(id);
    const supabase = createClient();
    await supabase.from("inquiries").delete().eq("id", id);
    setDeleting(null);
    await loadData();
  }

  async function sendReply(inquiryId: string) {
    if (!replyText.trim()) return;
    setSending(true);
    const res = await fetch("/api/inquiry/reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inquiryId, replyMessage: replyText }),
    });
    setSending(false);
    if (res.ok) {
      setReplyingTo(null);
      setReplyText("");
      await loadData();
    }
  }

  const activeInquiries = inquiries.filter((i) => i.status !== "archived");
  const archivedInquiries = inquiries.filter((i) => i.status === "archived");
  const displayList = activeTab === "active" ? activeInquiries : archivedInquiries;

  const tabs = [
    { key: "active", label: "Active", count: activeInquiries.length },
    { key: "archived", label: "Archived", count: archivedInquiries.length },
  ];

  if (loading) {
    return <p className="py-12 text-center text-muted-foreground">Loading...</p>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Inbox & Inquiries</h1>

      <TabBar tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {displayList.length === 0 ? (
        <EmptyState
          message={activeTab === "active"
            ? "No active inquiries. They'll appear here when visitors submit the contact form."
            : "No archived inquiries."
          }
        />
      ) : (
        <div className="space-y-3">
          {displayList.map((inq) => (
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
                {/* Show latest message or full thread */}
                {inq.messages && inq.messages.length > 1 && expandedThread !== inq.id ? (
                  <>
                    <p className="text-sm">{inq.messages[inq.messages.length - 1].content}</p>
                    <button
                      className="text-xs text-primary hover:underline"
                      onClick={() => setExpandedThread(inq.id)}
                    >
                      View full thread ({inq.messages.length} messages)
                    </button>
                  </>
                ) : inq.messages && inq.messages.length > 1 ? (
                  <div className="space-y-2">
                    {inq.messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`rounded-md p-3 text-sm ${
                          msg.sender_type === "inquirer"
                            ? "bg-blue-50"
                            : "bg-muted/50"
                        }`}
                      >
                        <p className="text-xs text-muted-foreground mb-1">
                          <span className="font-medium">
                            {msg.sender_name}
                            {msg.sender_type === "tutor" && " (Tutor)"}
                          </span>
                          {" · "}
                          {new Date(msg.created_at).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </p>
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      </div>
                    ))}
                    <button
                      className="text-xs text-muted-foreground hover:underline"
                      onClick={() => setExpandedThread(null)}
                    >
                      Collapse thread
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="text-sm">{inq.message}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(inq.created_at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>
                  </>
                )}

                {activeTab === "active" ? (
                  replyingTo === inq.id ? (
                    <div className="space-y-2 pt-2">
                      <Textarea
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        placeholder={`Reply to ${inq.name}...`}
                        rows={4}
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          disabled={sending || !replyText.trim()}
                          onClick={() => sendReply(inq.id)}
                        >
                          {sending ? "Sending..." : "Send Reply"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { setReplyingTo(null); setReplyText(""); }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2 pt-2">
                      <Button
                        size="sm"
                        onClick={() => { setReplyingTo(inq.id); setReplyText(""); }}
                      >
                        Reply
                      </Button>
                      {inq.status === "new" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => updateStatus(inq.id, "replied")}
                        >
                          Mark replied
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateStatus(inq.id, "archived")}
                      >
                        Archive
                      </Button>
                    </div>
                  )
                ) : (
                  <div className="flex gap-2 pt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => updateStatus(inq.id, "new")}
                    >
                      Restore
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={deleting === inq.id}
                      onClick={() => deleteInquiry(inq.id)}
                    >
                      {deleting === inq.id ? "Deleting..." : "Delete permanently"}
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
