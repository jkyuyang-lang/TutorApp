"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { lessonStatusColors as statusColors } from "@/lib/status-colors";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { LessonDetailsContent } from "@/components/lesson-details-content";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MessageCircle, Paperclip, X } from "lucide-react";

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

interface LessonDetailModalProps {
  lessonId: string | null;
  onClose: () => void;
}


export function LessonDetailModal({ lessonId, onClose }: LessonDetailModalProps) {
  const router = useRouter();
  const [profileId, setProfileId] = useState<string | null>(null);
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
    if (!lessonId) return;
    setLoading(true);
    setActiveTab("details");
    setChatMessages([]);
    setConversationId(null);
    setUnreadCount(0);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("user_id", user.id)
      .single();
    if (!profile) return;
    setProfileId(profile.id);

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
      .eq("id", lessonId)
      .single();

    if (!lessonData) { setLoading(false); return; }
    setLesson(lessonData as Record<string, unknown>);

    // Check unread count
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
          .or(`lesson_id.eq.${lessonId},lesson_id.is.null`)
          .neq("sender_id", profile.id)
          .is("read_at", null);
        setUnreadCount(count ?? 0);
      }
    }

    setLoading(false);
  }, [lessonId]);

  useEffect(() => {
    if (lessonId) loadLesson();
  }, [lessonId, loadLesson]);

  async function loadChat() {
    if (!profileId || !lesson || !lessonId) return;
    setChatLoading(true);
    const supabase = createClient();
    const tutorId = (lesson.tutors as { id: string })?.id;
    if (!tutorId) { setChatLoading(false); return; }

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
      .or(`lesson_id.eq.${lessonId},lesson_id.is.null`)
      .order("created_at", { ascending: true });

    setChatMessages((msgs ?? []).map((m) => ({
      ...m,
      attachments: (m.attachments as unknown as Attachment[]) ?? [],
    })));

    await supabase
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .eq("conversation_id", convId)
      .or(`lesson_id.eq.${lessonId},lesson_id.is.null`)
      .neq("sender_id", profileId)
      .is("read_at", null);

    setUnreadCount(0);
    setChatLoading(false);
  }

  // Realtime subscription
  useEffect(() => {
    if (!conversationId || !profileId || !lessonId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`modal-chat:${conversationId}:${lessonId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const newMsg = payload.new as ChatMessage & { lesson_id?: string | null };
          if (newMsg.lesson_id !== null && newMsg.lesson_id !== lessonId) return;
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
  }, [conversationId, profileId, lessonId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  async function handleChatSend() {
    if ((!chatText.trim() && chatAttachments.length === 0) || !conversationId || !profileId) return;
    setChatSending(true);
    const supabase = createClient();
    const attachmentData: Attachment[] = [];

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
      lesson_id: lessonId,
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

  if (!lessonId) return null;

  const renderContent = () => {
    if (loading || !lesson) {
      return <p className="py-12 text-center text-sm text-muted-foreground">Loading...</p>;
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
    const publishedNote = notes.find((n) => n.status === "published");
    const payments = lesson.payments as { amount_cents: number; status: string }[] | null;
    const payment = payments?.[0];

    return (
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
          <div className="space-y-3 py-2">
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

            {canJoin && meetingLink && (
              <Button className="w-full mt-2" size="md" render={<a href={meetingLink} target="_blank" rel="noopener noreferrer" />}>
                Join Lesson
              </Button>
            )}

            {isUpcoming && !canJoin && meetingLink && lesson.status === "confirmed" && (
              <p className="text-center text-xs text-muted-foreground py-2">
                Join button will appear 15 minutes before the lesson starts.
              </p>
            )}

            {isUpcoming && lesson.status === "confirmed" && (
              <div className="flex gap-3 pt-2">
                <Button size="sm" onClick={() => { onClose(); router.push(`/lessons/${lessonId}/reschedule`); }}>
                  Reschedule
                </Button>
                <Button variant="destructive" size="sm" onClick={() => { onClose(); router.push(`/lessons/${lessonId}/cancel`); }}>
                  Cancel lesson
                </Button>
              </div>
            )}

            {["completed", "canceled", "late_cancel", "no_show"].includes(lesson.status as string) && (
              <Button className="w-full mt-2" variant="outline" onClick={() => { onClose(); router.push(`/book?tutor_id=${lesson.tutor_id}`); }}>
                Book Another Lesson
              </Button>
            )}
          </div>
        </TabsContent>

        <TabsContent value="messages" className="mt-2">
          <div className="flex flex-col" style={{ height: "400px" }}>
            {chatLoading ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Loading messages...</p>
            ) : (
              <>
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
                            isMine ? "bg-primary text-primary-foreground rounded-br-md" : "bg-muted rounded-bl-md"
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
          </div>
        </TabsContent>
      </Tabs>
    );
  };

  return (
    <Dialog open={!!lessonId} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between pr-6">
            <DialogTitle>
              {lesson ? (lesson.subjects as { name: string })?.name ?? "Lesson Details" : "Lesson Details"}
            </DialogTitle>
            {lesson && (
              <Badge variant="secondary" className={statusColors[lesson.status as string] || ""}>
                {(lesson.status as string).replace("_", " ")}
              </Badge>
            )}
          </div>
        </DialogHeader>
        {renderContent()}
      </DialogContent>
    </Dialog>
  );
}

