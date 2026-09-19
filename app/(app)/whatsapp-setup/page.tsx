"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Facebook, KeyRound, Loader2, ShieldCheck, Unplug } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import Card, { CardHeader } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import FormField from "@/components/ui/FormField";
import StatusBadge from "@/components/ui/StatusBadge";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import InlineAlert from "@/components/ui/InlineAlert";
import LoadingState from "@/components/ui/LoadingState";
import { formatDateTime } from "@/lib/utils";

declare global {
  interface Window {
    FB?: {
      init: (opts: { appId: string; autoLogAppEvents?: boolean; xfbml?: boolean; version: string }) => void;
      login: (
        callback: (response: { authResponse?: { code?: string } | null; status?: string }) => void,
        options: Record<string, unknown>
      ) => void;
    };
    fbAsyncInit?: () => void;
  }
}

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
    title: "Connect this CMS",
    detail: "Via Facebook (Embedded Signup) below, or by entering your WABA details manually.",
  },
];

interface SetupStatus {
  checklistDone: number[];
  connected: boolean;
  businessName: string | null;
  wabaId: string | null;
  phoneNumberId: string | null;
  displayNumber: string | null;
  qualityRating: string | null;
  connectedAt: string | null;
  maskedToken: string | null;
}

function loadFacebookSdk(appId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.FB) {
      resolve();
      return;
    }
    window.fbAsyncInit = () => {
      window.FB!.init({ appId, autoLogAppEvents: true, xfbml: false, version: "v21.0" });
      resolve();
    };
    const existing = document.getElementById("facebook-jssdk");
    if (existing) return;
    const script = document.createElement("script");
    script.id = "facebook-jssdk";
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.async = true;
    script.defer = true;
    script.onerror = () => reject(new Error("Could not load the Facebook SDK."));
    document.body.appendChild(script);
  });
}

