import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default async function ClientsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", user.id)
    .single();
  if (!profile) redirect("/onboarding");

  const { data: tutor } = await supabase
    .from("tutors")
    .select("id")
    .eq("profile_id", profile.id)
    .single();
  if (!tutor) redirect("/tutor-setup");

  // Get all clients with their learners and lesson counts
  const { data: clients } = await supabase
    .from("tutor_clients")
    .select(`
      id, status, notes, created_at,
      profiles:account_holder_id(id, full_name, phone, time_zone)
    `)
    .eq("tutor_id", tutor.id)
    .order("created_at", { ascending: false });

  // Get learners for each client and lesson counts
  const clientsWithDetails = await Promise.all(
    (clients ?? []).map(async (client) => {
      const clientProfile = client.profiles as unknown as {
        id: string;
        full_name: string;
        phone: string | null;
        time_zone: string;
      };

      const { data: learners } = await supabase
        .from("learners")
        .select("id, full_name, grade_level, is_self")
        .eq("account_holder_id", clientProfile.id);

      const { count: totalLessons } = await supabase
        .from("lessons")
        .select("id", { count: "exact", head: true })
        .eq("tutor_id", tutor.id)
        .eq("booked_by", clientProfile.id)
        .in("status", ["confirmed", "completed"]);

      const { count: upcomingLessons } = await supabase
        .from("lessons")
        .select("id", { count: "exact", head: true })
        .eq("tutor_id", tutor.id)
        .eq("booked_by", clientProfile.id)
        .eq("status", "confirmed")
        .gte("starts_at", new Date().toISOString());

      return {
        ...client,
        profile: clientProfile,
        learners: learners ?? [],
        totalLessons: totalLessons ?? 0,
        upcomingLessons: upcomingLessons ?? 0,
      };
    })
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Clients</h1>

      {clientsWithDetails.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No clients yet. They&apos;ll appear here after booking their first lesson.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {clientsWithDetails.map((client) => (
            <Link key={client.id} href={`/clients/${client.profile.id}`}>
              <Card className="transition-colors hover:bg-muted/50">
                <CardContent className="flex items-center justify-between p-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {client.profile.full_name}
                      </span>
                      <Badge
                        variant={client.status === "active" ? "default" : "secondary"}
                      >
                        {client.status}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {client.learners.map((l) => (
                        <Badge key={l.id} variant="outline" className="text-xs">
                          {l.full_name}
                          {l.grade_level && ` (${l.grade_level})`}
                        </Badge>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {client.totalLessons} lesson{client.totalLessons !== 1 ? "s" : ""} total
                      {client.upcomingLessons > 0 &&
                        ` · ${client.upcomingLessons} upcoming`}
                    </p>
                  </div>
                  <ChevronRight />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function ChevronRight() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-muted-foreground"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
