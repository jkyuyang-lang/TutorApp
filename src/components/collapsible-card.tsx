"use client";

import { useState, useRef, useEffect, type ReactNode } from "react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ChevronDown } from "lucide-react";

interface CollapsibleCardProps {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  headerRight?: ReactNode;
  children: ReactNode;
}

export function CollapsibleCard({
  title,
  description,
  defaultOpen = false,
  headerRight,
  children,
}: CollapsibleCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>(defaultOpen ? undefined : 0);

  useEffect(() => {
    if (!contentRef.current) return;
    if (open) {
      const h = contentRef.current.scrollHeight;
      setHeight(h);
      const timer = setTimeout(() => setHeight(undefined), 300);
      return () => clearTimeout(timer);
    } else {
      const h = contentRef.current.scrollHeight;
      setHeight(h);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setHeight(0));
      });
    }
  }, [open]);

  return (
    <Card>
      <CardHeader
        className="cursor-pointer select-none"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <CardTitle>{title}</CardTitle>
            {description && (
              <CardDescription className="mt-1">{description}</CardDescription>
            )}
          </div>
          <div className="flex items-center gap-2">
            {headerRight && (
              <div onClick={(e) => e.stopPropagation()}>{headerRight}</div>
            )}
            <ChevronDown
              className={`size-5 shrink-0 text-muted-foreground transition-transform duration-300 ${
                open ? "rotate-180" : ""
              }`}
            />
          </div>
        </div>
      </CardHeader>
      <div
        ref={contentRef}
        className="overflow-hidden transition-[height] duration-300 ease-in-out"
        style={{ height: height === undefined ? "auto" : height }}
      >
        {children}
      </div>
    </Card>
  );
}