export default function WhatsAppSetupPage() {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const [manualOpen, setManualOpen] = useState(false);
  const [manualForm, setManualForm] = useState({
    businessName: "",
    wabaId: "",
    phoneNumberId: "",
    accessToken: "",
  });
  const [manualErrors, setManualErrors] = useState<Record<string, string>>({});
  const [savingManual, setSavingManual] = useState(false);

  const pendingCode = useRef<string | null>(null);
  const pendingWaba = useRef<{ wabaId: string; phoneNumberId: string; businessName?: string } | null>(null);

  function load() {
    fetch("/api/whatsapp-setup")
      .then((res) => res.json())
      .then(setStatus)
      .catch(() => setStatus(null))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  // Meta's Embedded Signup popup posts the chosen WABA/phone number here
  // separately from FB.login()'s own callback (which only gives a code) —
  // we need both before we can finish connecting.
  async function finishEmbeddedConnect() {
    if (!pendingCode.current || !pendingWaba.current) return; // wait for both pieces
    setConnecting(true);
    setConnectError(null);
    try {
      const res = await fetch("/api/whatsapp-setup/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: pendingCode.current,
          wabaId: pendingWaba.current.wabaId,
          phoneNumberId: pendingWaba.current.phoneNumberId,
          businessName: pendingWaba.current.businessName,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setConnectError(data.error ?? "Could not complete the connection.");
        return;
      }
      load();
    } finally {
      pendingCode.current = null;
      pendingWaba.current = null;
      setConnecting(false);
    }
  }

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (!event.origin.endsWith("facebook.com")) return;
      let data: { type?: string; event?: string; data?: Record<string, string> };
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      if (data.type !== "WA_EMBEDDED_SIGNUP") return;
      if (data.event === "FINISH" || data.event === "FINISH_ONLY_WABA") {
        pendingWaba.current = {
          wabaId: data.data?.waba_id ?? "",
          phoneNumberId: data.data?.phone_number_id ?? "",
          businessName: data.data?.business_name,
        };
        finishEmbeddedConnect();
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function connectViaFacebook() {
    const appId = process.env.NEXT_PUBLIC_META_APP_ID;
    const configId = process.env.NEXT_PUBLIC_META_CONFIG_ID;
    if (!appId || !configId) {
      setConnectError(
        "NEXT_PUBLIC_META_APP_ID and NEXT_PUBLIC_META_CONFIG_ID are not configured in .env — see README-BACKEND.md for Embedded Signup setup."
      );
      return;
    }

    setConnectError(null);
    try {
      await loadFacebookSdk(appId);
    } catch {
      setConnectError("Could not load Facebook's login SDK. Check your internet connection.");
      return;
    }

    window.FB!.login(
      (response) => {
        if (response.authResponse?.code) {
          pendingCode.current = response.authResponse.code;
          finishEmbeddedConnect();
        } else {
          setConnectError("Facebook login was cancelled or did not complete.");
        }
      },
      {
        config_id: configId,
        response_type: "code",
        override_default_response_type: true,
        extras: {
          setup: {},
          featureType: "whatsapp_business_app_onboarding",
          sessionInfoVersion: "3",
        },
      }
    );
  }

  async function submitManual() {
    const errors: Record<string, string> = {};
    if (!manualForm.wabaId.trim()) errors.wabaId = "Required.";
    if (!manualForm.phoneNumberId.trim()) errors.phoneNumberId = "Required.";
    if (!manualForm.accessToken.trim()) errors.accessToken = "Required.";
    setManualErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSavingManual(true);
    try {
      const res = await fetch("/api/whatsapp-setup/connect-manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(manualForm),
      });
      const data = await res.json();
      if (!res.ok) {
        setManualErrors(data.errors ?? { accessToken: data.error ?? "Could not connect." });
        return;
      }
      setManualOpen(false);
      setManualForm({ businessName: "", wabaId: "", phoneNumberId: "", accessToken: "" });
      load();
    } finally {
      setSavingManual(false);
    }
  }

  async function disconnect() {
    const res = await fetch("/api/whatsapp-setup/disconnect", { method: "POST" });
    if (res.ok) load();
  }

  async function toggleChecklistItem(id: number) {
    if (!status) return;
    const next = status.checklistDone.includes(id)
      ? status.checklistDone.filter((n) => n !== id)
      : [...status.checklistDone, id];
    setStatus({ ...status, checklistDone: next });
    await fetch("/api/whatsapp-setup/checklist", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checklistDone: next }),
    });
  }

  const connected = status?.connected ?? false;

  return (
    <div>
      <PageHeader
        title="WhatsApp Account Setup"
        description="Connect the real WhatsApp Business account this workspace sends from."
        actions={
          connected ? (
            <Button variant="danger" onClick={() => setConfirmDisconnect(true)}>
              <Unplug className="h-4 w-4" /> Disconnect
            </Button>
          ) : null
        }
      />

      <InlineAlert tone="info" className="mb-5">
        Two real ways to connect: <strong>Connect via Facebook</strong> (Embedded Signup — needs
        Meta App Review approved first) or <strong>Enter manually</strong> (works today — paste
        your WABA ID, Phone Number ID, and access token from Meta&apos;s API Setup page; we verify
        them against Meta before saving). Credentials are encrypted at rest and never shown in
        full again.
      </InlineAlert>

      {connectError && (
        <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {connectError}
        </div>
      )}

      {loading ? (
        <LoadingState rows={3} label="Loading connection status" />
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader
              title="Connection details"
              action={
                <StatusBadge
                  status={connected ? "active" : "pending"}
                  label={connected ? "Connected" : "Not connected"}
                />
              }
            />
            {connected && status ? (
              <dl className="grid grid-cols-1 gap-x-8 gap-y-3 px-5 py-4 text-sm sm:grid-cols-2">
                <Detail label="Business account name" value={status.businessName ?? "—"} />
                <Detail label="WhatsApp Business Account ID" value={status.wabaId ?? "—"} mono />
                <Detail label="Phone Number ID" value={status.phoneNumberId ?? "—"} mono />
                <Detail label="Display number" value={status.displayNumber ?? "—"} />
                <Detail label="Quality rating" value={status.qualityRating ?? "—"} />
                <Detail label="Access token" value={status.maskedToken ?? "—"} mono />
                <Detail
                  label="Connected on"
                  value={status.connectedAt ? formatDateTime(status.connectedAt) : "—"}
                />
              </dl>
            ) : (
              <div className="px-5 py-10 text-center">
                <p className="text-sm text-slate-600">No WhatsApp account connected yet.</p>
                <p className="mx-auto mt-1 max-w-sm text-xs text-slate-400">
                  Connect an account to start sending campaigns from your own number.
                </p>
                <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                  <Button variant="primary" onClick={connectViaFacebook} disabled={connecting}>
                    {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Facebook className="h-4 w-4" />}
                    {connecting ? "Connecting…" : "Connect via Facebook"}
                  </Button>
                  <Button onClick={() => setManualOpen(true)} disabled={connecting}>
                    <KeyRound className="h-4 w-4" /> Enter manually
                  </Button>
                </div>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Setup checklist"
              description={`${status?.checklistDone.length ?? 0} of ${checklist.length} complete`}
            />
            <ul className="divide-y divide-slate-100">
              {checklist.map((item) => {
                const complete = status?.checklistDone.includes(item.id) ?? false;
                return (
                  <li key={item.id} className="flex gap-3 px-5 py-3">
                    <button
                      type="button"
                      aria-pressed={complete}
                      aria-label={`Mark "${item.title}" as ${complete ? "not done" : "done"}`}
                      onClick={() => toggleChecklistItem(item.id)}
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
              Your access token is encrypted before it&apos;s stored, and never shown in full again.
            </div>
          </Card>
        </div>
      )}

      {/* Manual entry */}
      <Modal
        open={manualOpen}
        onClose={() => !savingManual && setManualOpen(false)}
        title="Enter WhatsApp details manually"
        description="From your Meta App → WhatsApp → API Setup page."
        footer={
          <>
            <Button onClick={() => setManualOpen(false)} disabled={savingManual}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submitManual} disabled={savingManual}>
              {savingManual ? "Verifying with Meta…" : "Connect"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormField
            label="Business name"
            value={manualForm.businessName}
            onChange={(v) => setManualForm((f) => ({ ...f, businessName: v }))}
            placeholder="Optional — we'll use Meta's verified name if left blank"
          />
          <FormField
            label="WhatsApp Business Account ID"
            required
            value={manualForm.wabaId}
            error={manualErrors.wabaId}
            onChange={(v) => setManualForm((f) => ({ ...f, wabaId: v }))}
          />
          <FormField
            label="Phone Number ID"
            required
            value={manualForm.phoneNumberId}
            error={manualErrors.phoneNumberId}
            onChange={(v) => setManualForm((f) => ({ ...f, phoneNumberId: v }))}
          />
          <FormField
            label="Access token"
            required
            type="password"
            value={manualForm.accessToken}
            error={manualErrors.accessToken}
            onChange={(v) => setManualForm((f) => ({ ...f, accessToken: v }))}
            hint="We verify this with Meta before saving — it's never shown again after that."
          />
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmDisconnect}
        title="Disconnect WhatsApp account"
        message="Campaigns and messages will stop sending from this number until you reconnect."
        confirmLabel="Disconnect"
        destructive
        onConfirm={disconnect}
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
