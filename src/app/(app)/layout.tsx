import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PublicShell } from "@/components/public-shell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email_confirmed_at) {
    redirect("/login");
  }

  return (
    <PublicShell>
      <div className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </div>
    </PublicShell>
  );
}
