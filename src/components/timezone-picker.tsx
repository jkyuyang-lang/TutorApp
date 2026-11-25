"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";

interface TimeZoneEntry {
  id: string;
  label: string;
  group: string;
}

const TIMEZONE_LIST: TimeZoneEntry[] = [
  // US & Canada
  { id: "Pacific/Honolulu", label: "Hawaii Time", group: "US/Canada" },
  { id: "America/Anchorage", label: "Alaska Time", group: "US/Canada" },
  { id: "America/Los_Angeles", label: "Pacific Time - US & Canada", group: "US/Canada" },
  { id: "America/Denver", label: "Mountain Time - US & Canada", group: "US/Canada" },
  { id: "America/Chicago", label: "Central Time - US & Canada", group: "US/Canada" },
  { id: "America/New_York", label: "Eastern Time - US & Canada", group: "US/Canada" },
  { id: "America/Halifax", label: "Atlantic Time - Canada", group: "US/Canada" },
  { id: "America/St_Johns", label: "Newfoundland Time", group: "US/Canada" },
  // Central & South America
  { id: "America/Mexico_City", label: "Mexico City", group: "Americas" },
  { id: "America/Bogota", label: "Bogota", group: "Americas" },
  { id: "America/Lima", label: "Lima", group: "Americas" },
  { id: "America/Santiago", label: "Santiago", group: "Americas" },
  { id: "America/Sao_Paulo", label: "Sao Paulo", group: "Americas" },
  { id: "America/Argentina/Buenos_Aires", label: "Buenos Aires", group: "Americas" },
  // Europe
  { id: "Europe/London", label: "London (GMT)", group: "Europe" },
  { id: "Europe/Paris", label: "Paris (CET)", group: "Europe" },
  { id: "Europe/Berlin", label: "Berlin (CET)", group: "Europe" },
  { id: "Europe/Madrid", label: "Madrid (CET)", group: "Europe" },
  { id: "Europe/Rome", label: "Rome (CET)", group: "Europe" },
  { id: "Europe/Amsterdam", label: "Amsterdam (CET)", group: "Europe" },
  { id: "Europe/Zurich", label: "Zurich (CET)", group: "Europe" },
  { id: "Europe/Stockholm", label: "Stockholm (CET)", group: "Europe" },
  { id: "Europe/Athens", label: "Athens (EET)", group: "Europe" },
  { id: "Europe/Helsinki", label: "Helsinki (EET)", group: "Europe" },
  { id: "Europe/Istanbul", label: "Istanbul", group: "Europe" },
  { id: "Europe/Moscow", label: "Moscow", group: "Europe" },
  // Asia & Pacific
  { id: "Asia/Dubai", label: "Dubai", group: "Asia/Pacific" },
  { id: "Asia/Kolkata", label: "India (IST)", group: "Asia/Pacific" },
  { id: "Asia/Bangkok", label: "Bangkok", group: "Asia/Pacific" },
  { id: "Asia/Singapore", label: "Singapore", group: "Asia/Pacific" },
  { id: "Asia/Hong_Kong", label: "Hong Kong", group: "Asia/Pacific" },
  { id: "Asia/Shanghai", label: "Shanghai", group: "Asia/Pacific" },
  { id: "Asia/Seoul", label: "Seoul", group: "Asia/Pacific" },
  { id: "Asia/Tokyo", label: "Tokyo", group: "Asia/Pacific" },
  { id: "Australia/Sydney", label: "Sydney", group: "Asia/Pacific" },
  { id: "Australia/Melbourne", label: "Melbourne", group: "Asia/Pacific" },
  { id: "Pacific/Auckland", label: "Auckland", group: "Asia/Pacific" },
];

function getCurrentTime(tzId: string): string {
  try {
    return new Date().toLocaleTimeString(undefined, {
      timeZone: tzId,
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function findEntry(tzId: string): TimeZoneEntry | undefined {
  return TIMEZONE_LIST.find((tz) => tz.id === tzId);
}

export function getTimeZoneLabel(tzId: string): string {
  return findEntry(tzId)?.label ?? tzId.replace(/_/g, " ");
}

interface TimeZonePickerProps {
  value: string;
  onChange: (value: string) => void;
  id?: string;
}

export function TimeZonePicker({ value, onChange, id }: TimeZonePickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

  const selectedEntry = findEntry(value);
  const displayLabel = selectedEntry?.label ?? value.replace(/_/g, " ");

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setDropdownStyle({
      position: "fixed",
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open, updatePosition]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return TIMEZONE_LIST;
    return TIMEZONE_LIST.filter(
      (tz) =>
        tz.label.toLowerCase().includes(q) ||
        tz.group.toLowerCase().includes(q) ||
        tz.id.toLowerCase().includes(q)
    );
  }, [search]);

  const groups = useMemo(() => {
    const map = new Map<string, TimeZoneEntry[]>();
    for (const tz of filtered) {
      const list = map.get(tz.group) ?? [];
      list.push(tz);
      map.set(tz.group, list);
    }
    return map;
  }, [filtered]);

  return (
    <div id={id}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => { setOpen(!open); setSearch(""); }}
        className="flex h-8 w-full items-center justify-between rounded-lg border border-input bg-white px-2.5 py-2 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className={`truncate ${!value ? "text-muted-foreground" : ""}`}>{value ? displayLabel : "Select time zone"}</span>
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
          className={`ml-2 shrink-0 opacity-50 transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && createPortal(
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-[99]" onClick={() => setOpen(false)} />

          {/* Dropdown */}
          <div className="z-[100] rounded-lg bg-white shadow-xl ring-1 ring-black/10" style={dropdownStyle}>
            <div className="p-2">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                autoFocus
                className="h-8 w-full rounded-lg border border-input bg-white px-2.5 text-sm placeholder:text-muted-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </div>

            <div className="max-h-64 overflow-y-auto pb-2">
              {filtered.length === 0 && (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No matching time zones
                </p>
              )}

              {Array.from(groups.entries()).map(([group, entries]) => (
                <div key={group}>
                  <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-navy-400 bg-gray-50 sticky top-0">
                    {group}
                  </div>
                  {entries.map((tz) => (
                    <button
                      key={tz.id}
                      type="button"
                      onClick={() => { onChange(tz.id); setOpen(false); }}
                      className={`flex w-full items-center justify-between px-4 py-2.5 text-sm transition-colors cursor-pointer ${
                        value === tz.id
                          ? "bg-gold-50 font-medium"
                          : "hover:bg-gold-50"
                      }`}
                    >
                      <span>{tz.label}</span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {getCurrentTime(tz.id)}
                      </span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
