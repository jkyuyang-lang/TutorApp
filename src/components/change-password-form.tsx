"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/password-input";
import { CardContent, CardFooter } from "@/components/ui/card";
import { CollapsibleCard } from "@/components/collapsible-card";

interface ChangePasswordFormProps {
  profileId?: string;
  email?: string;
}

export function ChangePasswordForm({ profileId, email }: ChangePasswordFormProps) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  function clearForm() {
    setNewPassword("");
    setConfirmPassword("");
    setMessage("");
  }

  async function handleSave() {
    setMessage("");

    if (newPassword.length < 6) {
      setMessage("Error: Password must be at least 6 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage("Error: Passwords do not match.");
      return;
    }

    setSaving(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (error) {
        setMessage(`Error: ${error.message}`);
      } else {
        setMessage("Password updated successfully.");
        clearForm();
      }
    } catch {
      setMessage("Error: Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSendResetLink() {
    if (!email) {
      setMessage("Error: No email address available.");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/settings`,
      });
      if (error) {
        setMessage(`Error: ${error.message}`);
      } else {
        setMessage(`Password reset link sent to ${email}.`);
      }
    } catch {
      setMessage("Error: Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  // Admin mode: show send reset link instead of password fields
  if (profileId) {
    return (
      <CollapsibleCard
        title="Password Reset"
        description="Send a password reset link to the user."
      >
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Send a password reset email to <strong>{email}</strong>. The user will receive a link to set a new password.
          </p>
          {message && (
            <p
              className={
                message.startsWith("Error")
                  ? "text-sm text-destructive"
                  : "text-sm text-green-600"
              }
            >
              {message}
            </p>
          )}
        </CardContent>
        <CardFooter className="flex justify-end">
          <Button size="sm" onClick={handleSendResetLink} disabled={saving}>
            {saving ? "Sending..." : "Send Reset Link"}
          </Button>
        </CardFooter>
      </CollapsibleCard>
    );
  }

  return (
    <CollapsibleCard
      title="Change Password"
      description="Update your account password."
    >
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="new-password" required>New Password</Label>
          <PasswordInput
            id="new-password"
            required
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Enter new password"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm-password" required>Confirm Password</Label>
          <PasswordInput
            id="confirm-password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm new password"
          />
        </div>
        {message && (
          <p
            className={
              message.startsWith("Error")
                ? "text-sm text-destructive"
                : "text-sm text-green-600"
            }
          >
            {message}
          </p>
        )}
      </CardContent>
      <CardFooter className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={clearForm}>
          Cancel
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </Button>
      </CardFooter>
    </CollapsibleCard>
  );
}
