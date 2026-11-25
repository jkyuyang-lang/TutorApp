import type { ReactNode } from "react";

interface EmptyStateProps {
  message: string;
  className?: string;
  children?: ReactNode;
}

export function EmptyState({ message, className, children }: EmptyStateProps) {
  return (
    <div className={className ?? "py-8 text-center text-muted-foreground"}>
      <p className="text-sm">{message}</p>
      {children}
    </div>
  );
}
