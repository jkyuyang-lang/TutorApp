"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface TutorSettings {
  id: string;
  buffer_minutes: number;
  min_notice_hours: number;
  booking_window_days: number;
  max_lessons_per_day: number | null;
  cancellation_policy: {
    full_refund_hours: number;
    partial_refund_pct: number;
    no_show_charge_pct: number;
  };
}

export default function PoliciesPage() {
  const [settings, setSettings] = useState<TutorSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from("profiles").select("id").eq("user_id", user.id).single();
    if (!profile) return;

    const { data: tutor } = await supabase
      .from("tutors")
      .select("id, buffer_minutes, min_notice_hours, booking_window_days, max_lessons_per_day, cancellation_policy")
      .eq("profile_id", profile.id)
      .single();

    if (tutor) {
      setSettings(tutor as TutorSettings);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleSave() {
    if (!settings) return;
    setSaving(true);
    setMessage(null);

    const supabase = createClient();
    const { error } = await supabase
      .from("tutors")
      .update({
        buffer_minutes: settings.buffer_minutes,
        min_notice_hours: settings.min_notice_hours,
        booking_window_days: settings.booking_window_days,
        max_lessons_per_day: settings.max_lessons_per_day,
        cancellation_policy: settings.cancellation_policy,
      })
      .eq("id", settings.id);

    if (error) {
      setMessage(`Error: ${error.message}`);
    } else {
      setMessage("Policies saved.");
    }
    setSaving(false);
  }

  if (loading || !settings) {
    return <p className="py-12 text-center text-muted-foreground">Loading...</p>;
  }

  const policy = settings.cancellation_policy;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Policies & Booking Rules</h1>

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

      {/* Booking rules */}
      <Card>
        <CardHeader>
          <CardTitle>Booking Rules</CardTitle>
          <CardDescription>Control how clients book lessons.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Buffer between lessons (minutes)</Label>
              <Input
                type="number"
                min="0"
                max="60"
                value={settings.buffer_minutes}
                onChange={(e) =>
                  setSettings({ ...settings, buffer_minutes: parseInt(e.target.value) || 0 })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Minimum notice (hours)</Label>
              <Input
                type="number"
                min="0"
                value={settings.min_notice_hours}
                onChange={(e) =>
                  setSettings({ ...settings, min_notice_hours: parseInt(e.target.value) || 0 })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Booking window (days ahead)</Label>
              <Input
                type="number"
                min="1"
                value={settings.booking_window_days}
                onChange={(e) =>
                  setSettings({ ...settings, booking_window_days: parseInt(e.target.value) || 30 })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Max lessons per day (blank = no limit)</Label>
              <Input
                type="number"
                min="1"
                value={settings.max_lessons_per_day ?? ""}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    max_lessons_per_day: e.target.value ? parseInt(e.target.value) : null,
                  })
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cancellation policy */}
      <Card>
        <CardHeader>
          <CardTitle>Cancellation Policy</CardTitle>
          <CardDescription>
            Displayed to clients at checkout. Applied automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Full refund if canceled before (hours)</Label>
              <Input
                type="number"
                min="0"
                value={policy.full_refund_hours}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    cancellation_policy: {
                      ...policy,
                      full_refund_hours: parseInt(e.target.value) || 0,
                    },
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Partial refund % (under cutoff)</Label>
              <Input
                type="number"
                min="0"
                max="100"
                value={policy.partial_refund_pct}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    cancellation_policy: {
                      ...policy,
                      partial_refund_pct: parseInt(e.target.value) || 0,
                    },
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>No-show charge %</Label>
              <Input
                type="number"
                min="0"
                max="100"
                value={policy.no_show_charge_pct}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    cancellation_policy: {
                      ...policy,
                      no_show_charge_pct: parseInt(e.target.value) || 0,
                    },
                  })
                }
              />
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Preview: Cancel {policy.full_refund_hours}h+ before = 100% refund.
            Under {policy.full_refund_hours}h = {policy.partial_refund_pct}% refund.
            No-show = {policy.no_show_charge_pct}% charged.
          </p>
        </CardContent>
        <CardFooter>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save policies"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
