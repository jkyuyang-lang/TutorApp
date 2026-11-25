"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Generate 30-min time slots from 6:00 AM to 10:00 PM
const TIME_SLOTS: string[] = [];
for (let h = 6; h <= 21; h++) {
  TIME_SLOTS.push(`${String(h).padStart(2, "0")}:00`);
  TIME_SLOTS.push(`${String(h).padStart(2, "0")}:30`);
}

interface AvailRule {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  format: string;
}

interface TimeOffEntry {
  id: string;
  starts_at: string;
  ends_at: string;
  reason: string | null;
}

// Cell key format: "day-HH:MM" e.g. "1-09:00"
function cellKey(day: number, time: string): string {
  return `${day}-${time}`;
}

function parseCellKey(key: string): { day: number; time: string } {
  const dash = key.indexOf("-");
  return { day: Number(key.slice(0, dash)), time: key.slice(dash + 1) };
}

/** Convert availability rules into a set of selected 30-min cell keys */
function rulesToCells(rules: AvailRule[]): Set<string> {
  const cells = new Set<string>();
  for (const rule of rules) {
    const startIdx = TIME_SLOTS.indexOf(rule.start_time.slice(0, 5));
    const endTime = rule.end_time.slice(0, 5);
    // Find the index of end_time — cells go UP TO but not including end
    let endIdx = TIME_SLOTS.indexOf(endTime);
    if (endIdx === -1) endIdx = TIME_SLOTS.length; // end is past our range
    if (startIdx === -1) continue;
    for (let i = startIdx; i < endIdx; i++) {
      cells.add(cellKey(rule.day_of_week, TIME_SLOTS[i]));
    }
  }
  return cells;
}

/** Convert a set of selected cells back into contiguous availability rules */
function cellsToRules(cells: Set<string>): Array<{ day_of_week: number; start_time: string; end_time: string }> {
  const rules: Array<{ day_of_week: number; start_time: string; end_time: string }> = [];

  for (let day = 0; day < 7; day++) {
    let rangeStart: string | null = null;

    for (let i = 0; i < TIME_SLOTS.length; i++) {
      const key = cellKey(day, TIME_SLOTS[i]);
      const isSelected = cells.has(key);

      if (isSelected && rangeStart === null) {
        rangeStart = TIME_SLOTS[i];
      }

      if (!isSelected && rangeStart !== null) {
        rules.push({ day_of_week: day, start_time: rangeStart, end_time: TIME_SLOTS[i] });
        rangeStart = null;
      }
    }

    // Close any open range at the end
    if (rangeStart !== null) {
      // End time is 30 min after the last slot
      const lastSlot = TIME_SLOTS[TIME_SLOTS.length - 1];
      const [h, m] = lastSlot.split(":").map(Number);
      const endH = m === 30 ? h + 1 : h;
      const endM = m === 30 ? 0 : 30;
      const endTime = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
      rules.push({ day_of_week: day, start_time: rangeStart, end_time: endTime });
    }
  }

  return rules;
}

