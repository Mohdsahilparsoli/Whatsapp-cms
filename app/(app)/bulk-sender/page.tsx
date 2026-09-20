"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FileText, Loader2, Send } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import Card, { CardHeader } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import FormField, { SelectField } from "@/components/ui/FormField";
import Modal from "@/components/ui/Modal";
import EmptyState from "@/components/ui/EmptyState";
import LoadingState from "@/components/ui/LoadingState";
import TemplatePreview from "@/components/templates/TemplatePreview";
import { useCustomTemplates } from "@/lib/customTemplates";
import { getPageMeta } from "@/lib/nav";
import { cn, formatNumber } from "@/lib/utils";
import type { Contact } from "@/types";

interface SendResult {
  total: number;
  sent: number;
  failed: number;
  skipped: number;
}

export default function BulkSenderPage() {
  const meta = getPageMeta("/bulk-sender");
  const { views: customViews, loading: templatesLoading } = useCustomTemplates();

  // Only saved (non-draft) custom templates can actually be sent — see
  // app/api/bulk-send/route.ts for why Meta-Approved isn't offered here yet.
  const templateOptions = useMemo(
    () => customViews.filter((t) => t.status === "custom"),
    [customViews]
  );

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(true);
  const [tag, setTag] = useState("all");

  const [templateId, setTemplateId] = useState("");
  const [variables, setVariables] = useState<string[]>([]);

  const [reviewOpen, setReviewOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [result, setResult] = useState<SendResult | null>(null);

  useEffect(() => {
    fetch("/api/contacts")
      .then((res) => res.json())
      .then((data) => setContacts(data.contacts ?? []))
      .catch(() => setContacts([]))
      .finally(() => setContactsLoading(false));
  }, []);

  const allTags = useMemo(
    () => Array.from(new Set(contacts.flatMap((c) => c.tags))).sort(),
    [contacts]
  );

  // Only real, opted-in contacts count as the audience — no fake exclusion
  // rate, this reflects each contact's actual consent status.
  const audience = useMemo(
    () =>
      contacts.filter(
        (c) => c.consent === "opted_in" && (tag === "all" || c.tags.includes(tag))
      ),
    [contacts, tag]
  );
  const excludedOptOut = contacts.filter(
    (c) => c.consent !== "opted_in" && (tag === "all" || c.tags.includes(tag))
  ).length;

  const template = templateOptions.find((t) => t.id === templateId) ?? templateOptions[0] ?? null;

  function openReview() {
    setSendError(null);
    setResult(null);
    setReviewOpen(true);
  }

  async function confirmSend() {
    if (!template || audience.length === 0) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch("/api/bulk-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactIds: audience.map((c) => c.id),
          templateId: template.id,
          variables,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSendError(data.error ?? "Could not send.");
        return;
      }
      setResult(data);
      setReviewOpen(false);
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <PageHeader title={meta.title} description="Send a real WhatsApp message to a group of your contacts." />

      {result && (
        <Card className="mb-5">
          <CardHeader title="Last send result" />
          <div className="space-y-3 px-5 py-4">
            <div className="flex flex-wrap gap-6 text-sm">
              <span>
                Total: <strong>{result.total}</strong>
              </span>
              <span className="text-emerald-700">
                Sent: <strong>{result.sent}</strong>
              </span>
              <span className="text-red-700">
                Failed: <strong>{result.failed}</strong>
              </span>
              {result.skipped > 0 && (
                <span className="text-slate-500">
                  Skipped (not opted in): <strong>{result.skipped}</strong>
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500">
              This send went through the real queue — see{" "}
              <Link href="/queue" className="text-indigo-600 underline">
                Queue &amp; Rate Limiting
              </Link>{" "}
              for per-batch detail and to retry any failed batch.
            </p>
            <Button size="sm" onClick={() => setResult(null)}>
              Dismiss
            </Button>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {/* Audience */}
          <Card>
            <CardHeader
              title="Audience"
              description="Only opted-in contacts are included — filter by tag if you like."
            />
            <div className="space-y-4 px-5 py-4">
              {contactsLoading ? (
                <LoadingState rows={2} label="Loading contacts" />
              ) : (
                <>
                  <SelectField
                    label="Tag filter"
                    value={tag}
                    onChange={setTag}
                    options={[
                      { label: "All contacts", value: "all" },
                      ...allTags.map((t) => ({ label: t, value: t })),
                    ]}
                  />
                  <div className="flex flex-wrap gap-6 rounded-lg bg-slate-50 px-4 py-3">
                    <Stat label="Opted in (will receive)" value={formatNumber(audience.length)} highlight />
                    <Stat label="Excluded (not opted in)" value={formatNumber(excludedOptOut)} />
                  </div>
                </>
              )}
            </div>
          </Card>

          {/* Template */}
          <Card>
            <CardHeader
              title="Template"
              description="Only your saved (non-draft) custom templates can be sent."
            />
            <div className="space-y-4 px-5 py-4">
              {templatesLoading ? (
                <LoadingState rows={2} label="Loading templates" />
              ) : templateOptions.length === 0 ? (
                <EmptyState
                  icon={FileText}
                  title="No sendable templates yet"
                  description="Create a custom template and save it (not as a draft) to use it here."
                  action={
                    <Link href="/templates">
                      <Button variant="primary">Go to Templates</Button>
                    </Link>
                  }
                />
              ) : (
                <>
                  <SelectField
                    label="Custom template"
                    value={template?.id ?? ""}
                    onChange={(value) => {
                      setTemplateId(value);
                      setVariables([]);
                      setResult(null);
                    }}
                    options={templateOptions.map((item) => ({
                      label: `${item.name} · ${item.language}`,
                      value: item.id,
                    }))}
                  />

                  {template && template.variables.length > 0 && (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {template.variables.map((variable, index) => (
                        <FormField
                          key={`${template.id}-${index}`}
                          label={`{{${index + 1}}} — ${variable || `Value ${index + 1}`}`}
                          value={variables[index] ?? ""}
                          onChange={(value) =>
                            setVariables((prev) => {
                              const next = [...prev];
                              next[index] = value;
                              return next;
                            })
                          }
                          placeholder="Same value sent to everyone"
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </Card>
        </div>

        {/* Preview + summary */}
        <Card className="h-fit lg:sticky lg:top-20">
          <CardHeader title="Message preview" />
          <div className="px-5 py-4">
            {template ? (
              <>
                <TemplatePreview
                  header={template.header}
                  body={template.body}
                  footer={template.footer}
                  media={template.media}
                  buttons={template.buttons}
                  values={variables}
                  emptyHint="This template has no message body."
                />

                <dl className="mt-4 space-y-2 text-sm">
                  <SummaryRow label="Recipients" value={formatNumber(audience.length)} />
                  <SummaryRow label="Template" value={template.name} mono />
                </dl>

                <Button
                  variant="primary"
                  className="mt-4 w-full"
                  onClick={openReview}
                  disabled={audience.length === 0}
                >
                  <Send className="h-4 w-4" /> Review and send
                </Button>
                {audience.length === 0 && !contactsLoading && (
                  <p className="mt-2 text-xs text-slate-400">
                    No opted-in contacts match this filter.
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-slate-500">Pick a template to see the preview.</p>
            )}
          </div>
        </Card>
      </div>

      {/* Review step */}
      <Modal
        open={reviewOpen}
        onClose={() => !sending && setReviewOpen(false)}
        title="Review before sending"
        description="This sends real WhatsApp messages — check the details below."
        size="sm"
        footer={
          <>
            <Button onClick={() => setReviewOpen(false)} disabled={sending}>
              Back
            </Button>
            <Button variant="primary" onClick={confirmSend} disabled={sending}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {sending ? "Sending…" : "Send now"}
            </Button>
          </>
        }
      >
        {template && (
          <div className="space-y-4">
            <dl className="space-y-2 rounded-lg bg-slate-50 px-4 py-3 text-sm">
              <SummaryRow label="Recipients" value={formatNumber(audience.length)} />
              <SummaryRow label="Template" value={template.name} mono />
              <SummaryRow label="Tag filter" value={tag === "all" ? "All contacts" : tag} />
            </dl>

            <TemplatePreview
              header={template.header}
              body={template.body}
              footer={template.footer}
              media={template.media}
              buttons={template.buttons}
              values={variables}
            />

            {sendError && (
              <p role="alert" className="text-sm text-red-600">
                {sendError}
              </p>
            )}

          </div>
        )}
      </Modal>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={cn("mt-0.5 text-sm font-semibold", highlight ? "text-indigo-600" : "text-slate-800")}>
        {value}
      </p>
    </div>
  );
}

function SummaryRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className={cn("text-right text-slate-800", mono && "font-mono text-xs")}>{value}</dd>
    </div>
  );
}
