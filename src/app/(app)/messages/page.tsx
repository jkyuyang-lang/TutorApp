import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default async function MessagesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("user_id", user.id)
    .single();
  if (!profile) redirect("/onboarding");

  const isTutor = profile.role === "tutor";

  // Get tutor ID if tutor
  let tutorId: string | null = null;
  if (isTutor) {
    const { data: tutor } = await supabase
      .from("tutors").select("id").eq("profile_id", profile.id).single();
    tutorId = tutor?.id ?? null;
  }

  // Fetch conversations
  const query = supabase
    .from("conversations")
    .select(`
      id, updated_at,
      tutors(profiles(full_name)),
      profiles:account_holder_id(full_name)
    `)
    .order("updated_at", { ascending: false });

  if (isTutor && tutorId) {
    query.eq("tutor_id", tutorId);
  } else {
    query.eq("account_holder_id", profile.id);
  }

  const { data: conversations } = await query;

  // Get unread counts per conversation
  const convosWithUnread = await Promise.all(
    (conversations ?? []).map(async (conv) => {
      const { count } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", conv.id)
        .neq("sender_id", profile.id)
        .is("read_at", null);

      // Get last message
      const { data: lastMsg } = await supabase
        .from("messages")
        .select("content, created_at, sender_id")
        .eq("conversation_id", conv.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      const otherName = isTutor
        ? (conv.profiles as unknown as { full_name: string })?.full_name
        : (conv.tutors as unknown as { profiles: { full_name: string } })?.profiles?.full_name;

      return {
        id: conv.id,
        otherName: otherName || "Unknown",
        unreadCount: count ?? 0,
        lastMessage: lastMsg?.content ?? null,
        lastMessageAt: lastMsg?.created_at ?? conv.updated_at,
        lastMessageIsMine: lastMsg?.sender_id === profile.id,
      };
    })
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Messages</h1>

      {convosWithUnread.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {isTutor
              ? "No conversations yet. They'll appear when clients message you."
              : "No conversations yet. Start a conversation with your tutor after booking a lesson."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {convosWithUnread.map((conv) => (
            <Link key={conv.id} href={`/messages/${conv.id}`}>
              <Card className={`transition-colors hover:bg-muted/50 ${conv.unreadCount > 0 ? "border-primary/30" : ""}`}>
                <CardContent className="flex items-center justify-between p-4">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={`font-medium ${conv.unreadCount > 0 ? "text-foreground" : ""}`}>
                        {conv.otherName}
                      </span>
                      {conv.unreadCount > 0 && (
                        <Badge>{conv.unreadCount}</Badge>
                      )}
                    </div>
                    {conv.lastMessage && (
                      <p className="truncate text-sm text-muted-foreground">
                        {conv.lastMessageIsMine ? "You: " : ""}
                        {conv.lastMessage}
                      </p>
                    )}
                  </div>
                  <span className="ml-4 shrink-0 text-xs text-muted-foreground">
                    {new Date(conv.lastMessageAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
