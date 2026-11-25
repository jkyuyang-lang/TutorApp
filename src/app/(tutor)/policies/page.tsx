"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CollapsibleCard } from "@/components/collapsible-card";

interface PolicySettings {
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
  const router = useRouter();
  const [settings, setSettings] = useState<PolicySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    // Verify superadmin role client-side before fetching
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (!profile || profile.role !== "superadmin") {
      router.replace("/dashboard");
      return;
    }

    // Load policies via API (uses service client, bypasses RLS)
    const res = await fetch("/api/admin/policies");
    if (!res.ok) {
      setMessage("Error: Failed to load policies.");
      setLoading(false);
      return;
    }

    const data = await res.json();
    if (data.policies) {
      setSettings(data.policies as PolicySettings);
    }
    setLoading(false);
  }, [router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleSave() {
    if (!settings) return;
    setSaving(true);
    setMessage(null);

    const res = await fetch("/api/admin/policies", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });

    const data = await res.json();
    if (!res.ok) {
      setMessage(`Error: ${data.error || "Failed to save policies."}`);
    } else {
      setMessage("Policies saved and applied to all tutors.");
    }
    setSaving(false);
  }

  if (loading || !settings) {
    return <p className="py-12 text-center text-muted-foreground">Loading...</p>;
  }

  const policy = settings.cancellation_policy;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Policies & Booking Rules</h1>
        <p className="text-sm text-muted-foreground">These settings apply to all tutors.</p>
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

      {/* Booking rules */}
      <CollapsibleCard title="Booking Rules" description="Control how clients book lessons." defaultOpen>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label required>Buffer between lessons (minutes)</Label>
              <Input
                type="number"
                min="0"
                max="60"
                required
                value={settings.buffer_minutes}
                onChange={(e) =>
                  setSettings({ ...settings, buffer_minutes: parseInt(e.target.value) || 0 })
                }
              />
            </div>
            <div className="space-y-2">
              <Label required>Minimum notice (hours)</Label>
              <Input
                type="number"
                min="0"
                required
                value={settings.min_notice_hours}
                onChange={(e) =>
                  setSettings({ ...settings, min_notice_hours: parseInt(e.target.value) || 0 })
                }
              />
            </div>
            <div className="space-y-2">
              <Label required>Booking window (days ahead)</Label>
              <Input
                type="number"
                min="1"
                required
                value={settings.booking_window_days}
                onChange={(e) =>
                  setSettings({ ...settings, booking_window_days: parseInt(e.target.value) || 60 })
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
      </CollapsibleCard>

      {/* Cancellation policy */}
      <CollapsibleCard
        title="Cancellation Policy"
        description="Displayed to clients at checkout. Applied automatically."
        defaultOpen
      >
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label required>Full refund if canceled before (hours)</Label>
              <Input
                type="number"
                min="0"
                required
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
              <Label required>Partial refund % (under cutoff)</Label>
              <Input
                type="number"
                min="0"
                max="100"
                required
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
              <Label required>No-show charge %</Label>
              <Input
                type="number"
                min="0"
                max="100"
                required
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
        <CardFooter className="justify-end gap-2">
          <Button variant="outline" onClick={() => window.location.reload()}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </CardFooter>
      </CollapsibleCard>
    </div>
  );
}
