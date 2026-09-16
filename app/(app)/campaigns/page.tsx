"use client";

import { useMemo, useState } from "react";
import { CalendarClock, Copy, Pause, Play, Plus, Send, X } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import DataTable, { type Column } from "@/components/ui/DataTable";
import SearchInput from "@/components/ui/SearchInput";
import FilterDropdown from "@/components/ui/FilterDropdown";
import StatusBadge from "@/components/ui/StatusBadge";
import Modal from "@/components/ui/Modal";
import Drawer from "@/components/ui/Drawer";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import FormField, { SelectField } from "@/components/ui/FormField";
import DemoNotice from "@/components/ui/DemoNotice";
import InlineAlert from "@/components/ui/InlineAlert";
import TemplatePreview from "@/components/templates/TemplatePreview";
import TemplateSourceBadge from "@/components/templates/TemplateSourceBadge";
import { contactLists } from "@/data/contacts";
import {
  scheduleLabel,
  useCampaignStore,
  validateSchedule,
} from "@/lib/campaignStore";
import { metaTemplateViews, useCustomTemplates } from "@/lib/customTemplates";
import { getPageMeta } from "@/lib/nav";
import { cn, formatDateTime, formatNumber, nowForInput, percent } from "@/lib/utils";
import type { Campaign, TemplateSource, TemplateView } from "@/types";

const steps = ["Details", "Audience", "Template", "Preview", "Schedule"];
const OPT_OUT_RATE = 0.04;

type SendMode = "now" | "schedule";

