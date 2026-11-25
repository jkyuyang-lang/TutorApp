/** "Tuesday, November 24, 2026" */
export function formatLongDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** "Tue, Nov 24" */
export function formatShortDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** "10:45 AM" */
export function formatTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "10:45 AM MST" */
export function formatTimeWithZone(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

/** "10:45 AM – 11:45 AM MST" */
export function formatTimeRange(start: Date | string, end: Date | string): string {
  return `${formatTime(start)} – ${formatTimeWithZone(end)}`;
}

/** "$100.00" */
export function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
