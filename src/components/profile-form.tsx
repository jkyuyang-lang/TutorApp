"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatPhone } from "@/lib/phone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CardContent, CardFooter } from "@/components/ui/card";
import { CollapsibleCard } from "@/components/collapsible-card";
import { TimeZonePicker } from "@/components/timezone-picker";

interface ProfileFormProps {
  profileId: string;
  onSaved?: () => void;
}

export function ProfileForm({ profileId, onSaved }: ProfileFormProps) {
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [timeZone, setTimeZone] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.email) setEmail(user.email);

    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, phone, time_zone")
      .eq("id", profileId)
      .single();

    if (data) {
      const parts = (data.full_name ?? "").split(" ");
      setFirstName(parts[0] ?? "");
      setLastName(parts.slice(1).join(" "));
      setPhone(data.phone ?? "");
      setTimeZone(data.time_zone ?? "");
    }
  }, [profileId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave() {
    setSaving(true);
    setMessage(null);

    const supabase = createClient();
    const full_name = `${firstName.trim()} ${lastName.trim()}`.trim();

    const { error } = await supabase
      .from("profiles")
      .update({
        full_name,
        phone: phone || null,
        time_zone: timeZone,
      })
      .eq("id", profileId);

    setSaving(false);

    if (error) {
      setMessage({ type: "error", text: error.message });
    } else {
      setMessage({ type: "success", text: "Profile saved." });
      onSaved?.();
    }
  }

  return (
    <CollapsibleCard title="Profile" description="Update personal information.">
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="first_name" required>First name</Label>
            <Input
              id="first_name"
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="last_name" required>Last name</Label>
            <Input
              id="last_name"
              required
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            readOnly
            disabled
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone">Phone (optional)</Label>
          <Input
            id="phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(formatPhone(e.target.value))}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="time_zone" required>Time zone</Label>
          <TimeZonePicker value={timeZone} onChange={setTimeZone} />
        </div>

        {message && (
          <p
            className={
              message.type === "success" ? "text-sm text-green-600" : "text-sm text-red-600"
            }
          >
            {message.text}
          </p>
        )}
      </CardContent>

      <CardFooter className="flex justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setMessage(null);
            load();
          }}
        >
          Cancel
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </Button>
      </CardFooter>
    </CollapsibleCard>
  );
}
