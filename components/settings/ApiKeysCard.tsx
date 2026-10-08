"use client";

import { useEffect, useState } from "react";
import { Copy, KeyRound, Trash2 } from "lucide-react";
import Button from "@/components/ui/Button";
import FormField from "@/components/ui/FormField";
import { formatDateTime } from "@/lib/utils";

interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  createdAt: string;
}

/** API keys for the public OTP endpoints + a copy-paste usage guide. */
export default function ApiKeysCard() {
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [reload, setReload] = useState(0);
  // This card only mounts after the Settings tab is clicked (client-side).
  const [origin] = useState(() => (typeof window === "undefined" ? "https://your-app.vercel.app" : window.location.origin));

  useEffect(() => {
    let cancelled = false;
    fetch("/api/api-keys")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setKeys(data.keys ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [reload]);

  async function create() {
    setError(null);
    setCreating(true);
    try {
      const res = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not create the key.");
        return;
      }
      setNewKey(data.key);
      setName("");
      setReload((n) => n + 1);
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string) {
    const res = await fetch(`/api/api-keys/${id}`, { method: "DELETE" });
    if (res.ok) setReload((n) => n + 1);
  }

  async function copyKey() {
    if (!newKey) return;
    try {
      await navigator.clipboard.writeText(newKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked — the key is still selectable on screen
    }
  }

  return (
    <div className="max-w-2xl space-y-6 px-5 py-5">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">API keys</h3>
        <p className="mt-1 text-xs text-slate-500">
          Use a key to send and verify OTP codes over WhatsApp from your own website or app. Keep keys secret —
          anyone with one can send messages from your number.
        </p>
      </div>

      {newKey && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-medium text-amber-900">Copy this key now — it won&apos;t be shown again.</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded bg-white px-2 py-1.5 text-xs text-slate-800">{newKey}</code>
            <Button size="sm" onClick={copyKey}>
              <Copy className="h-3.5 w-3.5" /> {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>
      )}

      <div className="flex items-end gap-2">
        <FormField
          label="New key name"
          className="flex-1"
          value={name}
          onChange={setName}
          placeholder="Website login"
          error={error ?? undefined}
        />
        <Button variant="primary" onClick={create} disabled={creating || !name.trim()} className="mb-0.5">
          <KeyRound className="h-4 w-4" /> Create key
        </Button>
      </div>

      {keys.length === 0 ? (
        <p className="text-sm text-slate-500">No active keys.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {keys.map((k) => (
            <li key={k.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-800">{k.name}</p>
                <p className="font-mono text-xs text-slate-400">
                  {k.prefix}… · created {formatDateTime(k.createdAt)}
                  {k.lastUsedAt ? ` · last used ${formatDateTime(k.lastUsedAt)}` : " · never used"}
                </p>
              </div>
              <button
                type="button"
                aria-label={`Revoke ${k.name}`}
                onClick={() => revoke(k.id)}
                className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div>
        <h3 className="text-sm font-semibold text-slate-900">Send an OTP</h3>
        <p className="mt-1 text-xs text-slate-500">
          First create an Authentication template (Templates → Template type → Authentication / OTP) and wait for
          Meta to approve it. Leave out <code>code</code> and we generate and track it for you.
        </p>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs leading-relaxed text-slate-100">{`curl -X POST ${origin}/api/v1/otp/send \\
  -H "Authorization: Bearer wak_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"to": "919876543210"}'

curl -X POST ${origin}/api/v1/otp/verify \\
  -H "Authorization: Bearer wak_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"to": "919876543210", "code": "123456"}'
# → {"valid": true}`}</pre>
        <p className="mt-2 text-xs text-slate-500">
          Limits: 5 codes per number per hour; a code works once, expires after the template&apos;s expiry and locks after
          5 wrong tries. Add <code>&quot;template&quot;: &quot;name&quot;</code> to pick a specific template.
        </p>
      </div>
    </div>
  );
}
