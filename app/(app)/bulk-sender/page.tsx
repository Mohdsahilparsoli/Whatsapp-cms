"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarClock, FileText, Send } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import Card, { CardHeader } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import FormField, { SelectField } from "@/components/ui/FormField";
import Modal from "@/components/ui/Modal";
import DemoNotice from "@/components/ui/DemoNotice";
import InlineAlert from "@/components/ui/InlineAlert";
import EmptyState from "@/components/ui/EmptyState";
import TemplatePreview from "@/components/templates/TemplatePreview";
import TemplateSourceBadge from "@/components/templates/TemplateSourceBadge";
import { contactLists } from "@/data/contacts";
import { useCampaignStore, scheduleLabel, validateSchedule } from "@/lib/campaignStore";
import { metaTemplateViews, useCustomTemplates } from "@/lib/customTemplates";
import { getPageMeta } from "@/lib/nav";
import { cn, formatDateTime, formatNumber, nowForInput } from "@/lib/utils";
import type { TemplateSource, TemplateView } from "@/types";

type SendMode = "now" | "schedule";

/** 4% of every mock list is opted out and excluded from sending. */
const OPT_OUT_RATE = 0.04;

export default function BulkSenderPage() {
  const meta = getPageMeta("/bulk-sender");
  const { views: customViews } = useCustomTemplates();
  const { add } = useCampaignStore();

  // Only approved Meta templates and finished (non-draft) custom templates can
  // be sent — drafts are still work in progress.
  const metaOptions = useMemo(
    () => metaTemplateViews.filter((template) => template.status === "approved"),
    []
  );
  const customOptions = useMemo(
    () => customViews.filter((template) => template.status === "custom"),
    [customViews]
  );

  const [source, setSource] = useState<TemplateSource>("meta");
  const [listId, setListId] = useState(contactLists[0].id);
  const [templateId, setTemplateId] = useState(metaOptions[0]?.id ?? "");
  const [variables, setVariables] = useState<string[]>([]);
  const [mode, setMode] = useState<SendMode>("now");
  const [scheduledAt, setScheduledAt] = useState("");
  const [campaignName, setCampaignName] = useState("");

  const [reviewOpen, setReviewOpen] = useState(false);
  const [errors, setErrors] = useState<{ variables?: string; schedule?: string; name?: string }>({});
  const [result, setResult] = useState<{ tone: "success"; message: string } | null>(null);

  const options = source === "meta" ? metaOptions : customOptions;
  // Falls back to the first option so switching libraries never leaves a stale
  // or empty selection — no syncing effect needed.
  const template: TemplateView | null =
    options.find((item) => item.id === templateId) ?? options[0] ?? null;

  const list = contactLists.find((item) => item.id === listId) ?? contactLists[0];
  const excluded = Math.round(list.count * OPT_OUT_RATE);
  const recipients = list.count - excluded;

  function resetResult() {
    setResult(null);
  }

  function openReview() {
    if (!template) return;
    const next: typeof errors = {};

    const missing = template.variables.some((_, i) => !variables[i]?.trim());
    if (missing)
      next.variables =
        "Add a sample value for every variable so you can check the preview.";

    if (mode === "schedule") {
      const scheduleError = validateSchedule(scheduledAt);
      if (scheduleError) next.schedule = scheduleError;
      if (!campaignName.trim())
        next.name = "Name the campaign so you can find it in Campaign Management.";
    }

    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setReviewOpen(true);
  }

  function confirm() {
    if (!template) return;

    if (mode === "schedule") {
      add({
        name: campaignName.trim(),
        audience: list.name,
        audienceSize: recipients,
        templateId: template.id,
        templateName: template.name,
        templateSource: template.source,
        schedule: scheduleLabel(scheduledAt),
        scheduledAt,
        status: "scheduled",
      });
      setResult({
        tone: "success",
        message: `“${campaignName.trim()}” is scheduled for ${formatDateTime(
          scheduledAt
        )} to ${formatNumber(recipients)} recipients. This is a demo schedule — no WhatsApp API call is made.`,
      });
    } else {
      setResult({
        tone: "success",
        message: `Simulated send to ${formatNumber(recipients)} contacts in “${
          list.name
        }” using “${template.name}”. No messages were sent.`,
      });
    }

    setReviewOpen(false);
  }

  return (
    <div>
      <PageHeader title={meta.title} description={meta.description} />

      <DemoNotice>
        Sending is simulated. No messages are sent and no WhatsApp API call is made.
      </DemoNotice>

      {result && (
        <InlineAlert
          tone="success"
          className="mb-5"
          action={
            <>
              {mode === "schedule" && (
                <Link href="/campaigns">
                  <Button size="sm">View campaign</Button>
                </Link>
              )}
              <Button size="sm" onClick={resetResult}>
                Dismiss
              </Button>
            </>
          }
        >
          {result.message}
        </InlineAlert>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {/* Audience */}
          <Card>
            <CardHeader
              title="Audience / contact list"
              description="Opted-out contacts are excluded automatically."
            />
            <div className="space-y-4 px-5 py-4">
              <SelectField
                label="Contact list"
                value={listId}
                onChange={(value) => {
                  setListId(value);
                  resetResult();
                }}
                options={contactLists.map((item) => ({
                  label: `${item.name} (${formatNumber(item.count)})`,
                  value: item.id,
                }))}
              />
              <div className="flex flex-wrap gap-6 rounded-lg bg-slate-50 px-4 py-3">
                <Stat label="In list" value={formatNumber(list.count)} />
                <Stat
                  label="Opted out (excluded)"
                  value={formatNumber(excluded)}
                />
                <Stat
                  label="Will receive"
                  value={formatNumber(recipients)}
                  highlight
                />
              </div>
            </div>
          </Card>

          {/* Template */}
          <Card>
            <CardHeader
              title="Template"
              description="Choose a Meta-approved template or one of your own custom templates."
            />
            <div className="space-y-4 px-5 py-4">
              <div>
                <p className="mb-1.5 block text-sm font-medium text-slate-700">
                  Template type
                </p>
                <div className="flex flex-wrap gap-2">
                  <TypeButton
                    active={source === "meta"}
                    onClick={() => {
                      setSource("meta");
                      setVariables([]);
                      setErrors({});
                      resetResult();
                    }}
                    label="Meta-Approved Template"
                    count={metaOptions.length}
                  />
                  <TypeButton
                    active={source === "custom"}
                    onClick={() => {
                      setSource("custom");
                      setVariables([]);
                      setErrors({});
                      resetResult();
                    }}
                    label="My Custom Templates"
                    count={customOptions.length}
                  />
                </div>
                <p className="mt-2 text-xs text-slate-400">
                  {source === "meta"
                    ? "Approved by Meta and safe to use for broadcasts."
                    : "Only your account's custom templates are listed here. Drafts are not sendable."}
                </p>
              </div>

              {options.length === 0 ? (
                <EmptyState
                  icon={FileText}
                  title="No custom templates ready to send"
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
                    label={
                      source === "meta" ? "Approved template" : "Custom template"
                    }
                    value={template?.id ?? ""}
                    onChange={(value) => {
                      setTemplateId(value);
                      setVariables([]);
                      setErrors({});
                      resetResult();
                    }}
                    options={options.map((item) => ({
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
                          placeholder="Sample value"
                        />
                      ))}
                    </div>
                  )}

                  {errors.variables && (
                    <p role="alert" className="text-xs text-red-600">
                      {errors.variables}
                    </p>
                  )}
                </>
              )}
            </div>
          </Card>

          {/* Delivery */}
          <Card>
            <CardHeader
              title="Delivery"
              description="Send straight away or schedule it for later."
            />
            <div className="space-y-4 px-5 py-4">
              <div className="flex flex-wrap gap-2">
                <TypeButton
                  active={mode === "now"}
                  onClick={() => {
                    setMode("now");
                    setErrors({});
                    resetResult();
                  }}
                  label="Send Now"
                  icon={Send}
                />
                <TypeButton
                  active={mode === "schedule"}
                  onClick={() => {
                    setMode("schedule");
                    setErrors({});
                    resetResult();
                    if (!campaignName && template)
                      setCampaignName(`${template.name} — ${list.name}`);
                  }}
                  label="Schedule"
                  icon={CalendarClock}
                />
              </div>

              {mode === "schedule" && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <FormField
                    label="Campaign name"
                    required
                    value={campaignName}
                    onChange={setCampaignName}
                    error={errors.name}
                    placeholder="Festive reminder — VIP list"
                  />
                  <FormField
                    label="Send at"
                    type="datetime-local"
                    required
                    value={scheduledAt}
                    onChange={(value) => {
                      setScheduledAt(value);
                      setErrors((prev) => ({ ...prev, schedule: undefined }));
                    }}
                    error={errors.schedule}
                    hint={`Must be later than ${formatDateTime(nowForInput())}.`}
                  />
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Preview + summary */}
        <Card className="h-fit lg:sticky lg:top-20">
          <CardHeader
            title="Message preview"
            action={template && <TemplateSourceBadge source={template.source} />}
          />
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
                  <SummaryRow label="Recipients" value={formatNumber(recipients)} />
                  <SummaryRow label="Template" value={template.name} mono />
                  <SummaryRow
                    label="Type"
                    value={
                      template.source === "meta" ? "Meta-Approved" : "Custom"
                    }
                  />
                  <SummaryRow
                    label="Delivery"
                    value={
                      mode === "now"
                        ? "Send now (simulated)"
                        : scheduledAt
                          ? formatDateTime(scheduledAt)
                          : "Not scheduled yet"
                    }
                  />
                </dl>

                <Button
                  variant="primary"
                  className="mt-4 w-full"
                  onClick={openReview}
                >
                  {mode === "now" ? (
                    <>
                      <Send className="h-4 w-4" /> Review and send
                    </>
                  ) : (
                    <>
                      <CalendarClock className="h-4 w-4" /> Review and schedule
                    </>
                  )}
                </Button>
              </>
            ) : (
              <p className="text-sm text-slate-500">
                Pick a template to see the preview.
              </p>
            )}
          </div>
        </Card>
      </div>

      {/* Review step */}
      <Modal
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        title={mode === "now" ? "Review before sending" : "Review before scheduling"}
        description="Check the details below. Nothing is sent to WhatsApp."
        size="sm"
        footer={
          <>
            <Button onClick={() => setReviewOpen(false)}>Back</Button>
            <Button variant="primary" onClick={confirm}>
              {mode === "now" ? "Send now (simulated)" : "Schedule Campaign"}
            </Button>
          </>
        }
      >
        {template && (
          <div className="space-y-4">
            <dl className="space-y-2 rounded-lg bg-slate-50 px-4 py-3 text-sm">
              <SummaryRow label="Contact list" value={list.name} />
              <SummaryRow label="Total recipients" value={formatNumber(recipients)} />
              <SummaryRow
                label="Excluded opt-outs"
                value={formatNumber(excluded)}
              />
              <SummaryRow label="Template" value={template.name} mono />
              <SummaryRow
                label="Template type"
                value={template.source === "meta" ? "Meta-Approved" : "Custom"}
              />
              {mode === "schedule" && (
                <>
                  <SummaryRow label="Campaign name" value={campaignName.trim()} />
                  <SummaryRow
                    label="Scheduled for"
                    value={formatDateTime(scheduledAt)}
                  />
                </>
              )}
            </dl>

            <TemplatePreview
              header={template.header}
              body={template.body}
              footer={template.footer}
              media={template.media}
              buttons={template.buttons}
              values={variables}
            />

            <InlineAlert tone="warning">
              Sending is simulated. No messages are sent and no WhatsApp API call is
              made.
            </InlineAlert>
          </div>
        )}
      </Modal>
    </div>
  );
}

function TypeButton({
  active,
  onClick,
  label,
  count,
  icon: Icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600",
        active
          ? "border-indigo-300 bg-indigo-50 text-indigo-700"
          : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
      )}
    >
      {Icon && <Icon className="h-4 w-4" />}
      {label}
      {typeof count === "number" && (
        <span className="rounded-full bg-white/70 px-1.5 py-0.5 text-xs text-slate-600 ring-1 ring-inset ring-slate-200">
          {count}
        </span>
      )}
    </button>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-sm font-semibold",
          highlight ? "text-indigo-600" : "text-slate-800"
        )}
      >
        {value}
      </p>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd
        className={cn(
          "text-right text-slate-800",
          mono && "font-mono text-xs"
        )}
      >
        {value}
      </dd>
    </div>
  );
}
