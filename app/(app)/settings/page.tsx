"use client";

import { useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Card, { CardHeader } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Tabs from "@/components/ui/Tabs";
import FormField, { SelectField } from "@/components/ui/FormField";
import InlineAlert from "@/components/ui/InlineAlert";
import { roleLabel, useAuth } from "@/lib/auth";
import type { CmsPrefs, NotificationPrefs } from "@/types";

const DEFAULT_NOTIFICATIONS: NotificationPrefs = {
  campaignComplete: true,
  deliveryFailures: true,
  newInboxMessage: false,
  weeklySummary: true,
};

const DEFAULT_PREFERENCES: CmsPrefs = {
  timezone: "Asia/Kolkata",
  dateFormat: "DD MMM YYYY",
  language: "English",
  defaultList: "All opted-in contacts",
};

export default function SettingsPage() {
  const { user, updateUser } = useAuth();
  const [tab, setTab] = useState("profile");
  const [toast, setToast] = useState<string | null>(null);

  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [profileErrors, setProfileErrors] = useState<Record<string, string>>({});
  const [savingProfile, setSavingProfile] = useState(false);

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [passwordErrors, setPasswordErrors] = useState<Record<string, string>>({});
  const [changingPassword, setChangingPassword] = useState(false);

  const [notifications, setNotifications] = useState<NotificationPrefs>(
    user?.notifications ?? DEFAULT_NOTIFICATIONS
  );
  const [savingNotifications, setSavingNotifications] = useState(false);

  const [preferences, setPreferences] = useState<CmsPrefs>(user?.preferences ?? DEFAULT_PREFERENCES);
  const [savingPreferences, setSavingPreferences] = useState(false);

  async function saveProfile() {
    const errors: Record<string, string> = {};
    if (!name.trim()) errors.name = "Name is required.";
    if (!/^\S+@\S+\.\S+$/.test(email)) errors.email = "Enter a valid email address.";
    setProfileErrors(errors);
    if (Object.keys(errors).length) return;

    setSavingProfile(true);
    try {
      const res = await fetch("/api/auth/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), phone: phone.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setProfileErrors(data.errors ?? { name: data.error ?? "Could not save profile." });
        return;
      }
      updateUser(data.user);
      setToast("Profile saved.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function savePassword() {
    const errors: Record<string, string> = {};
    if (!current) errors.current = "Enter your current password.";
    if (next.length < 6) errors.next = "Use at least 6 characters.";
    if (next !== confirm) errors.confirm = "Passwords do not match.";
    setPasswordErrors(errors);
    if (Object.keys(errors).length) return;

    setChangingPassword(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPasswordErrors({ current: data.error ?? "Could not change password." });
        return;
      }
      setCurrent("");
      setNext("");
      setConfirm("");
      setToast("Password updated. Use your new password next time you sign in.");
    } finally {
      setChangingPassword(false);
    }
  }

  async function saveNotifications() {
    setSavingNotifications(true);
    try {
      const res = await fetch("/api/settings/notifications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(notifications),
      });
      const data = await res.json();
      if (!res.ok) {
        setToast(data.error ?? "Could not save notification preferences.");
        return;
      }
      if (user) updateUser({ ...user, notifications: data.notifications });
      setToast("Notification preferences saved.");
    } finally {
      setSavingNotifications(false);
    }
  }

  async function savePreferences() {
    setSavingPreferences(true);
    try {
      const res = await fetch("/api/settings/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(preferences),
      });
      const data = await res.json();
      if (!res.ok) {
        setToast(data.error ?? "Could not save CMS preferences.");
        return;
      }
      if (user) updateUser({ ...user, preferences: data.preferences });
      setToast("CMS preferences saved.");
    } finally {
      setSavingPreferences(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Settings"
        description={`Signed in as ${user?.name ?? ""} · ${user ? roleLabel(user.role) : ""}`}
      />

      <InlineAlert tone="info" className="mb-5">
        Every tab here is real — Profile, Password, Notifications, and Preferences all save to
        your row in PostgreSQL and persist across sessions and devices.
      </InlineAlert>

      {toast && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
          {toast}
        </div>
      )}

      <Card>
        <div className="px-5 pt-3">
          <Tabs
            tabs={[
              { label: "Profile", value: "profile" },
              { label: "Password", value: "password" },
              { label: "Notifications", value: "notifications" },
              { label: "Preferences", value: "preferences" },
            ]}
            active={tab}
            onChange={setTab}
          />
        </div>

        {tab === "profile" && (
          <div className="max-w-xl space-y-4 px-5 py-5">
            <FormField label="Full name" required value={name} error={profileErrors.name} onChange={setName} />
            <FormField
              label="Email"
              required
              type="email"
              value={email}
              error={profileErrors.email}
              onChange={setEmail}
            />
            <FormField label="Phone" value={phone} onChange={setPhone} />
            <FormField label="User ID" value={user?.userId ?? ""} onChange={() => {}} disabled />
            <Button variant="primary" onClick={saveProfile} disabled={savingProfile}>
              {savingProfile ? "Saving…" : "Save profile"}
            </Button>
          </div>
        )}

        {tab === "password" && (
          <div className="max-w-xl space-y-4 px-5 py-5">
            <InlineAlert tone="info">
              Enter your current password to set a new one. This updates your real login in the
              database — you&apos;ll use the new password next time you sign in.
            </InlineAlert>
            <FormField
              label="Current password"
              type="password"
              value={current}
              error={passwordErrors.current}
              onChange={setCurrent}
            />
            <FormField
              label="New password"
              type="password"
              value={next}
              error={passwordErrors.next}
              onChange={setNext}
              hint="At least 6 characters."
            />
            <FormField
              label="Confirm new password"
              type="password"
              value={confirm}
              error={passwordErrors.confirm}
              onChange={setConfirm}
            />
            <Button variant="primary" onClick={savePassword} disabled={changingPassword}>
              {changingPassword ? "Changing…" : "Change password"}
            </Button>
          </div>
        )}

        {tab === "notifications" && (
          <div className="max-w-xl px-5 py-5">
            <CardHeader title="Email notifications" />
            <ul className="mt-2 space-y-3">
              {(
                [
                  ["campaignComplete", "When a campaign finishes sending"],
                  ["deliveryFailures", "When delivery failures cross 5%"],
                  ["newInboxMessage", "When a customer replies in the inbox"],
                  ["weeklySummary", "Weekly performance summary"],
                ] as const
              ).map(([key, label]) => (
                <li key={key} className="flex items-center justify-between gap-4">
                  <label htmlFor={key} className="text-sm text-slate-700">
                    {label}
                  </label>
                  <input
                    id={key}
                    type="checkbox"
                    checked={notifications[key]}
                    onChange={(e) =>
                      setNotifications((prev) => ({ ...prev, [key]: e.target.checked }))
                    }
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                </li>
              ))}
            </ul>
            <Button
              variant="primary"
              className="mt-5"
              onClick={saveNotifications}
              disabled={savingNotifications}
            >
              {savingNotifications ? "Saving…" : "Save preferences"}
            </Button>
          </div>
        )}

        {tab === "preferences" && (
          <div className="max-w-xl space-y-4 px-5 py-5">
            <SelectField
              label="Time zone"
              value={preferences.timezone}
              onChange={(v) => setPreferences((p) => ({ ...p, timezone: v }))}
              options={[
                { label: "Asia/Kolkata (IST)", value: "Asia/Kolkata" },
                { label: "Asia/Dubai (GST)", value: "Asia/Dubai" },
                { label: "UTC", value: "UTC" },
              ]}
            />
            <SelectField
              label="Date format"
              value={preferences.dateFormat}
              onChange={(v) => setPreferences((p) => ({ ...p, dateFormat: v }))}
              options={[
                { label: "15 Sep 2026", value: "DD MMM YYYY" },
                { label: "15/09/2026", value: "DD/MM/YYYY" },
                { label: "2026-09-15", value: "YYYY-MM-DD" },
              ]}
            />
            <SelectField
              label="Interface language"
              value={preferences.language}
              onChange={(v) => setPreferences((p) => ({ ...p, language: v }))}
              options={[
                { label: "English", value: "English" },
                { label: "Hindi", value: "Hindi" },
              ]}
            />
            <SelectField
              label="Default contact list"
              value={preferences.defaultList}
              onChange={(v) => setPreferences((p) => ({ ...p, defaultList: v }))}
              options={[
                { label: "All opted-in contacts", value: "All opted-in contacts" },
                { label: "VIP customers", value: "VIP customers" },
                { label: "Festive campaign 2026", value: "Festive campaign 2026" },
              ]}
            />
            <Button variant="primary" onClick={savePreferences} disabled={savingPreferences}>
              {savingPreferences ? "Saving…" : "Save preferences"}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
