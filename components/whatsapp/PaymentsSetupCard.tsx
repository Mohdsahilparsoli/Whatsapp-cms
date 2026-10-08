"use client";

import { useEffect, useState } from "react";
import Card, { CardHeader } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import FormField, { SelectField } from "@/components/ui/FormField";

/** Which payment gateway + WhatsApp Manager payment configuration orders use. */
export default function PaymentsSetupCard() {
  const [gateway, setGateway] = useState("razorpay");
  const [configName, setConfigName] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/whatsapp-setup/payments")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setGateway(data.paymentGateway ?? "razorpay");
        setConfigName(data.paymentConfigName ?? "");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/whatsapp-setup/payments", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentGateway: gateway, paymentConfigName: configName }),
      });
      const data = await res.json();
      setMessage(res.ok ? { ok: true, text: "Saved." } : { ok: false, text: data.error ?? "Could not save." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="mt-5">
      <CardHeader
        title="Payments (UPI)"
        description="Take payments inside WhatsApp. Needs WhatsApp Payments enabled by Meta for your account, and a Razorpay or PayU account linked in WhatsApp Manager."
      />
      <div className="space-y-4 px-5 py-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField
            label="Payment gateway"
            value={gateway}
            onChange={setGateway}
            options={[
              { label: "Razorpay", value: "razorpay" },
              { label: "PayU", value: "payu" },
            ]}
          />
          <FormField
            label="Payment configuration name"
            value={configName}
            onChange={setConfigName}
            placeholder="my-razorpay-config"
            hint="The name you gave the gateway in WhatsApp Manager → Payments."
          />
        </div>
        <div className="flex items-center gap-3">
          <Button variant="primary" onClick={save} disabled={saving || !configName.trim()}>
            Save payment settings
          </Button>
          {message && <span className={`text-xs ${message.ok ? "text-emerald-600" : "text-red-600"}`}>{message.text}</span>}
        </div>
      </div>
    </Card>
  );
}
