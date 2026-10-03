"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
  read: boolean;
  created_at: string;
}

export default function NotificationsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    setNotifications(data ?? []);
    setLoading(false);

    // Mark all as read
    if (data && data.some((n) => !n.read)) {
      await supabase
        .from("notifications")
        .update({ read: true })
        .eq("user_id", user.id)
        .eq("read", false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Subscribe to new notifications
  useEffect(() => {
    const supabase = createClient();
    let userId: string | null = null;

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      userId = user.id;

      const channel = supabase
        .channel("notifications")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            const n = payload.new as Notification;
            setNotifications((prev) => [n, ...prev]);
            // Auto-mark as read since we're on the page
            supabase
              .from("notifications")
              .update({ read: true })
              .eq("id", n.id);
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    });
  }, []);

  function handleClick(notification: Notification) {
    const data = notification.data as Record<string, string> | null;
    if (data?.lesson_id) {
      router.push(`/lessons/${data.lesson_id}`);
    } else if (data?.conversation_id) {
      router.push(`/messages/${data.conversation_id}`);
    }
  }

  if (loading) {
    return <p className="py-12 text-center text-muted-foreground">Loading...</p>;
  }

  const typeIcons: Record<string, string> = {
    new_booking: "📅",
    lesson_canceled: "❌",
    no_show: "⚠️",
    lesson_reminder: "🔔",
    notes_published: "📝",
    new_message: "💬",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Notifications</h1>
        {notifications.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              const supabase = createClient();
              const { data: { user } } = await supabase.auth.getUser();
              if (user) {
                await supabase
                  .from("notifications")
                  .delete()
                  .eq("user_id", user.id);
                setNotifications([]);
              }
            }}
          >
            Clear all
          </Button>
        )}
      </div>

      {notifications.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No notifications yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <Card
              key={n.id}
              className={`cursor-pointer transition-colors hover:bg-muted/50 ${
                !n.read ? "border-primary/30 bg-primary/5" : ""
              }`}
              onClick={() => handleClick(n)}
            >
              <CardContent className="flex items-start gap-3 p-4">
                <span className="text-lg">
                  {typeIcons[n.type] || "📌"}
                </span>
                <div className="flex-1 min-w-0 space-y-1">
                  <p className={`text-sm ${!n.read ? "font-medium" : ""}`}>
                    {n.title}
                  </p>
                  {n.body && (
                    <p className="text-sm text-muted-foreground">{n.body}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {new Date(n.created_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
