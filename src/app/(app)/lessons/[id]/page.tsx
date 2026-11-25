"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { lessonStatusColors as statusColors } from "@/lib/status-colors";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { LessonDetailsContent } from "@/components/lesson-details-content";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { MessageCircle, Paperclip, X } from "lucide-react";
import { LoadingPlaceholder } from "@/components/loading-placeholder";

interface Attachment {
  name: string;
  url: string;
  type: string;
}

interface ChatMessage {
  id: string;
  sender_id: string;
  content: string;
  attachments: Attachment[];
  created_at: string;
  read_at: string | null;
}

interface LessonNote {
  covered: string | null;
  homework: string | null;
  next_steps: string | null;
  status: string;
}

export default function LessonDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [profileId, setProfileId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState("");
  const [lesson, setLesson] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  // Chat state
  const [activeTab, setActiveTab] = useState("details");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatText, setChatText] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [chatAttachments, setChatAttachments] = useState<File[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadLesson = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("user_id", user.id)
      .single();

    if (!profile) { router.push("/onboarding"); return; }
    setProfileId(profile.id);
    setUserRole(profile.role);

    const { data: lessonData } = await supabase
      .from("lessons")
      .select(`
        *,
        subjects(name),
        learners(full_name),
        tutors(id, profile_id, meeting_link, profiles(full_name)),
        lesson_notes(covered, homework, next_steps, status),
        payments(amount_cents, status)
      `)
      .eq("id", id)
      .single();

    if (!lessonData) { router.push("/lessons"); return; }

    const isTutor = profile.role === "tutor";
    const isSuperadmin = profile.role === "superadmin";
    if (!isTutor && !isSuperadmin && lessonData.booked_by !== profile.id) {
      router.push("/lessons");
      return;
    }

    setLesson(lessonData as Record<string, unknown>);

    // Check unread count for this tutor
    const tutorId = (lessonData.tutors as { id: string })?.id;
    if (tutorId) {
      const { data: conv } = await supabase
        .from("conversations")
        .select("id")
        .eq("tutor_id", tutorId)
        .eq("account_holder_id", profile.id)
        .single();

      if (conv) {
        const { count } = await supabase
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("conversation_id", conv.id)
          .or(`lesson_id.eq.${id},lesson_id.is.null`)
          .neq("sender_id", profile.id)
          .is("read_at", null);
        setUnreadCount(count ?? 0);
      }
    }

    setLoading(false);
  }, [id, router]);

  useEffect(() => {
    loadLesson();
  }, [loadLesson]);

  async function loadChat() {
    if (!profileId || !lesson) return;
    setChatLoading(true);
    const supabase = createClient();
    const tutorId = (lesson.tutors as { id: string })?.id;
    if (!tutorId) { setChatLoading(false); return; }

    // Get or create conversation
    const { data: existing } = await supabase
      .from("conversations")
      .select("id")
      .eq("tutor_id", tutorId)
      .eq("account_holder_id", profileId)
      .single();

    let convId = existing?.id;
    if (!convId) {
      const { data: created } = await supabase
        .from("conversations")
        .insert({ tutor_id: tutorId, account_holder_id: profileId })
        .select("id")
        .single();
      convId = created?.id;
    }

    if (!convId) { setChatLoading(false); return; }
    setConversationId(convId);

    const { data: msgs } = await supabase
      .from("messages")
      .select("id, sender_id, content, attachments, created_at, read_at, lesson_id")
      .eq("conversation_id", convId)
      .or(`lesson_id.eq.${id},lesson_id.is.null`)
      .order("created_at", { ascending: true });

    setChatMessages((msgs ?? []).map((m) => ({
      ...m,
      attachments: (m.attachments as unknown as Attachment[]) ?? [],
    })));

    // Mark as read (both lesson-specific and general)
    await supabase
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .eq("conversation_id", convId)
      .or(`lesson_id.eq.${id},lesson_id.is.null`)
      .neq("sender_id", profileId)
      .is("read_at", null);

    setUnreadCount(0);
    setChatLoading(false);
  }

  // Realtime subscription
  useEffect(() => {
    if (!conversationId || !profileId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`lesson-chat:${conversationId}:${id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const newMsg = payload.new as ChatMessage & { lesson_id?: string | null };
          // Show messages for this lesson OR general (null lesson_id)
          if (newMsg.lesson_id !== null && newMsg.lesson_id !== id) return;
          setChatMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, { ...newMsg, attachments: (newMsg.attachments as unknown as Attachment[]) ?? [] }];
          });
          if (newMsg.sender_id !== profileId) {
            supabase.from("messages").update({ read_at: new Date().toISOString() }).eq("id", newMsg.id);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [conversationId, profileId, id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  async function handleChatSend() {
    if ((!chatText.trim() && chatAttachments.length === 0) || !conversationId || !profileId) return;
    setChatSending(true);
    const supabase = createClient();
    let attachmentData: Attachment[] = [];

    for (const file of chatAttachments) {
      const filePath = `${conversationId}/${Date.now()}-${file.name}`;
      const { error } = await supabase.storage.from("message-attachments").upload(filePath, file);
      if (!error) {
        const { data: urlData } = supabase.storage.from("message-attachments").getPublicUrl(filePath);
        attachmentData.push({ name: file.name, url: urlData.publicUrl, type: file.type });
      }
    }

    const { error } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender_id: profileId,
      content: chatText.trim() || (attachmentData.length > 0 ? `Sent ${attachmentData.length} attachment(s)` : ""),
      attachments: attachmentData.length > 0 ? attachmentData : [],
      lesson_id: id,
    });

    if (!error) {
      const sentContent = chatText.trim() || (attachmentData.length > 0 ? `Sent ${attachmentData.length} attachment(s)` : "");
      setChatText("");
      setChatAttachments([]);
      await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
      fetch("/api/messages/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: conversationId, content: sentContent }),
      }).catch(() => {});
    }
    setChatSending(false);
  }

  function handleChatKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleChatSend(); }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    setChatAttachments((prev) => [...prev, ...Array.from(e.target.files ?? [])]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  if (loading || !lesson) {
    return <LoadingPlaceholder />;
  }

  const start = new Date(lesson.starts_at as string);
  const end = new Date(lesson.ends_at as string);
  const now = new Date();
  const isUpcoming = start > now && !["canceled", "late_cancel"].includes(lesson.status as string);
  const meetingLink = (lesson.meeting_link as string) || (lesson.tutors as { meeting_link: string | null })?.meeting_link;
  const canJoin = isUpcoming && lesson.status === "confirmed" && start.getTime() - now.getTime() < 15 * 60 * 1000;
  const tutorData = lesson.tutors as { profile_id: string; profiles: { full_name: string } } | null;
  const tutorProfile = tutorData?.profiles;
  const rawNotes = lesson.lesson_notes;
  const notes = Array.isArray(rawNotes) ? rawNotes as LessonNote[] : rawNotes ? [rawNotes as LessonNote] : [];
  const payments = lesson.payments as { amount_cents: number; status: string }[] | null;
  const payment = payments?.[0];


  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Lesson Details</h1>
        <Badge
          className={statusColors[lesson.status as string] || ""}
          variant="secondary"
        >
          {(lesson.status as string).replace("_", " ")}
        </Badge>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(v) => {
          setActiveTab(v as string);
          if (v === "messages" && !conversationId) loadChat();
        }}
      >
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="messages" className="gap-1.5">
            <MessageCircle className="size-4" />
            Message Tutor
            {unreadCount > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">{unreadCount}</span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="details">
          <Card>
            <CardHeader>
              <CardTitle>{(lesson.subjects as { name: string })?.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <LessonDetailsContent
                learnerName={(lesson.learners as { full_name: string })?.full_name}
                tutorName={tutorProfile?.full_name}
                startsAt={lesson.starts_at as string}
                endsAt={lesson.ends_at as string}
                format={lesson.format as string}
                meetingLink={meetingLink}
                focusNotes={lesson.focus_notes as string | null}
                status={lesson.status as string}
                payment={payment}
                lessonNotes={notes}
              />
            </CardContent>
          </Card>

          {canJoin && meetingLink && (
            <Button className="w-full mt-4" size="md" render={<a href={meetingLink} target="_blank" rel="noopener noreferrer" />}>
              Join Lesson
            </Button>
          )}

          {isUpcoming && !canJoin && meetingLink && lesson.status === "confirmed" && (
            <Card className="mt-4">
              <CardContent className="py-4 text-center text-sm text-muted-foreground">
                Join button will appear 15 minutes before the lesson starts.
              </CardContent>
            </Card>
          )}

          <div className="flex gap-3 mt-4">
            <Button variant="outline" size="md" render={<Link href="/lessons" />}>
              Back to lessons
            </Button>
            {isUpcoming && lesson.status === "confirmed" && (
              <>
                <Button size="md" render={<Link href={`/lessons/${id}/reschedule`} />}>
                  Reschedule
                </Button>
                <Button variant="destructive" size="md" render={<Link href={`/lessons/${id}/cancel`} />}>
                  Cancel lesson
                </Button>
              </>
            )}
          </div>
        </TabsContent>

        <TabsContent value="messages" className="mt-4">
          <Card>
            <CardContent className="p-4 flex flex-col" style={{ height: "450px" }}>
              {chatLoading ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Loading messages...</p>
              ) : (
                <>
                  {/* Chat messages */}
                  <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
                    {chatMessages.length === 0 && (
                      <p className="text-center text-sm text-muted-foreground py-8">
                        No messages yet. Start the conversation with your tutor!
                      </p>
                    )}
                    {chatMessages.map((msg) => {
                      const isMine = msg.sender_id === profileId;
                      return (
                        <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                          <div
                            className={`max-w-[80%] rounded-2xl px-3 py-2 ${
                              isMine ? "bg-primary text-primary-foreground rounded-br-md" : "bg-card border border-border rounded-bl-md"
                            }`}
                          >
                            <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                            {msg.attachments && msg.attachments.length > 0 && (
                              <div className="mt-1 space-y-1">
                                {msg.attachments.map((att, i) => (
                                  <a
                                    key={i}
                                    href={att.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={`flex items-center gap-1 text-xs underline ${isMine ? "text-primary-foreground/80" : "text-primary"}`}
                                  >
                                    <Paperclip className="size-3" />
                                    {att.name}
                                  </a>
                                ))}
                              </div>
                            )}
                            <p className={`mt-1 text-[10px] ${isMine ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                              {new Date(msg.created_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={chatEndRef} />
                  </div>

                  {/* Attachment preview */}
                  {chatAttachments.length > 0 && (
                    <div className="flex flex-wrap gap-2 px-1 py-1 border-t">
                      {chatAttachments.map((file, i) => (
                        <div key={i} className="flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs">
                          <Paperclip className="size-3" />
                          <span className="max-w-[120px] truncate">{file.name}</span>
                          <button type="button" onClick={() => setChatAttachments((prev) => prev.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-foreground">
                            <X className="size-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Chat input */}
                  <div className="border-t pt-2 space-y-1">
                    <div className="flex gap-2">
                      <Button type="button" variant="ghost" size="sm" className="shrink-0 px-2" onClick={() => fileInputRef.current?.click()}>
                        <Paperclip className="size-4" />
                      </Button>
                      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} />
                      <Textarea
                        value={chatText}
                        onChange={(e) => setChatText(e.target.value)}
                        onKeyDown={handleChatKeyDown}
                        placeholder="Type a message..."
                        rows={1}
                        className="min-h-[36px] resize-none text-sm"
                      />
                      <Button
                        size="sm"
                        onClick={handleChatSend}
                        disabled={chatSending || (!chatText.trim() && chatAttachments.length === 0)}
                      >
                        Send
                      </Button>
                    </div>
                    <p className="text-[10px] text-muted-foreground">Enter to send, Shift+Enter for new line</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