export default function CampaignsPage() {
  const meta = getPageMeta("/campaigns");
  const { campaigns, add, update, setStatus, duplicate } = useCampaignStore();
  const { views: customViews } = useCustomTemplates();

  const metaOptions = useMemo(
    () => metaTemplateViews.filter((template) => template.status === "approved"),
    []
  );
  const customOptions = useMemo(
    () => customViews.filter((template) => template.status === "custom"),
    [customViews]
  );

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [viewing, setViewing] = useState<Campaign | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<Campaign | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Wizard state
  const [wizardOpen, setWizardOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [listId, setListId] = useState(contactLists[0].id);
  const [source, setSource] = useState<TemplateSource>("meta");
  const [templateId, setTemplateId] = useState(metaOptions[0]?.id ?? "");
  const [mode, setMode] = useState<SendMode>("schedule");
  const [scheduledAt, setScheduledAt] = useState("");
  const [errors, setErrors] = useState<{ name?: string; schedule?: string }>({});

  const options = source === "meta" ? metaOptions : customOptions;
  const template: TemplateView | null =
    options.find((item) => item.id === templateId) ?? options[0] ?? null;
  const list = contactLists.find((item) => item.id === listId) ?? contactLists[0];
  const recipients = list.count - Math.round(list.count * OPT_OUT_RATE);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return campaigns.filter((row) => {
      const matchesQuery =
        !q ||
        row.name.toLowerCase().includes(q) ||
        row.audience.toLowerCase().includes(q) ||
        row.templateName.toLowerCase().includes(q);
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [campaigns, query, statusFilter]);

  function resetWizard() {
    setStep(0);
    setEditingId(null);
    setName("");
    setListId(contactLists[0].id);
    setSource("meta");
    setTemplateId(metaOptions[0]?.id ?? "");
    setMode("schedule");
    setScheduledAt("");
    setErrors({});
  }

  function openCreate() {
    resetWizard();
    setWizardOpen(true);
  }

  function openEdit(campaign: Campaign) {
    const campaignSource: TemplateSource = campaign.templateSource ?? "meta";
    const pool = campaignSource === "meta" ? metaOptions : customOptions;

    setEditingId(campaign.id);
    setName(campaign.name);
    setListId(
      contactLists.find((item) => item.name === campaign.audience)?.id ??
        contactLists[0].id
    );
    setSource(campaignSource);
    setTemplateId(
      pool.find((item) => item.id === campaign.templateId)?.id ?? pool[0]?.id ?? ""
    );
    setMode(campaign.scheduledAt ? "schedule" : "now");
    setScheduledAt(campaign.scheduledAt ?? "");
    setStep(0);
    setErrors({});
    setWizardOpen(true);
  }

  function next() {
    if (step === 0 && !name.trim()) {
      setErrors({ name: "Give the campaign a name." });
      return;
    }
    setErrors({});
    setStep((s) => Math.min(s + 1, steps.length - 1));
  }

  function save(asDraft: boolean) {
    if (!name.trim()) {
      setStep(0);
      setErrors({ name: "Give the campaign a name." });
      return;
    }
    if (!template) return;

    // Only validate the schedule when the user actually chose to schedule.
    if (!asDraft && mode === "schedule") {
      const scheduleError = validateSchedule(scheduledAt);
      if (scheduleError) {
        setStep(steps.length - 1);
        setErrors({ schedule: scheduleError });
        return;
      }
    }

    const scheduled = !asDraft && mode === "schedule";
    const payload = {
      name: name.trim(),
      audience: list.name,
      audienceSize: recipients,
      templateId: template.id,
      templateName: template.name,
      templateSource: template.source,
      schedule: scheduled ? scheduleLabel(scheduledAt) : "—",
      scheduledAt: scheduled ? scheduledAt : undefined,
      status: (asDraft
        ? "draft"
        : scheduled
          ? "scheduled"
          : "draft") as Campaign["status"],
    };

    if (editingId) {
      update(editingId, payload);
      setToast(
        scheduled
          ? `“${payload.name}” rescheduled for ${formatDateTime(scheduledAt)} (demo).`
          : `“${payload.name}” updated.`
      );
    } else {
      add(payload);
      setToast(
        scheduled
          ? `“${payload.name}” scheduled for ${formatDateTime(
              scheduledAt
            )} to ${formatNumber(recipients)} recipients. Demo only — nothing is sent to WhatsApp.`
          : `“${payload.name}” saved as a draft.`
      );
    }

    setWizardOpen(false);
    resetWizard();
  }

  const columns: Column<Campaign>[] = [
    {
      key: "name",
      header: "Campaign",
      render: (row) => (
        <div>
          <p className="font-medium text-slate-900">{row.name}</p>
          <p className="flex items-center gap-1.5 font-mono text-xs text-slate-400">
            {row.templateName}
          </p>
        </div>
      ),
    },
    {
      key: "template",
      header: "Template type",
      render: (row) => <TemplateSourceBadge source={row.templateSource ?? "meta"} />,
    },
    {
      key: "audience",
      header: "Audience",
      render: (row) => (
        <div>
          <p className="text-sm text-slate-700">{row.audience}</p>
          <p className="text-xs text-slate-400">
            {formatNumber(row.audienceSize)} recipients
          </p>
        </div>
      ),
    },
    {
      key: "schedule",
      header: "Scheduled for",
      render: (row) =>
        row.scheduledAt ? (
          <span className="flex items-center gap-1.5 text-sm text-slate-700">
            <CalendarClock className="h-3.5 w-3.5 text-slate-400" />
            {formatDateTime(row.scheduledAt)}
          </span>
        ) : (
          <span className="text-sm text-slate-400">{row.schedule}</span>
        ),
    },
    {
      key: "progress",
      header: "Progress",
      render: (row) => (
        <div className="w-28">
          <div className="h-1.5 w-full rounded-full bg-slate-100">
            <div
              className="h-1.5 rounded-full bg-indigo-500"
              style={{ width: `${percent(row.sent, row.audienceSize)}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-slate-400">
            {formatNumber(row.sent)} / {formatNumber(row.audienceSize)}
          </p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: "actions",
      header: "Actions",
      className: "text-right",
      headerClassName: "text-right",
      render: (row) => (
        <div className="flex flex-wrap justify-end gap-1.5">
          <Button size="sm" onClick={() => setViewing(row)}>
            Details
          </Button>
          <Button size="sm" onClick={() => openEdit(row)}>
            Edit
          </Button>
          <Button
            size="sm"
            aria-label={`Duplicate ${row.name}`}
            onClick={() => {
              duplicate(row);
              setToast(`“${row.name}” duplicated as a draft.`);
            }}
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
          {row.status === "running" && (
            <Button
              size="sm"
              onClick={() => {
                setStatus(row.id, "paused");
                setToast(`“${row.name}” paused.`);
              }}
            >
              <Pause className="h-3.5 w-3.5" /> Pause
            </Button>
          )}
          {(row.status === "paused" || row.status === "scheduled") && (
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                setStatus(row.id, "running");
                setToast(`“${row.name}” resumed (demo).`);
              }}
            >
              <Play className="h-3.5 w-3.5" /> Resume
            </Button>
          )}
          {row.status !== "completed" && row.status !== "cancelled" && (
            <Button
              size="sm"
              variant="danger"
              aria-label={`Cancel ${row.name}`}
              onClick={() => setConfirmCancel(row)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  const scheduledCount = campaigns.filter((c) => c.status === "scheduled").length;

  return (
    <div>
      <PageHeader
        title={meta.title}
        description={meta.description}
        actions={
          <Button variant="primary" onClick={openCreate}>
            <Plus className="h-4 w-4" /> New campaign
          </Button>
        }
      />

      <DemoNotice>
        Campaign progress and delivery numbers are mock values. Scheduling is
        simulated — no messages are sent and no WhatsApp API call is made.
      </DemoNotice>

      {toast && (
        <InlineAlert
          tone="success"
          className="mb-5"
          action={
            <Button size="sm" onClick={() => setToast(null)}>
              Dismiss
            </Button>
          }
        >
          {toast}
        </InlineAlert>
      )}

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-5 py-3">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search campaigns"
            className="w-full sm:w-72"
          />
          <FilterDropdown
            label="Status"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { label: "All statuses", value: "all" },
              { label: "Draft", value: "draft" },
              { label: `Scheduled (${scheduledCount})`, value: "scheduled" },
              { label: "Running", value: "running" },
              { label: "Paused", value: "paused" },
              { label: "Completed", value: "completed" },
              { label: "Cancelled", value: "cancelled" },
            ]}
          />
          <span className="ml-auto text-xs text-slate-400">
            {filtered.length} campaign{filtered.length === 1 ? "" : "s"}
          </span>
        </div>
        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={(row) => row.id}
          emptyTitle="No campaigns yet"
          emptyDescription="Create a campaign to start reaching your contacts."
        />
      </Card>

      {/* Create / edit wizard */}
      <Modal
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        title={editingId ? "Edit campaign" : "New campaign"}
        description={`Step ${step + 1} of ${steps.length} — ${steps[step]}`}
        size="lg"
        footer={
          <>
            {step > 0 && <Button onClick={() => setStep((s) => s - 1)}>Back</Button>}
            {step < steps.length - 1 ? (
              <Button variant="primary" onClick={next}>
                Continue
              </Button>
            ) : (
              <>
                <Button onClick={() => save(true)}>Save as draft</Button>
                <Button variant="primary" onClick={() => save(false)}>
                  {mode === "schedule" ? "Schedule Campaign" : "Save campaign"}
                </Button>
              </>
            )}
          </>
        }
      >
        <ol className="mb-5 flex flex-wrap gap-2">
          {steps.map((label, index) => (
            <li
              key={label}
              className={cn(
                "rounded-full px-2.5 py-1 text-xs",
                index === step
                  ? "bg-indigo-600 text-white"
                  : index < step
                    ? "bg-indigo-50 text-indigo-700"
                    : "bg-slate-100 text-slate-500"
              )}
            >
              {label}
            </li>
          ))}
        </ol>

        {step === 0 && (
          <FormField
            label="Campaign name"
            required
            value={name}
            error={errors.name}
            onChange={setName}
            placeholder="Festive Drop 2026"
          />
        )}

        {step === 1 && (
          <div className="space-y-3">
            <SelectField
              label="Contact list"
              value={listId}
              onChange={setListId}
              options={contactLists.map((item) => ({
                label: `${item.name} (${formatNumber(item.count)})`,
                value: item.id,
              }))}
            />
            <p className="text-xs text-slate-500">
              {formatNumber(recipients)} contacts will receive this campaign after
              excluding opted-out contacts.
            </p>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <SelectField
              label="Template type"
              value={source}
              onChange={(value) => {
                setSource(value as TemplateSource);
                setTemplateId("");
              }}
              options={[
                { label: "Meta-Approved Template", value: "meta" },
                { label: "My Custom Templates", value: "custom" },
              ]}
            />
            {options.length === 0 ? (
              <InlineAlert tone="warning">
                You have no custom templates ready to use. Save a custom template
                (not as a draft) on the Templates page first.
              </InlineAlert>
            ) : (
              <SelectField
                label={source === "meta" ? "Approved template" : "Custom template"}
                value={template?.id ?? ""}
                onChange={setTemplateId}
                options={options.map((item) => ({
                  label: `${item.name} · ${item.language}`,
                  value: item.id,
                }))}
              />
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            {template ? (
              <>
                <TemplatePreview
                  header={template.header}
                  body={template.body}
                  footer={template.footer}
                  media={template.media}
                  buttons={template.buttons}
                  values={template.variables}
                />
                <p className="text-xs text-slate-500">
                  Variables are shown with their labels. Real values are filled in
                  per contact when the campaign runs.
                </p>
              </>
            ) : (
              <p className="text-sm text-slate-500">Pick a template first.</p>
            )}
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <div>
              <p className="mb-1.5 text-sm font-medium text-slate-700">
                When should this go out?
              </p>
              <div className="flex flex-wrap gap-2">
                <ModeButton
                  active={mode === "now"}
                  onClick={() => {
                    setMode("now");
                    setErrors({});
                  }}
                  icon={Send}
                  label="Send Now"
                />
                <ModeButton
                  active={mode === "schedule"}
                  onClick={() => {
                    setMode("schedule");
                    setErrors({});
                  }}
                  icon={CalendarClock}
                  label="Schedule"
                />
              </div>
              {mode === "now" && (
                <p className="mt-2 text-xs text-slate-400">
                  “Send Now” saves the campaign without a schedule — use the Bulk
                  Message Sender to run a simulated send.
                </p>
              )}
            </div>

            {mode === "schedule" && (
              <FormField
                label="Send at"
                type="datetime-local"
                required
                value={scheduledAt}
                onChange={(value) => {
                  setScheduledAt(value);
                  setErrors({});
                }}
                error={errors.schedule}
                hint={`Must be later than ${formatDateTime(nowForInput())}.`}
              />
            )}

            <dl className="space-y-1.5 rounded-lg bg-slate-50 px-4 py-3 text-sm">
              <SummaryRow label="Name" value={name || "Untitled"} />
              <SummaryRow label="Audience" value={list.name} />
              <SummaryRow label="Recipients" value={formatNumber(recipients)} />
              <SummaryRow label="Template" value={template?.name ?? "—"} />
              <SummaryRow
                label="Template type"
                value={template?.source === "custom" ? "Custom" : "Meta-Approved"}
              />
              <SummaryRow
                label="Scheduled for"
                value={
                  mode === "schedule" && scheduledAt
                    ? formatDateTime(scheduledAt)
                    : "Not scheduled"
                }
              />
            </dl>
          </div>
        )}
      </Modal>

      {/* Details drawer */}
      <Drawer
        open={Boolean(viewing)}
        onClose={() => setViewing(null)}
        title={viewing?.name ?? "Campaign"}
        footer={<Button onClick={() => setViewing(null)}>Close</Button>}
      >
        {viewing && (
          <div className="space-y-4 text-sm">
            <dl className="space-y-2.5">
              <SummaryRow label="Audience" value={viewing.audience} />
              <SummaryRow
                label="Recipients"
                value={formatNumber(viewing.audienceSize)}
              />
              <SummaryRow label="Template" value={viewing.templateName} />
              <SummaryRow
                label="Template type"
                value={
                  viewing.templateSource === "custom" ? "Custom" : "Meta-Approved"
                }
              />
              <SummaryRow
                label="Scheduled for"
                value={
                  viewing.scheduledAt
                    ? formatDateTime(viewing.scheduledAt)
                    : viewing.schedule
                }
              />
            </dl>
            <div className="grid grid-cols-2 gap-3">
              <Metric label="Sent" value={viewing.sent} />
              <Metric label="Delivered" value={viewing.delivered} />
              <Metric label="Read" value={viewing.read} />
              <Metric label="Failed" value={viewing.failed} />
            </div>
            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2.5">
              <span className="text-slate-500">Status</span>
              <StatusBadge status={viewing.status} />
            </div>
            {viewing.status === "scheduled" && (
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => {
                    setViewing(null);
                    openEdit(viewing);
                  }}
                >
                  Edit schedule
                </Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    setViewing(null);
                    setConfirmCancel(viewing);
                  }}
                >
                  Cancel campaign
                </Button>
              </div>
            )}
          </div>
        )}
      </Drawer>

      <ConfirmDialog
        open={Boolean(confirmCancel)}
        title="Cancel campaign"
        message={`Cancel “${confirmCancel?.name}”? ${
          confirmCancel?.status === "scheduled"
            ? "The schedule will be removed."
            : "Remaining messages will not be sent."
        }`}
        confirmLabel="Cancel campaign"
        cancelLabel="Keep it"
        destructive
        onConfirm={() => {
          if (!confirmCancel) return;
          update(confirmCancel.id, {
            status: "cancelled",
            scheduledAt: undefined,
            schedule: "—",
          });
          setToast(`“${confirmCancel.name}” cancelled.`);
        }}
        onClose={() => setConfirmCancel(null)}
      />
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  label,
  icon: Icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
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
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right text-slate-800">{value}</dd>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2.5">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-0.5 text-lg font-semibold text-slate-900">
        {formatNumber(value)}
      </p>
    </div>
  );
}
