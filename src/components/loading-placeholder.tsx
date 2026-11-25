export function LoadingPlaceholder({ className }: { className?: string }) {
  return (
    <p className={className ?? "py-12 text-center text-muted-foreground"}>
      Loading...
    </p>
  );
}
