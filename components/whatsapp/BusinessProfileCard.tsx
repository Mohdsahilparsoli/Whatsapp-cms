"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import Card, { CardHeader } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import FormField from "@/components/ui/FormField";

interface Profile {
  about: string;
  address: string;
  description: string;
  email: string;
  websites: string[];
  vertical: string;
  profilePictureUrl: string | null;
}

/** Edit the public WhatsApp Business Profile + register the number / set its PIN. */
export default function BusinessProfileCard() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [verticals, setVerticals] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const [pin, setPin] = useState("");
  const [code, setCode] = useState("");
  const [regBusy, setRegBusy] = useState(false);
  const [regMessage, setRegMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/whatsapp-setup/profile")
      .then(async (res) => ({ ok: res.ok, data: await res.json() }))
      .then(({ ok, data }) => {
        if (cancelled) return;
        if (!ok) {
          setLoadError(data.error ?? "Could not load the profile.");
          return;
        }
        setProfile(data.profile);
        setVerticals(data.verticals ?? []);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Could not load the profile.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    if (!profile) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/whatsapp-setup/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      const data = await res.json();
      setMessage(res.ok ? { ok: true, text: "Profile updated on WhatsApp." } : { ok: false, text: data.error ?? "Could not save." });
    } finally {
      setSaving(false);
    }
  }

  async function register(action: "request_code" | "verify_code" | "register") {
    setRegBusy(true);
    setRegMessage(null);
    try {
      const res = await fetch("/api/whatsapp-setup/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, pin, code }),
      });
      const data = await res.json();
      const done: Record<string, string> = {
        request_code: "Code sent to the number by SMS.",
        verify_code: "Number verified.",
        register: "Number registered and PIN saved.",
      };
      setRegMessage(res.ok ? { ok: true, text: done[action] } : { ok: false, text: data.error ?? "Failed." });
    } finally {
      setRegBusy(false);
    }
  }

  const setField = (patch: Partial<Profile>) => setProfile((p) => (p ? { ...p, ...patch } : p));

  return (
    <Card className="mt-5">
      <CardHeader
        title="Business profile"
        description="What customers see when they open your WhatsApp business profile."
      />
      {loadError ? (
        <p className="px-5 py-5 text-sm text-slate-500">{loadError}</p>
      ) : !profile ? (
        <p className="px-5 py-5 text-sm text-slate-400">Loading…</p>
      ) : (
        <div className="space-y-4 px-5 py-4">
          <FormField label="About" value={profile.about} onChange={(v) => setField({ about: v })} hint="Up to 139 characters." />
          <div>
            <label className="block text-sm font-medium text-slate-700">Description</label>
            <textarea
              value={profile.description}
              onChange={(e) => setField({ description: e.target.value })}
              rows={3}
              maxLength={512}
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Email" value={profile.email} onChange={(v) => setField({ email: v })} />
            <FormField label="Address" value={profile.address} onChange={(v) => setField({ address: v })} />
            <FormField
              label="Website 1"
              value={profile.websites[0] ?? ""}
              onChange={(v) => setField({ websites: [v, profile.websites[1] ?? ""] })}
              placeholder="https://"
            />
            <FormField
              label="Website 2"
              value={profile.websites[1] ?? ""}
              onChange={(v) => setField({ websites: [profile.websites[0] ?? "", v] })}
              placeholder="https://"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Category</label>
            <select
              value={profile.vertical}
              onChange={(e) => setField({ vertical: e.target.value })}
              className="mt-1.5 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100 sm:w-72"
            >
              {verticals.map((v) => (
                <option key={v} value={v}>
                  {v.replace(/_/g, " ").toLowerCase()}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="primary" onClick={save} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save profile
            </Button>
            {message && <span className={`text-xs ${message.ok ? "text-emerald-600" : "text-red-600"}`}>{message.text}</span>}
          </div>
          <p className="text-xs text-slate-400">The profile photo is changed in WhatsApp Manager, not here.</p>
        </div>
      )}

      <div className="border-t border-slate-200 px-5 py-4">
        <p className="text-sm font-medium text-slate-800">Number registration &amp; PIN</p>
        <p className="mt-0.5 text-xs text-slate-500">
          Only needed for a new number, or to set / change its 6-digit two-step PIN.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <FormField label="6-digit PIN" type="password" value={pin} onChange={setPin} />
          <FormField label="SMS code (if verifying)" value={code} onChange={setCode} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button onClick={() => register("request_code")} disabled={regBusy}>
            Send SMS code
          </Button>
          <Button onClick={() => register("verify_code")} disabled={regBusy}>
            Verify code
          </Button>
          <Button variant="primary" onClick={() => register("register")} disabled={regBusy}>
            Register / set PIN
          </Button>
          {regMessage && <span className={`text-xs ${regMessage.ok ? "text-emerald-600" : "text-red-600"}`}>{regMessage.text}</span>}
        </div>
      </div>
    </Card>
  );
}
