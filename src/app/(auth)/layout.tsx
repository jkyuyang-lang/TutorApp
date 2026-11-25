import { PublicShell } from "@/components/public-shell";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PublicShell>
      <main className="flex flex-1 items-center justify-center px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-3xl">{children}</div>
      </main>
    </PublicShell>
  );
}
