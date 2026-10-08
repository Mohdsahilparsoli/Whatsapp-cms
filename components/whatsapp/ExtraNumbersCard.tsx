"use client";

import { useCallback, useEffect, useState } from "react";
import { Phone, Plus, Trash2 } from "lucide-react";
import Card, { CardHeader } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import FormField from "@/components/ui/FormField";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

interface ExtraNumber {
  id: string;
  label: string | null;
  wabaId: string;
  phoneNumberId: string;
  displayNumber: string | null;
  businessName: string | null;
  qualityRating: string | null;
}

const EMPTY = { label: "", wabaId: "", phoneNumberId: "", accessToken: "" };

/** Additional WhatsApp numbers for this workspace (the main one is above). */
export default function ExtraNumbersCard() {
  const [numbers, setNumbers] = useState<ExtraNumber[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [removeId, setRemoveId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/whatsapp-setup/numbers");
      if (res.ok) setNumbers((await res.json()).numbers ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function submit() {
    const next: Record<string, string> = {};
    if (!form.wabaId.trim()) next.wabaId = "Required.";
    if (!form.phoneNumberId.trim()) next.phoneNumberId = "Required.";
    if (!form.accessToken.trim()) next.accessToken = "Required.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSaving(true);
    try {
      const res = await fetch("/api/whatsapp-setup/numbers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrors(data.errors ?? { accessToken: data.error ?? "Could not add this number." });
        return;
      }
      setOpen(false);
      setForm(EMPTY);
      load();
    } finally {
      setSaving(false);
    }
  }

  async function makePrimary(id: string) {
    const res = await fetch(`/api/whatsapp-setup/numbers/${id}/make-primary`, { method: "POST" });
    if (res.ok) {
      // The main connection card above shows the old number — reload to refresh it.
      window.location.reload();
    }
  }

  async function remove() {
    if (!removeId) return;
    const res = await fetch(`/api/whatsapp-setup/numbers/${removeId}`, { method: "DELETE" });
    if (res.ok) load();
  }

  return (
    <>
      <Card className="mt-5">
        <CardHeader
          title="Additional numbers"
          description="Replies go out from the number the customer wrote to. Campaigns and bulk sends use your main number — tap Make main to switch it."
          action={
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" /> Add number
            </Button>
          }
        />
        {loading ? null : numbers.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-500">No extra numbers yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {numbers.map((n) => (
              <li key={n.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <Phone className="h-4 w-4 shrink-0 text-slate-400" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-800">
                    {n.label || n.businessName || n.displayNumber || "WhatsApp number"}
                    {n.displayNumber && (n.label || n.businessName) ? (
                      <span className="ml-2 font-normal text-slate-500">{n.displayNumber}</span>
                    ) : null}
                  </p>
                  <p className="truncate font-mono text-xs text-slate-400">
                    {n.phoneNumberId}
                    {n.qualityRating ? ` · ${n.qualityRating}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => makePrimary(n.id)}
                  className="shrink-0 rounded px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50"
                >
                  Make main
                </button>
                <button
                  type="button"
                  aria-label="Remove number"
                  onClick={() => setRemoveId(n.id)}
                  className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        open={open}
        onClose={() => !saving && setOpen(false)}
        title="Add another WhatsApp number"
        description="From your Meta App → WhatsApp → API Setup page. We verify it with Meta before saving."
        footer={
          <>
            <Button onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submit} disabled={saving}>
              {saving ? "Verifying with Meta…" : "Add number"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormField
            label="Label"
            value={form.label}
            onChange={(v) => setForm((f) => ({ ...f, label: v }))}
            placeholder="Optional — e.g. Support, Sales"
          />
          <FormField
            label="WhatsApp Business Account ID"
            required
            value={form.wabaId}
            error={errors.wabaId}
            onChange={(v) => setForm((f) => ({ ...f, wabaId: v }))}
          />
          <FormField
            label="Phone Number ID"
            required
            value={form.phoneNumberId}
            error={errors.phoneNumberId}
            onChange={(v) => setForm((f) => ({ ...f, phoneNumberId: v }))}
          />
          <FormField
            label="Access token"
            required
            type="password"
            value={form.accessToken}
            error={errors.accessToken}
            onChange={(v) => setForm((f) => ({ ...f, accessToken: v }))}
          />
        </div>
      </Modal>

      <ConfirmDialog
        open={removeId !== null}
        title="Remove this number"
        message="Chats that used it will reply from your main number instead."
        confirmLabel="Remove"
        destructive
        onConfirm={remove}
        onClose={() => setRemoveId(null)}
      />
    </>
  );
}
