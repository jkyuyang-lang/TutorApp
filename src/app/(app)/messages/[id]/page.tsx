"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Paperclip, X } from "lucide-react";

interface Attachment {
  name: string;
  url: string;
  type: string;
}

interface Message {
  id: string;
  sender_id: string;
  content: string;
  attachments: Attachment[];
  created_at: string;
  read_at: string | null;
}

export default function ConversationPage() {
  const params = useParams();
  const conversationId = params.id as string;
  const router = useRouter();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [profileId, setProfileId] = useState("");
  const [userRole, setUserRole] = useState("");
  const [otherName, setOtherName] = useState("");
  const [otherProfileId, setOtherProfileId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [attachments, setAttachments] = useState<File[]>([]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const loadData = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from("profiles").select("id, role").eq("user_id", user.id).single();
    if (!profile) return;
    setProfileId(profile.id);
    setUserRole(profile.role);

    // Get conversation details
    const { data: conv } = await supabase
      .from("conversations")
      .select("id, account_holder_id, tutors(profile_id, profiles(full_name)), profiles:account_holder_id(full_name)")
      .eq("id", conversationId)
      .single();

    if (!conv) {
      router.push("/messages");
      return;
    }

    const isTutor = profile.role === "tutor" || profile.role === "superadmin";
    const tutorData = conv.tutors as unknown as { profile_id: string; profiles: { full_name: string } } | null;
    const clientName = (conv.profiles as unknown as { full_name: string })?.full_name;
    const tutorName = tutorData?.profiles?.full_name;
    const name = isTutor ? clientName : tutorName;
    setOtherName(name || "Unknown");

    // Set the other person's profile ID for linking
    if (profile.role === "superadmin") {
      setOtherProfileId(conv.account_holder_id as string);
    } else if (profile.role === "tutor") {
      setOtherProfileId(conv.account_holder_id as string);
    } else {
      setOtherProfileId(tutorData?.profile_id ?? null);
    }

    // Fetch messages
    const { data: msgs } = await supabase
      .from("messages")
      .select("id, sender_id, content, attachments, created_at, read_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    setMessages(
      (msgs ?? []).map((m) => ({
        ...m,
        attachments: (m.attachments as unknown as Attachment[]) ?? [],
      }))
    );

    // Mark unread messages as read (skip for superadmin so tutor/client read status is preserved)
    if (profile.role !== "superadmin") {
      await supabase
        .from("messages")
        .update({ read_at: new Date().toISOString() })
        .eq("conversation_id", conversationId)
        .neq("sender_id", profile.id)
        .is("read_at", null);
    }

    setLoading(false);
  }, [conversationId, router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Subscribe to realtime messages
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const newMsg = payload.new as Message;
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, { ...newMsg, attachments: (newMsg.attachments as unknown as Attachment[]) ?? [] }];
          });

          // Mark as read if not ours (skip for superadmin)
          if (newMsg.sender_id !== profileId && userRole !== "superadmin") {
            supabase
              .from("messages")
              .update({ read_at: new Date().toISOString() })
              .eq("id", newMsg.id);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, profileId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  async function handleSend() {
    if (!newMessage.trim() && attachments.length === 0) return;
    setSending(true);

    const supabase = createClient();
    let attachmentData: Attachment[] = [];

    // Upload attachments
    if (attachments.length > 0) {
      for (const file of attachments) {
        const filePath = `${conversationId}/${Date.now()}-${file.name}`;
        const { error } = await supabase.storage
          .from("message-attachments")
          .upload(filePath, file);

        if (!error) {
          const { data: urlData } = supabase.storage
            .from("message-attachments")
            .getPublicUrl(filePath);

          attachmentData.push({
            name: file.name,
            url: urlData.publicUrl,
            type: file.type,
          });
        }
      }
    }

    const { error } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender_id: profileId,
      content: newMessage.trim() || (attachmentData.length > 0 ? `Sent ${attachmentData.length} attachment(s)` : ""),
      attachments: attachmentData.length > 0 ? attachmentData : [],
    });

    if (!error) {
      const sentContent = newMessage.trim() || (attachmentData.length > 0 ? `Sent ${attachmentData.length} attachment(s)` : "");
      setNewMessage("");
      setAttachments([]);
      // Update conversation timestamp
      await supabase
        .from("conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", conversationId);
      // Email notification (fire-and-forget)
      fetch("/api/messages/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: conversationId, content: sentContent }),
      }).catch(() => {});
    }

    setSending(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    setAttachments((prev) => [...prev, ...files]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeAttachment(index: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }

  if (loading) {
    return <p className="py-12 text-center text-muted-foreground">Loading...</p>;
  }

  return (
    <div className="flex flex-col rounded-xl bg-white p-4 ring-1 ring-foreground/10" style={{ height: "calc(100vh - 10rem)" }}>
      {/* Header */}
      <div className="flex items-center gap-3 border-b pb-3">
        <Button variant="ghost" size="sm" onClick={() => router.push("/messages")}>
          &larr;
        </Button>
        {userRole === "superadmin" && otherProfileId ? (
          <Link href={`/admin/users/${otherProfileId}`} className="text-lg font-semibold text-primary underline-offset-2 hover:underline">
            {otherName}
          </Link>
        ) : (
          <h1 className="text-lg font-semibold">{otherName}</h1>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">
            No messages yet. Start the conversation!
          </p>
        )}
        {messages.map((msg) => {
          const isMine = msg.sender_id === profileId;
          return (
            <div
              key={msg.id}
              className={`flex ${isMine ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-2 ${
                  isMine
                    ? "bg-primary text-primary-foreground rounded-br-md"
                    : "bg-white border border-border rounded-bl-md"
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
                        className={`flex items-center gap-1 text-xs underline ${
                          isMine ? "text-primary-foreground/80" : "text-primary"
                        }`}
                      >
                        <Paperclip className="size-3" />
                        {att.name}
                      </a>
                    ))}
                  </div>
                )}
                <p
                  className={`mt-1 text-xs ${
                    isMine ? "text-primary-foreground/60" : "text-muted-foreground"
                  }`}
                >
                  {new Date(msg.created_at).toLocaleTimeString(undefined, {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Attachment preview */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 px-1 py-2 border-t">
          {attachments.map((file, i) => (
            <div key={i} className="flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs">
              <Paperclip className="size-3" />
              <span className="max-w-[150px] truncate">{file.name}</span>
              <button type="button" onClick={() => removeAttachment(i)} className="text-muted-foreground hover:text-foreground">
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="border-t pt-3">
        <div className="flex gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0 px-2"
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip className="size-4" />
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileSelect}
          />
          <Textarea
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            rows={1}
            className="min-h-[40px] resize-none"
          />
          <Button
            onClick={handleSend}
            disabled={sending || (!newMessage.trim() && attachments.length === 0)}
          >
            Send
          </Button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
