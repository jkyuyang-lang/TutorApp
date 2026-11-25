"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export interface SearchableSubject {
  id: string;
  name: string;
  category: string;
}

export function SubjectSearch({ subjects, dropdownDirection = "up", variant = "hero" }: { subjects: SearchableSubject[]; dropdownDirection?: "up" | "down"; variant?: "hero" | "inline" }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<SearchableSubject | null>(null);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const lowerQuery = query.toLowerCase();
  const filtered = query.length > 0
    ? subjects.filter(
        (s) =>
          s.name.toLowerCase().includes(lowerQuery) ||
          s.category.toLowerCase().includes(lowerQuery)
      )
    : subjects;

  // Group filtered results by category
  const grouped: Record<string, SearchableSubject[]> = {};
  for (const s of filtered) {
    if (!grouped[s.category]) grouped[s.category] = [];
    grouped[s.category].push(s);
  }

  function handleSelect(subject: SearchableSubject) {
    setSelected(subject);
    setQuery(subject.name);
    setOpen(false);
  }

  function handleInputChange(value: string) {
    setQuery(value);
    setSelected(null);
    setOpen(true);
  }

  const inputClass = variant === "inline"
    ? "h-12 w-full rounded-lg border border-input bg-white pl-11 pr-4 text-base text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-ring"
    : "h-12 w-full rounded-lg bg-white/95 pl-11 pr-4 text-base text-navy-900 placeholder:text-navy-400 outline-none focus:ring-2 focus:ring-gold-400";

  const buttonClass = variant === "inline"
    ? "h-12 px-8 text-base shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
    : "bg-gold-400 text-navy-900 hover:bg-gold-300 font-semibold h-12 px-8 text-base shrink-0 disabled:opacity-50 disabled:cursor-not-allowed";

  const dropdownPos = dropdownDirection === "down"
    ? "top-full mt-1"
    : "bottom-full mb-1";

  return (
    <div ref={wrapperRef} className={variant === "inline" ? "" : "pt-2"}>
      <div className="relative">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="text"
              value={query}
              onChange={(e) => handleInputChange(e.target.value)}
              onFocus={() => setOpen(true)}
              placeholder="Search for a subject..."
              className={inputClass}
            />
          </div>
          <Button
            size="md"
            className={buttonClass}
            disabled={!selected}
            render={selected ? <Link href={`/browse?subject=${selected.id}`} /> : undefined}
          >
            Find a tutor
          </Button>
        </div>

        {open && filtered.length > 0 && (
          <div className={`absolute left-0 right-0 ${dropdownPos} max-h-72 overflow-y-auto rounded-lg bg-white shadow-xl ring-1 ring-black/10 z-50`}>
            {Object.entries(grouped).map(([category, items]) => (
              <div key={category}>
                <div className="px-4 py-2 text-xs font-semibold text-navy-400 uppercase tracking-wider bg-gray-50 sticky top-0">
                  {category}
                </div>
                {items.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => handleSelect(s)}
                    className="w-full text-left px-4 py-2.5 text-sm text-navy-900 hover:bg-gold-50 transition-colors cursor-pointer"
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}

        {open && query.length > 0 && filtered.length === 0 && (
          <div className={`absolute left-0 right-0 ${dropdownPos} rounded-lg bg-white shadow-xl ring-1 ring-black/10 z-50 px-4 py-6 text-center text-sm text-navy-400`}>
            No subjects found matching &ldquo;{query}&rdquo;
          </div>
        )}
      </div>
    </div>
  );
}
