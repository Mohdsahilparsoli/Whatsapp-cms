"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Loader2, Plus, Send, Trash2, X } from "lucide-react";
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
import InlineAlert from "@/components/ui/InlineAlert";
import TemplatePreview from "@/components/templates/TemplatePreview";
import { useCustomTemplates } from "@/lib/customTemplates";
import { getPageMeta } from "@/lib/nav";
import { cn, formatDateTime, formatNumber, nowForInput, percent } from "@/lib/utils";
import type { Campaign } from "@/types";

const steps = ["Details", "Audience", "Template", "Preview", "Schedule"];
type SendMode = "now" | "schedule";

export default function CampaignsPage() {
  const meta = getPageMeta("/campaigns");
  const { views: customViews } = useCustomTemplates();

  // Only saved (non-draft) custom templates can actually be sent — see
  // app/api/campaigns/route.ts for why.
  const templateOptions = useMemo(
    () => customViews.filter((t) => t.status === "custom"),
    [customViews]
  );

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [audiencePreview, setAudiencePreview] = useState<number | null>(null);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [viewing, setViewing] = useState<Campaign | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<Campaign | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Campaign | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Wizard state
  const [wizardOpen, setWizardOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [audienceTag, setAudienceTag] = useState("all");
  const [templateId, setTemplateId] = useState("");
  const [mode, setMode] = useState<SendMode>("schedule");
  const [scheduledAt, setScheduledAt] = useState("");
  const [errors, setErrors] = useState<{ name?: string; template?: string; scheduledAt?: string }>({});
  const [saving, setSaving] = useState(false);

  const template = templateOptions.find((t) => t.id === templateId) ?? templateOptions[0] ?? null;

  async function loadCampaigns() {
    setLoading(true);
    try {
      const res = await fetch("/api/campaigns");
      const data = await res.json();
      setCampaigns(data.campaigns ?? []);
    } catch {
      setCampaigns([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // False positive — see the identical note on this pattern in
    // app/(app)/clients/page.tsx.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadCampaigns();
    fetch("/api/contacts")
      .then((res) => res.json())
      .then((data) => {
        const contacts = data.contacts ?? [];
        setAllTags(Array.from(new Set(contacts.flatMap((c: { tags: string[] }) => c.tags))).sort() as string[]);
      })
      .catch(() => setAllTags([]));
  }, []);

  // Live "how many people will this reach" preview while building/editing a
  // campaign — recomputed whenever the tag filter changes.
  useEffect(() => {
    if (!wizardOpen) return;
    fetch("/api/contacts")
      .then((res) => res.json())
      .then((data) => {
        const contacts: { consent: string; tags: string[] }[] = data.contacts ?? [];
        const count = contacts.filter(
          (c) => c.consent === "opted_in" && (audienceTag === "all" || c.tags.includes(audienceTag))
        ).length;
        setAudiencePreview(count);
      })
      .catch(() => setAudiencePreview(null));
  }, [wizardOpen, audienceTag]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return campaigns.filter((row) => {
      const matchesQuery =
        !q || row.name.toLowerCase().includes(q) || row.templateName.toLowerCase().includes(q);
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [campaigns, query, statusFilter]);

  function resetWizard() {
    setStep(0);
    setEditingId(null);
    setName("");
    setAudienceTag("all");
    setTemplateId(templateOptions[0]?.id ?? "");
    setMode("schedule");
    setScheduledAt("");
    setErrors({});
  }

  function openCreate() {
    resetWizard();
    setWizardOpen(true);
  }

  function openEdit(campaign: Campaign) {
    setEditingId(campaign.id);
    setName(campaign.name);
    setAudienceTag(campaign.audienceTag);
    setTemplateId(campaign.templateId);
    setMode(campaign.scheduledAt ? "schedule" : "now");
    setScheduledAt(campaign.scheduledAt ? campaign.scheduledAt.slice(0, 16) : "");
    setStep(0);
    setErrors({});
    setWizardOpen(true);
  }

  function next() {
    if (step === 0 && !name.trim()) {
      setErrors({ name: "Give the campaign a name." });
      return;
    }
    if (step === 2 && !template) {
      setErrors({ template: "Pick a template." });
      return;
    }
    setErrors({});
    setStep((s) => Math.min(s + 1, steps.length - 1));
  }

  async function save(mode_: "draft" | "now" | "schedule") {
    if (!name.trim()) {
      setStep(0);
      setErrors({ name: "Give the campaign a name." });
      return;
    }
    if (!template) {
      setStep(2);
      setErrors({ template: "Pick a template." });
      return;
    }
    if (mode_ === "schedule") {
      if (!scheduledAt) {
        setStep(steps.length - 1);
        setErrors({ scheduledAt: "Pick a date and time." });
        return;
      }
    }

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        audienceTag,
        templateId: template.id,
        mode: mode_,
        scheduledAt: mode_ === "schedule" ? scheduledAt : undefined,
      };

      const res = await fetch(editingId ? `/api/campaigns/${editingId}` : "/api/campaigns", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.errors) setErrors(data.errors);
        else setToast(data.error ?? "Could not save campaign.");
        return;
      }

      await loadCampaigns();
      setToast(
        mode_ === "now"
          ? `“${data.campaign.name}” sent — ${data.campaign.sentCount} delivered, ${data.campaign.failedCount} failed.`
          : mode_ === "schedule"
            ? `“${data.campaign.name}” scheduled for ${formatDateTime(scheduledAt)}.`
            : `“${data.campaign.name}” saved as a draft.`
      );
      setWizardOpen(false);
      resetWizard();
    } finally {
      setSaving(false);
    }
  }

  async function handleCancel() {
    if (!confirmCancel) return;
    const res = await fetch(`/api/campaigns/${confirmCancel.id}/cancel`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setToast(data.error ?? "Could not cancel campaign.");
      return;
    }
    await loadCampaigns();
    setToast(`“${confirmCancel.name}” cancelled.`);
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    const res = await fetch(`/api/campaigns/${confirmDelete.id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      setToast(data.error ?? "Could not delete campaign.");
      return;
    }
    setCampaigns((prev) => prev.filter((c) => c.id !== confirmDelete.id));
    setToast(`“${confirmDelete.name}” deleted.`);
  }

  const columns: Column<Campaign>[] = [
    {
      key: "name",
      header: "Campaign",
      render: (row) => (
        <div>
          <p className="font-medium text-slate-900">{row.name}</p>
          <p className="font-mono text-xs text-slate-400">{row.templateName}</p>
        </div>
      ),
    },
    {
      key: "audience",
      header: "Audience",
      render: (row) => (
        <div>
          <p className="text-sm text-slate-700">{row.audienceTag === "all" ? "All contacts" : row.audienceTag}</p>
          <p className="text-xs text-slate-400">{formatNumber(row.audienceSize)} recipients</p>
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
          <span className="text-sm text-slate-400">—</span>
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
              style={{ width: `${percent(row.sentCount, row.audienceSize)}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-slate-400">
            {formatNumber(row.sentCount)} / {formatNumber(row.audienceSize)}
          </p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <StatusBadge
          status={row.status}
          label={row.status === "sending" ? "Sending…" : undefined}
        />
      ),
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
          {(row.status === "draft" || row.status === "scheduled") && (
            <Button size="sm" onClick={() => openEdit(row)}>
              Edit
            </Button>
          )}
          {row.status === "scheduled" && (
            <Button size="sm" variant="danger" onClick={() => setConfirmCancel(row)}>
              <X className="h-3.5 w-3.5" /> Cancel
            </Button>
          )}
          {row.status !== "sending" && (
            <Button
              size="sm"
              variant="danger"
              aria-label={`Delete ${row.name}`}
              onClick={() => setConfirmDelete(row)}
            >
              <Trash2 className="h-3.5 w-3.5" />
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

      <InlineAlert tone="warning" className="mb-5">
        Campaigns send <strong>real</strong> WhatsApp messages via Meta&apos;s shared test number
        — only opted-in contacts who&apos;ve messaged that number in the last 24 hours will
        actually receive them. Scheduled campaigns run automatically while this server stays
        running (checked every 30s) — they won&apos;t fire if the server is stopped.
      </InlineAlert>

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
              { label: "Sending", value: "sending" },
              { label: "Completed", value: "completed" },
              { label: "Cancelled", value: "cancelled" },
              { label: "Failed", value: "failed" },
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
          loading={loading}
          emptyTitle="No campaigns yet"
          emptyDescription="Create a campaign to start reaching your contacts."
        />
      </Card>

      {/* Create / edit wizard */}
      <Modal
        open={wizardOpen}
        onClose={() => !saving && setWizardOpen(false)}
        title={editingId ? "Edit campaign" : "New campaign"}
        description={`Step ${step + 1} of ${steps.length} — ${steps[step]}`}
        size="lg"
        footer={
          <>
            {step > 0 && (
              <Button onClick={() => setStep((s) => s - 1)} disabled={saving}>
                Back
              </Button>
            )}
            {step < steps.length - 1 ? (
              <Button variant="primary" onClick={next} disabled={saving}>
                Continue
              </Button>
            ) : (
              <>
                <Button onClick={() => save("draft")} disabled={saving}>
                  {saving ? "Saving…" : "Save as draft"}
                </Button>
                <Button
                  variant="primary"
                  onClick={() => save(mode === "schedule" ? "schedule" : "now")}
                  disabled={saving}
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : mode === "schedule" ? (
                    "Schedule Campaign"
                  ) : (
                    "Send Now"
                  )}
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
              label="Audience — tag filter"
              value={audienceTag}
              onChange={setAudienceTag}
              options={[
                { label: "All contacts", value: "all" },
                ...allTags.map((t) => ({ label: t, value: t })),
              ]}
            />
            <p className="text-xs text-slate-500">
              {audiencePreview === null
                ? "Checking your contacts…"
                : `${formatNumber(audiencePreview)} opted-in contacts will receive this campaign.`}
            </p>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            {templateOptions.length === 0 ? (
              <InlineAlert tone="warning">
                You have no sendable templates yet. Save a custom template (not as a draft) on the
                Templates page first.
              </InlineAlert>
            ) : (
              <SelectField
                label="Custom template"
                value={template?.id ?? ""}
                onChange={setTemplateId}
                options={templateOptions.map((item) => ({
                  label: `${item.name} · ${item.language}`,
                  value: item.id,
                }))}
                error={errors.template}
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
                  Variables are shown with their labels — this template&apos;s own saved values
                  are what actually get sent.
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
              <p className="mb-1.5 text-sm font-medium text-slate-700">When should this go out?</p>
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
                  Sends immediately when you click &quot;Send Now&quot; below — a real WhatsApp
                  API call is made for every recipient.
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
                  setErrors((prev) => ({ ...prev, scheduledAt: undefined }));
                }}
                error={errors.scheduledAt}
                hint={`Must be later than ${formatDateTime(nowForInput())}.`}
              />
            )}

            <dl className="space-y-1.5 rounded-lg bg-slate-50 px-4 py-3 text-sm">
              <SummaryRow label="Name" value={name || "Untitled"} />
              <SummaryRow label="Audience" value={audienceTag === "all" ? "All contacts" : audienceTag} />
              <SummaryRow
                label="Recipients"
                value={audiencePreview === null ? "—" : formatNumber(audiencePreview)}
              />
              <SummaryRow label="Template" value={template?.name ?? "—"} />
              <SummaryRow
                label="Scheduled for"
                value={mode === "schedule" && scheduledAt ? formatDateTime(scheduledAt) : "Not scheduled"}
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
              <SummaryRow
                label="Audience"
                value={viewing.audienceTag === "all" ? "All contacts" : viewing.audienceTag}
              />
              <SummaryRow label="Recipients" value={formatNumber(viewing.audienceSize)} />
              <SummaryRow label="Template" value={viewing.templateName} />
              <SummaryRow
                label="Scheduled for"
                value={viewing.scheduledAt ? formatDateTime(viewing.scheduledAt) : "—"}
              />
            </dl>
            <div className="grid grid-cols-2 gap-3">
              <Metric label="Sent" value={viewing.sentCount} />
              <Metric label="Failed" value={viewing.failedCount} />
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
        message={`Cancel “${confirmCancel?.name}”? The schedule will be removed.`}
        confirmLabel="Cancel campaign"
        cancelLabel="Keep it"
        destructive
        onConfirm={handleCancel}
        onClose={() => setConfirmCancel(null)}
      />

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title="Delete campaign"
        message={`Permanently delete “${confirmDelete?.name}”? This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
        onClose={() => setConfirmDelete(null)}
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
      <p className="mt-0.5 text-lg font-semibold text-slate-900">{formatNumber(value)}</p>
    </div>
  );
}
