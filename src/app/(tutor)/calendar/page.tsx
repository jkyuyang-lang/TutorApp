"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

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

export default function CalendarPage() {
  const [tutorId, setTutorId] = useState<string | null>(null);
  const [rules, setRules] = useState<AvailRule[]>([]);
  const [timeOffs, setTimeOffs] = useState<TimeOffEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // New rule form
  const [newDay, setNewDay] = useState(1);
  const [newStart, setNewStart] = useState("09:00");
  const [newEnd, setNewEnd] = useState("17:00");

  // New time off form
  const [toStart, setToStart] = useState("");
  const [toEnd, setToEnd] = useState("");
  const [toReason, setToReason] = useState("");

  const loadData = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .single();
    if (!profile) return;

    const { data: tutor } = await supabase
      .from("tutors")
      .select("id")
      .eq("profile_id", profile.id)
      .single();
    if (!tutor) return;

    setTutorId(tutor.id);

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

    setRules(rulesRes.data ?? []);
    setTimeOffs(timeOffRes.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function addRule() {
    if (!tutorId) return;
    setSaving(true);
    setMessage(null);

    const supabase = createClient();
    const { error } = await supabase.from("availability_rules").insert({
      tutor_id: tutorId,
      day_of_week: newDay,
      start_time: newStart,
      end_time: newEnd,
      format: "online",
    });

    if (error) {
      setMessage(`Error: ${error.message}`);
    } else {
      setMessage("Availability added.");
      await loadData();
    }
    setSaving(false);
  }

  async function deleteRule(id: string) {
    const supabase = createClient();
    await supabase.from("availability_rules").delete().eq("id", id);
    await loadData();
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

  // Group rules by day
  const rulesByDay = DAYS.map((name, i) => ({
    name,
    day: i,
    rules: rules.filter((r) => r.day_of_week === i),
  }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Calendar & Availability</h1>

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

      {/* Weekly availability */}
      <Card>
        <CardHeader>
          <CardTitle>Weekly Availability</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {rulesByDay.map(({ name, day, rules: dayRules }) => (
            <div key={day} className="flex items-start gap-4">
              <span className="w-24 pt-1 text-sm font-medium">{name}</span>
              <div className="flex-1 space-y-1">
                {dayRules.length === 0 ? (
                  <span className="text-sm text-muted-foreground">Not available</span>
                ) : (
                  dayRules.map((rule) => (
                    <div key={rule.id} className="flex items-center gap-2">
                      <Badge variant="secondary">
                        {rule.start_time.slice(0, 5)} &ndash; {rule.end_time.slice(0, 5)}
                      </Badge>
                      <button
                        onClick={() => deleteRule(rule.id)}
                        className="text-xs text-muted-foreground hover:text-destructive"
                      >
                        Remove
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}

          <Separator />

          {/* Add new rule */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Day</Label>
              <select
                value={newDay}
                onChange={(e) => setNewDay(Number(e.target.value))}
                className="h-8 rounded-md border bg-background px-2 text-sm"
              >
                {DAYS.map((name, i) => (
                  <option key={i} value={i}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Start</Label>
              <Input
                type="time"
                value={newStart}
                onChange={(e) => setNewStart(e.target.value)}
                className="h-8 w-28"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">End</Label>
              <Input
                type="time"
                value={newEnd}
                onChange={(e) => setNewEnd(e.target.value)}
                className="h-8 w-28"
              />
            </div>
            <Button size="sm" onClick={addRule} disabled={saving}>
              Add
            </Button>
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
              <Label className="text-xs">From</Label>
              <Input
                type="datetime-local"
                value={toStart}
                onChange={(e) => setToStart(e.target.value)}
                className="h-8"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <Input
                type="datetime-local"
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
