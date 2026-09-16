"use client";

import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import InlineAlert from "@/components/ui/InlineAlert";
import { SelectField } from "@/components/ui/FormField";
import { formatCurrency, formatDate, addYears, startOfToday, toISODate } from "@/lib/utils";
import type { Plan } from "@/types";

type Stage = "review" | "processing" | "done";

/**
 * A simulated checkout. There is no payment gateway here — the flow exists so
 * the demo only reports success after the user actually completes the steps.
 */
export default function CheckoutModal({
  plan,
  open,
  mode = "choose",
  onClose,
  onConfirm,
}: {
  plan: Plan | null;
  open: boolean;
  mode?: "choose" | "upgrade" | "renew";
  onClose: () => void;
  onConfirm: (plan: Plan) => void;
}) {
  const [stage, setStage] = useState<Stage>("review");
  const [method, setMethod] = useState("upi");

  // Reset the flow whenever the modal reopens or the plan changes. Adjusting
  // state during render is React's recommended alternative to a reset effect.
  const resetKey = `${open}:${plan?.id ?? ""}`;
  const [lastKey, setLastKey] = useState(resetKey);
  if (resetKey !== lastKey) {
    setLastKey(resetKey);
    setStage("review");
    setMethod("upi");
  }

  if (!plan) return null;

  const renewsOn = toISODate(addYears(startOfToday(), 1));
  const title =
    mode === "renew"
      ? `Renew ${plan.name}`
      : mode === "upgrade"
        ? `Upgrade to ${plan.name}`
        : `Choose ${plan.name}`;

  function pay() {
    setStage("processing");
    // Simulated processing delay — nothing leaves the browser.
    window.setTimeout(() => setStage("done"), 1100);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={
        stage === "done"
          ? "Demo payment complete"
          : `${formatCurrency(plan.price)} billed yearly`
      }
      size="sm"
      footer={
        stage === "done" ? (
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        ) : (
          <>
            <Button onClick={onClose} disabled={stage === "processing"}>
              Cancel
            </Button>
            <Button variant="primary" onClick={pay} disabled={stage === "processing"}>
              {stage === "processing" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Processing…
                </>
              ) : (
                `Pay ${formatCurrency(plan.price)} (demo)`
              )}
            </Button>
          </>
        )
      }
    >
      {stage === "done" ? (
        <div className="space-y-4">
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <span className="rounded-full bg-emerald-50 p-3 text-emerald-600">
              <CheckCircle2 className="h-6 w-6" />
            </span>
            <p className="text-sm font-medium text-slate-900">
              {plan.name} plan activated
            </p>
            <p className="text-sm text-slate-500">
              Valid until {formatDate(renewsOn)}.
            </p>
          </div>
          <InlineAlert tone="warning">
            Demo only — no payment was taken and no payment gateway is connected.
          </InlineAlert>
          <Button
            variant="primary"
            className="w-full"
            onClick={() => {
              onConfirm(plan);
              onClose();
            }}
          >
            Apply to my subscription
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <dl className="space-y-2 rounded-lg bg-slate-50 px-4 py-3 text-sm">
            <Row label="Plan" value={`${plan.name} (yearly)`} />
            <Row label="Amount" value={formatCurrency(plan.price)} />
            <Row label="Billing cycle" value="Once a year" />
            <Row label="Valid until" value={formatDate(renewsOn)} />
          </dl>

          <SelectField
            label="Payment method"
            value={method}
            onChange={setMethod}
            options={[
              { label: "UPI", value: "upi" },
              { label: "Credit / debit card", value: "card" },
              { label: "Net banking", value: "netbanking" },
            ]}
          />

          <InlineAlert tone="warning">
            This is a simulated checkout. No payment gateway is connected and no
            money is charged. Meta / WhatsApp messaging charges are billed
            separately by Meta.
          </InlineAlert>
        </div>
      )}
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-800">{value}</dd>
    </div>
  );
}
