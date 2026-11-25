"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { MessageCircle } from "lucide-react";

interface ConversationCardProps {
  id: string;
  otherName: string;
  tutorName: string;
  clientProfileId: string | null;
  tutorProfileId: string | null;
  unreadCount: number;
  totalCount: number;
  lastMessage: string | null;
  lastMessageAt: string;
  lastMessageIsMine: boolean;
  isSuperadmin: boolean;
}

export function ConversationCard(props: ConversationCardProps) {
  const router = useRouter();
  const {
    id, otherName, tutorName, clientProfileId, tutorProfileId,
    unreadCount, totalCount, lastMessage, lastMessageAt, lastMessageIsMine,
    isSuperadmin,
  } = props;

  return (
    <Card
      className={`transition-colors hover:bg-muted/50 cursor-pointer ${unreadCount > 0 ? "border-primary/30" : ""}`}
      onClick={() => router.push(`/messages/${id}`)}
    >
      <CardContent className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="relative shrink-0">
            <MessageCircle className={`size-6 ${unreadCount > 0 ? "text-primary" : "text-muted-foreground/50"}`} />
            {unreadCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                {unreadCount}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-2">
              {isSuperadmin && clientProfileId ? (
                <Link
                  href={`/admin/users/${clientProfileId}`}
                  className={`font-medium text-primary underline-offset-2 hover:underline ${unreadCount > 0 ? "" : ""}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  {otherName}
                </Link>
              ) : (
                <span className={`font-medium ${unreadCount > 0 ? "text-foreground" : ""}`}>
                  {otherName}
                </span>
              )}
              {isSuperadmin && (
                <span className="text-xs text-muted-foreground">
                  ·{" "}
                  {tutorProfileId ? (
                    <Link
                      href={`/admin/users/${tutorProfileId}`}
                      className="text-primary underline-offset-2 hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {tutorName}
                    </Link>
                  ) : tutorName}
                </span>
              )}
              <span className="text-xs text-muted-foreground">
                {totalCount} {totalCount === 1 ? "message" : "messages"}
              </span>
            </div>
            {lastMessage && (
              <p className="truncate text-sm text-muted-foreground">
                {lastMessageIsMine ? "You: " : ""}
                {lastMessage}
              </p>
            )}
          </div>
        </div>
        <div className="ml-4 shrink-0 flex flex-col items-end gap-1">
          <span className="text-xs text-muted-foreground">
            {new Date(lastMessageAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
          </span>
          {unreadCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] font-bold text-destructive-foreground">
              {unreadCount}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