export default function CalendarPage() {
  const searchParams = useSearchParams();
  const [tutorId, setTutorId] = useState<string | null>(null);
  const [rules, setRules] = useState<AvailRule[]>([]);
  const [timeOffs, setTimeOffs] = useState<TimeOffEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const cal = searchParams.get("calendar");
    const error = searchParams.get("error");
    if (cal === "connected") return "Google Calendar connected successfully!";
    if (error === "oauth_failed") return "Error: Failed to connect Google Calendar. Please try again.";
    if (error === "missing_params") return "Error: OAuth callback was missing required parameters.";
    return null;
  });

  // Grid selection state
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [hasChanges, setHasChanges] = useState(false);
  const lastClickedRef = useRef<{ day: number; timeIdx: number } | null>(null);

  // New time off form
  const [toStart, setToStart] = useState("");
  const [toEnd, setToEnd] = useState("");
  const [toReason, setToReason] = useState("");

  const [calendarProvider, setCalendarProvider] = useState<string>("none");
  const [tutorTimeZone, setTutorTimeZone] = useState<string>("");
  const [disconnecting, setDisconnecting] = useState(false);

  const loadData = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, time_zone")
      .eq("user_id", user.id)
      .single();
    if (!profile) return;

    setTutorTimeZone(profile.time_zone || Intl.DateTimeFormat().resolvedOptions().timeZone);

    const { data: tutor } = await supabase
      .from("tutors")
      .select("id, calendar_provider")
      .eq("profile_id", profile.id)
      .single();
    if (!tutor) return;

    setTutorId(tutor.id);
    setCalendarProvider(tutor.calendar_provider || "none");

    const [rulesRes, timeOffRes] = await Promise.all([
      supabase
        .from("availability_rules")
        .select("*")
        .eq("tutor_id", tutor.id)
        .order("day_of_week")
        .order("start_time"),
      supabase
        .from("time_off")
        .select("*")
        .eq("tutor_id", tutor.id)
        .gte("ends_at", new Date().toISOString())
        .order("starts_at"),
    ]);

    const loadedRules = rulesRes.data ?? [];
    setRules(loadedRules);
    setSelectedCells(rulesToCells(loadedRules));
    setTimeOffs(timeOffRes.data ?? []);
    setHasChanges(false);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function handleCellClick(day: number, timeIdx: number, shiftKey: boolean) {
    const last = lastClickedRef.current;

    setSelectedCells((prev) => {
      const next = new Set(prev);

      if (shiftKey && last) {
        // Range select: fill all cells between last click and this click
        const minDay = Math.min(last.day, day);
        const maxDay = Math.max(last.day, day);
        const minIdx = Math.min(last.timeIdx, timeIdx);
        const maxIdx = Math.max(last.timeIdx, timeIdx);

        // Always add when shift-selecting
        for (let d = minDay; d <= maxDay; d++) {
          for (let t = minIdx; t <= maxIdx; t++) {
            next.add(cellKey(d, TIME_SLOTS[t]));
          }
        }
      } else {
        // Single toggle
        const key = cellKey(day, TIME_SLOTS[timeIdx]);
        if (next.has(key)) {
          next.delete(key);
        } else {
          next.add(key);
        }
      }

      return next;
    });

    lastClickedRef.current = { day, timeIdx };
    setHasChanges(true);
  }

  async function saveAvailability() {
    if (!tutorId) return;
    setSaving(true);
    setMessage(null);

    const supabase = createClient();

    // Delete all existing rules
    await supabase.from("availability_rules").delete().eq("tutor_id", tutorId);

    // Insert new rules from grid
    const newRules = cellsToRules(selectedCells);
    if (newRules.length > 0) {
      const { error } = await supabase.from("availability_rules").insert(
        newRules.map((r) => ({
          tutor_id: tutorId,
          day_of_week: r.day_of_week,
          start_time: r.start_time,
          end_time: r.end_time,
          format: "online",
        }))
      );

      if (error) {
        setMessage(`Error: ${error.message}`);
        setSaving(false);
        return;
      }
    }

    setMessage("Availability saved.");
    setHasChanges(false);
    await loadData();
    setSaving(false);
  }

  async function addTimeOff() {
    if (!tutorId || !toStart || !toEnd) return;
    setSaving(true);
    setMessage(null);

    const supabase = createClient();
    const { error } = await supabase.from("time_off").insert({
      tutor_id: tutorId,
      starts_at: new Date(toStart).toISOString(),
      ends_at: new Date(toEnd).toISOString(),
      reason: toReason || null,
    });

    if (error) {
      setMessage(`Error: ${error.message}`);
    } else {
      setMessage("Time off added.");
      setToStart("");
      setToEnd("");
      setToReason("");
      await loadData();
    }
    setSaving(false);
  }

  async function deleteTimeOff(id: string) {
    const supabase = createClient();
    await supabase.from("time_off").delete().eq("id", id);
    await loadData();
  }

  if (loading) {
    return <p className="py-12 text-center text-muted-foreground">Loading...</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Calendar & Availability</h1>
        {tutorTimeZone && (
          <p className="text-sm text-muted-foreground">
            Times shown in {tutorTimeZone.replace(/_/g, " ")} timezone
          </p>
        )}
      </div>

      {message && (
        <div
          className={`rounded-md p-3 text-sm ${
            message.startsWith("Error")
              ? "bg-destructive/10 text-destructive"
              : "bg-green-500/10 text-green-700"
          }`}
        >
          {message}
        </div>
      )}

      {/* Calendar Integration */}
      <Card>
        <CardHeader>
          <CardTitle>Calendar Integration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {calendarProvider === "none" ? (
            <>
              <p className="text-sm text-muted-foreground">
                Connect your calendar to automatically sync lessons as events.
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  window.location.href = "/api/calendar/google/connect";
                }}
              >
                <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Connect Google Calendar
              </Button>
            </>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="bg-green-500/10 text-green-700">
                  Connected
                </Badge>
                <span className="text-sm capitalize">{calendarProvider} Calendar</span>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                disabled={disconnecting}
                onClick={async () => {
                  setDisconnecting(true);
                  const res = await fetch("/api/calendar/disconnect", { method: "POST" });
                  if (res.ok) {
                    setCalendarProvider("none");
                    setMessage("Calendar disconnected.");
                  } else {
                    setMessage("Error: Failed to disconnect calendar.");
                  }
                  setDisconnecting(false);
                }}
              >
                Disconnect
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Weekly Availability Grid */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Weekly Availability</CardTitle>
          <div className="flex items-center gap-2">
            {hasChanges && (
              <span className="text-xs text-muted-foreground">Unsaved changes</span>
            )}
            <Button size="sm" onClick={saveAvailability} disabled={saving || !hasChanges}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-xs text-muted-foreground">
            Click to toggle slots. Hold <kbd className="rounded border bg-muted px-1 py-0.5 text-[10px] font-mono">Shift</kbd> + click to select a range.
          </p>
          <div className="overflow-x-auto">
            <div className="min-w-[500px]">
              {/* Day headers */}
              <div className="grid grid-cols-[60px_repeat(7,1fr)] gap-px">
                <div />
                {SHORT_DAYS.map((d) => (
                  <div key={d} className="py-2 text-center text-xs font-semibold">
                    {d}
                  </div>
                ))}
              </div>

              {/* Time rows */}
              <div className="grid grid-cols-[60px_repeat(7,1fr)] rounded-lg overflow-hidden border">
                {TIME_SLOTS.map((time, timeIdx) => (
                  <div key={time} className="contents">
                    {/* Time label */}
                    <div className="flex items-center justify-end pr-2 bg-background text-[11px] text-muted-foreground h-8 border-b border-r">
                      {time.endsWith(":00") ? formatTimeAmPm(time) : ""}
                    </div>

                    {/* Day cells */}
                    {Array.from({ length: 7 }, (_, day) => {
                      const key = cellKey(day, time);
                      const isSelected = selectedCells.has(key);

                      return (
                        <button
                          key={key}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handleCellClick(day, timeIdx, e.shiftKey);
                          }}
                          className={`h-8 border-b border-r transition-colors select-none ${
                            isSelected
                              ? "bg-blue-400 hover:bg-blue-500"
                              : "bg-background hover:bg-blue-100"
                          }`}
                          title={`${DAYS[day]} ${formatTimeAmPm(time)}`}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Time off */}
      <Card>
        <CardHeader>
          <CardTitle>Time Off</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {timeOffs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No upcoming time off.</p>
          ) : (
            <div className="space-y-2">
              {timeOffs.map((to) => (
                <div
                  key={to.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {new Date(to.starts_at).toLocaleDateString()} &ndash;{" "}
                      {new Date(to.ends_at).toLocaleDateString()}
                    </p>
                    {to.reason && (
                      <p className="text-xs text-muted-foreground">{to.reason}</p>
                    )}
                  </div>
                  <button
                    onClick={() => deleteTimeOff(to.id)}
                    className="text-xs text-muted-foreground hover:text-destructive"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          <Separator />

          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs" required>From</Label>
              <Input
                type="datetime-local"
                required
                value={toStart}
                onChange={(e) => setToStart(e.target.value)}
                className="h-8"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs" required>To</Label>
              <Input
                type="datetime-local"
                required
                value={toEnd}
                onChange={(e) => setToEnd(e.target.value)}
                className="h-8"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Reason</Label>
              <Input
                value={toReason}
                onChange={(e) => setToReason(e.target.value)}
                placeholder="Optional"
                className="h-8 w-32"
              />
            </div>
            <Button size="sm" onClick={addTimeOff} disabled={saving || !toStart || !toEnd}>
              Add
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function formatTimeAmPm(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}
