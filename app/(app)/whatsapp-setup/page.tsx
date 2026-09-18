"use client";

import { useState } from "react";
import { Check, Link2, Loader2, ShieldCheck, Unplug } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import Card, { CardHeader } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import StatusBadge from "@/components/ui/StatusBadge";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import DemoNotice from "@/components/ui/DemoNotice";

const checklist = [
  {
    id: 1,
    title: "Create a Meta Business account",
    detail: "Your business must be registered on Meta Business Suite before onboarding.",
  },
  {
    id: 2,
    title: "Add a WhatsApp Business Account (WABA)",
    detail: "The WABA holds your phone numbers, templates, and messaging limits.",
  },
  {
    id: 3,
    title: "Verify your business",
    detail: "Meta reviews business documents; this usually takes 1–3 working days.",
  },
  {
    id: 4,
    title: "Add and verify a phone number",
    detail: "The number cannot already be active on the WhatsApp consumer app.",
  },
  {
    id: 5,
    title: "Authorize this CMS",
    detail: "You will grant access through Meta's own embedded signup screen.",
  },
];

export default function WhatsAppSetupPage() {
  const [connected, setConnected] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [done, setDone] = useState<number[]>([1, 2, 3, 4]);

  function connect() {
    setConnecting(true);
    setTimeout(() => {
      setConnecting(false);
      setConnected(true);
      setDone([1, 2, 3, 4, 5]);
    }, 900);
  }

  return (
    <div>
      <PageHeader
        title="WhatsApp Account Setup"
        description="Connect the WhatsApp Business account this workspace sends from."
        actions={
          connected ? (
            <Button variant="danger" onClick={() => setConfirmDisconnect(true)}>
              <Unplug className="h-4 w-4" /> Disconnect
            </Button>
          ) : (
            <Button variant="primary" onClick={connect} disabled={connecting}>
              {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              {connecting ? "Connecting…" : "Connect WhatsApp"}
            </Button>
          )
        }
      />

      {/* Hidden for the App Review demo video — restore after review. */}
      {false && (
        <DemoNotice>
          Connection status here is simulated. Real Meta authorization will be added later through
          Meta&apos;s embedded signup flow. This CMS will never ask for your Meta password or an OTP.
        </DemoNotice>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Connection details"
            action={<StatusBadge status={connected ? "active" : "pending"} label={connected ? "Connected (demo)" : "Not connected"} />}
          />
          {connected ? (
            <dl className="grid grid-cols-1 gap-x-8 gap-y-3 px-5 py-4 text-sm sm:grid-cols-2">
              <Detail label="Business account name" value="Demo Client Account" />
              <Detail label="WhatsApp Business Account ID" value="1029384756102938" mono />
              <Detail label="Phone Number ID" value="7788990011223344" mono />
              <Detail label="Display number" value="+91 90000 00000" />
              <Detail label="Quality rating" value="High" />
              <Detail label="Messaging limit" value="10,000 / 24 hours" />
              <Detail label="Display name status" value="Approved" />
              <Detail label="Connected on" value="01 Mar 2026" />
            </dl>
          ) : (
            <div className="px-5 py-10 text-center">
              <p className="text-sm text-slate-600">No WhatsApp account connected yet.</p>
              <p className="mx-auto mt-1 max-w-sm text-xs text-slate-400">
                Connect an account to start sending campaigns. You can finish the checklist first.
              </p>
              <Button variant="primary" className="mt-4" onClick={connect} disabled={connecting}>
                Connect WhatsApp
              </Button>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Setup checklist" description={`${done.length} of ${checklist.length} complete`} />
          <ul className="divide-y divide-slate-100">
            {checklist.map((item) => {
              const complete = done.includes(item.id);
              return (
                <li key={item.id} className="flex gap-3 px-5 py-3">
                  <button
                    type="button"
                    aria-pressed={complete}
                    aria-label={`Mark “${item.title}” as ${complete ? "not done" : "done"}`}
                    onClick={() =>
                      setDone((prev) =>
                        prev.includes(item.id)
                          ? prev.filter((id) => id !== item.id)
                          : [...prev, item.id]
                      )
                    }
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
                      complete
                        ? "border-emerald-500 bg-emerald-500 text-white"
                        : "border-slate-300 text-transparent hover:border-indigo-400"
                    }`}
                  >
                    <Check className="h-3 w-3" />
                  </button>
                  <div>
                    <p className="text-sm font-medium text-slate-800">{item.title}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{item.detail}</p>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="flex gap-2 border-t border-slate-200 px-5 py-3 text-xs text-slate-500">
            <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />
            Meta credentials are entered on Meta&apos;s own website — never in this CMS.
          </div>
        </Card>
      </div>

      <ConfirmDialog
        open={confirmDisconnect}
        title="Disconnect WhatsApp account"
        message="Campaigns will stop sending until an account is reconnected. This is a demo action only."
        confirmLabel="Disconnect"
        destructive
        onConfirm={() => {
          setConnected(false);
          setDone([1, 2, 3, 4]);
        }}
        onClose={() => setConfirmDisconnect(false)}
      />
    </div>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={`mt-0.5 text-slate-800 ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}
