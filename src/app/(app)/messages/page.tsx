import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { MessagesFilter } from "./messages-filter";
import { ConversationCard } from "./conversation-card";
import { EmptyState } from "@/components/empty-state";

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ tutor?: string }>;
}) {
  const { tutor: tutorFilterParam } = await searchParams;
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
  const isSuperadmin = profile.role === "superadmin";

  // Get tutor ID if tutor
  let tutorId: string | null = null;
  if (isTutor) {
    const { data: tutor } = await supabase
      .from("tutors").select("id").eq("profile_id", profile.id).single();
    tutorId = tutor?.id ?? null;
  }

  // For superadmin, load tutor list for filter
  let allTutors: { id: string; name: string }[] = [];
  if (isSuperadmin) {
    const { data: tutorsData } = await supabase
      .from("tutors")
      .select("id, profile_id, profiles(full_name)");
    if (tutorsData) {
      allTutors = tutorsData
        .filter((t) => t.profile_id !== profile.id)
        .map((t) => ({
          id: t.id,
          name: (t.profiles as unknown as { full_name: string })?.full_name ?? "Unknown",
        }));
      allTutors.sort((a, b) => a.name.localeCompare(b.name));
    }
  }

  // Fetch conversations
  const query = supabase
    .from("conversations")
    .select(`
      id, updated_at, account_holder_id,
      tutors(profile_id, profiles(full_name)),
      profiles:account_holder_id(full_name)
    `)
    .order("updated_at", { ascending: false });

  if (isSuperadmin) {
    if (tutorFilterParam && tutorFilterParam !== "all") {
      query.eq("tutor_id", tutorFilterParam);
    }
  } else if (isTutor && tutorId) {
    query.eq("tutor_id", tutorId);
  } else {
    query.eq("account_holder_id", profile.id);
  }

  const { data: conversations } = await query;

  // Get unread counts, total counts, and last message per conversation
  const convosWithDetails = await Promise.all(
    (conversations ?? []).map(async (conv) => {
      const [unreadRes, totalRes, lastMsgRes] = await Promise.all([
        supabase
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("conversation_id", conv.id)
          .neq("sender_id", profile.id)
          .is("read_at", null),
        supabase
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("conversation_id", conv.id),
        supabase
          .from("messages")
          .select("content, created_at, sender_id")
          .eq("conversation_id", conv.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .single(),
      ]);

      const clientName = (conv.profiles as unknown as { full_name: string })?.full_name;
      const tutorData = conv.tutors as unknown as { profile_id: string; profiles: { full_name: string } } | null;
      const tutorName = tutorData?.profiles?.full_name;

      const otherName = (isTutor || isSuperadmin)
        ? clientName
        : tutorName;

      return {
        id: conv.id,
        otherName: otherName || "Unknown",
        tutorName: tutorName || "Unknown",
        clientProfileId: conv.account_holder_id as string,
        tutorProfileId: tutorData?.profile_id ?? null,
        unreadCount: unreadRes.count ?? 0,
        totalCount: totalRes.count ?? 0,
        lastMessage: lastMsgRes.data?.content ?? null,
        lastMessageAt: lastMsgRes.data?.created_at ?? conv.updated_at,
        lastMessageIsMine: lastMsgRes.data?.sender_id === profile.id,
      };
    })
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Messages</h1>
        {isSuperadmin && allTutors.length > 0 && (
          <MessagesFilter tutors={allTutors} current={tutorFilterParam ?? "all"} />
        )}
      </div>

      {convosWithDetails.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              message={
                isTutor || isSuperadmin
                  ? "No conversations yet. They'll appear when clients message you."
                  : "No conversations yet. Start a conversation with your tutor after booking a lesson."
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {convosWithDetails.map((conv) => (
            <ConversationCard
              key={conv.id}
              id={conv.id}
              otherName={conv.otherName}
              tutorName={conv.tutorName}
              clientProfileId={conv.clientProfileId}
              tutorProfileId={conv.tutorProfileId}
              unreadCount={conv.unreadCount}
              totalCount={conv.totalCount}
              lastMessage={conv.lastMessage}
              lastMessageAt={conv.lastMessageAt}
              lastMessageIsMine={conv.lastMessageIsMine}
              isSuperadmin={isSuperadmin}
            />
          ))}
        </div>
      )}
    </div>
  );
}
