import { PublicShell } from "@/components/public-shell";

export default async function BookLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PublicShell>
      <div className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl">{children}</div>
      </div>
    </PublicShell>
  );
}
