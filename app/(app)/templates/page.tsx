"use client";

import { useMemo, useState } from "react";
import { CloudDownload, CloudUpload, FileText, Loader2, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import DataTable, { type Column } from "@/components/ui/DataTable";
import SearchInput from "@/components/ui/SearchInput";
import FilterDropdown from "@/components/ui/FilterDropdown";
import StatusBadge from "@/components/ui/StatusBadge";
import Modal from "@/components/ui/Modal";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import EmptyState from "@/components/ui/EmptyState";
import InlineAlert from "@/components/ui/InlineAlert";
import TemplatePreview, { previewKindProps } from "@/components/templates/TemplatePreview";
import TemplateBuilder from "@/components/templates/TemplateBuilder";
import { useCustomTemplates } from "@/lib/customTemplates";
import { getPageMeta } from "@/lib/nav";
import { formatDate } from "@/lib/utils";
import type { CustomTemplate, TemplateView } from "@/types";

/**
 * Only real Custom Templates live here — every row is something the client
 * actually created and owns, whose "Meta" badge (see the status column) is
 * a real, live Meta Message Template approval status (lib/metaTemplates.ts),
 * not mock/demo data. This used to also show a "Meta-Approved Templates"
 * tab backed by fake data (data/campaigns.ts) — removed at the client's
 * request since it was confusing next to the real submission flow above.
 */
export default function TemplatesPage() {
  const meta = getPageMeta("/templates");
  const {
    templates,
    views: customViews,
    loading,
    refresh,
    create,
    update,
    remove,
    submitForApproval,
    checkApprovalStatus,
    nameTaken,
  } = useCustomTemplates();

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");

  const [preview, setPreview] = useState<TemplateView | null>(null);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<CustomTemplate | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<TemplateView | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [metaActionId, setMetaActionId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  // Pulls every template from the client's WhatsApp Business Account on
  // Meta (including ones made in Meta's own Business Manager) — see
  // lib/metaTemplateSync.ts for exactly what's imported vs skipped.
  async function handleSyncFromMeta() {
    setSyncing(true);
    try {
      const res = await fetch("/api/templates/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setToast(data.error ?? "Could not sync templates from Meta.");
        return;
      }
      refresh();
      const skipped: { name: string; reason: string }[] = data.skipped ?? [];
      setToast(
        `Synced from Meta — ${data.imported} new, ${data.updated} updated` +
          (skipped.length > 0
            ? `, ${skipped.length} skipped (${skipped
                .slice(0, 3)
                .map((x) => `${x.name}: ${x.reason}`)
                .join("; ")}${skipped.length > 3 ? "; …" : ""}).`
            : ".")
      );
    } catch {
      setToast("Could not reach the server to sync templates.");
    } finally {
      setSyncing(false);
    }
  }

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return customViews.filter((row) => {
      const matchesQuery =
        !q ||
        row.name.toLowerCase().includes(q) ||
        row.body.toLowerCase().includes(q);
      const matchesStatus = status === "all" || row.status === status;
      const matchesCategory = category === "all" || row.category === category;
      return matchesQuery && matchesStatus && matchesCategory;
    });
  }, [customViews, query, status, category]);

  function openCreate() {
    setEditingTemplate(null);
    setBuilderOpen(true);
  }

  function openEdit(row: TemplateView) {
    const full = templates.find((t) => t.id === row.id);
    if (!full) return;
    setEditingTemplate(full);
    setBuilderOpen(true);
  }

  async function handleSubmit(draft: Parameters<typeof create>[0], editingId?: string) {
    const result = editingId ? await update(editingId, draft) : await create(draft);
    if (result.ok) {
      setToast(
        editingId
          ? `“${result.template.name}” updated.`
          : result.template.status === "draft"
            ? `“${result.template.name}” saved as a draft.`
            : `“${result.template.name}” saved to your custom templates.`
      );
    }
    return result;
  }

  async function handleSubmitForApproval(row: TemplateView) {
    setMetaActionId(row.id);
    const result = await submitForApproval(row.id);
    setMetaActionId(null);
    setToast(
      result.ok
        ? `“${result.template.name}” submitted to Meta for review.`
        : result.error ?? "Could not submit that template to Meta."
    );
  }

  async function handleCheckStatus(row: TemplateView) {
    setMetaActionId(row.id);
    const result = await checkApprovalStatus(row.id);
    setMetaActionId(null);
    setToast(
      result.ok
        ? `“${result.template.name}” is now “${result.template.metaStatus?.replace(/_/g, " ")}” with Meta.`
        : result.error ?? "Could not check status with Meta."
    );
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    const result = await remove(confirmDelete.id);
    if (result.ok) {
      setToast(`“${confirmDelete.name}” deleted.`);
    } else {
      setToast(result.error ?? "Could not delete that template.");
    }
  }

  const statusOptions = [
    { label: "All statuses", value: "all" },
    { label: "Custom", value: "custom" },
    { label: "Draft", value: "draft" },
  ];

  const columns: Column<TemplateView>[] = [
    {
      key: "name",
      header: "Template",
      render: (row) => (
        <div>
          <p className="font-mono text-xs font-medium text-slate-900">{row.name}</p>
          <p className="mt-0.5 line-clamp-1 max-w-xs text-xs text-slate-400">
            {row.body}
          </p>
        </div>
      ),
    },
    { key: "category", header: "Category", render: (row) => row.category },
    { key: "language", header: "Language", render: (row) => row.language },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge
            status={row.status}
            label={row.status === "custom" ? "Custom" : undefined}
          />
          {/* Real Meta Message Template approval status — independent of
              the "Custom"/"Draft" status above (see lib/metaTemplates.ts).
              Only shown once submission has actually happened. */}
          {row.metaStatus && row.metaStatus !== "not_submitted" && (
            <StatusBadge status={row.metaStatus} label={`Meta: ${row.metaStatus.replace(/_/g, " ")}`} />
          )}
        </div>
      ),
    },
    {
      key: "updated",
      header: "Last updated",
      render: (row) => formatDate(row.updatedAt),
    },
    {
      key: "actions",
      header: "Actions",
      className: "text-right",
      headerClassName: "text-right",
      render: (row) => (
        <div className="flex justify-end gap-1.5">
          <Button size="sm" onClick={() => setPreview(row)}>
            Preview
          </Button>
          {row.status === "custom" &&
            (!row.metaStatus || row.metaStatus === "not_submitted" || row.metaStatus === "rejected") && (
              <Button size="sm" onClick={() => handleSubmitForApproval(row)} disabled={metaActionId === row.id}>
                {metaActionId === row.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CloudUpload className="h-3.5 w-3.5" />
                )}
                {row.metaStatus === "rejected" ? "Resubmit to Meta" : "Submit to Meta"}
              </Button>
            )}
          {row.metaStatus === "pending" && (
            <Button size="sm" onClick={() => handleCheckStatus(row)} disabled={metaActionId === row.id}>
              {metaActionId === row.id ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Check status
            </Button>
          )}
          <Button size="sm" onClick={() => openEdit(row)}>
            <Pencil className="h-3.5 w-3.5" /> Edit
          </Button>
          <Button size="sm" variant="danger" onClick={() => setConfirmDelete(row)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={meta.title}
        description={meta.description}
        actions={
          <>
            <Button onClick={refresh} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {loading ? "Refreshing…" : "Refresh templates"}
            </Button>
            <Button onClick={handleSyncFromMeta} disabled={syncing}>
              {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudDownload className="h-4 w-4" />}
              {syncing ? "Syncing…" : "Sync from Meta"}
            </Button>
            <Button variant="primary" onClick={openCreate}>
              <Plus className="h-4 w-4" /> Create Custom Template
            </Button>
          </>
        }
      />

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
            placeholder="Search templates"
            className="w-full sm:w-72"
          />
          <FilterDropdown
            label="Status"
            value={status}
            onChange={setStatus}
            options={statusOptions}
          />
          <FilterDropdown
            label="Category"
            value={category}
            onChange={setCategory}
            options={[
              { label: "All categories", value: "all" },
              { label: "Marketing", value: "Marketing" },
              { label: "Utility", value: "Utility" },
              { label: "Authentication", value: "Authentication" },
            ]}
          />
          <span className="ml-auto text-xs text-slate-400">
            {rows.length} template{rows.length === 1 ? "" : "s"}
          </span>
        </div>

        {customViews.length === 0 && !loading ? (
          <EmptyState
            icon={FileText}
            title="No custom templates yet"
            description="Build your own message with text, media, variables, and buttons. Custom templates are only visible to your account."
            action={
              <Button variant="primary" onClick={openCreate}>
                <Plus className="h-4 w-4" /> Create Custom Template
              </Button>
            }
          />
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(row) => row.id}
            loading={loading}
            emptyTitle="No templates match your filters"
            emptyDescription="Clear the search to see your other templates."
          />
        )}
      </Card>

      {/* Preview */}
      <Modal
        open={Boolean(preview)}
        onClose={() => setPreview(null)}
        title={preview?.name ?? "Template"}
        description={
          preview ? `${preview.category} · ${preview.language}` : undefined
        }
        footer={<Button onClick={() => setPreview(null)}>Close</Button>}
      >
        {preview && (
          <div className="space-y-5">
            <TemplatePreview
              header={preview.header}
              body={preview.body}
              footer={preview.footer}
              media={preview.media}
              buttons={preview.buttons}
                  {...previewKindProps(preview)}
              values={preview.variables}
            />

            <div>
              <p className="mb-2 text-xs font-semibold text-slate-500">Variables</p>
              {preview.variables.length === 0 ? (
                <p className="text-sm text-slate-500">
                  This template has no variables.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {preview.variables.map((variable, index) => (
                    <li
                      key={`${variable}-${index}`}
                      className="flex items-center gap-2 text-sm"
                    >
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600">
                        {preview.parameterFormat === "named" ? `{{${variable}}}` : `{{${index + 1}}}`}
                      </span>
                      <span className="text-slate-700">
                        {variable || `Value ${index + 1}`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2.5 text-xs">
              <span className="text-slate-500">Template status</span>
              <StatusBadge
                status={preview.status}
                label={preview.status === "custom" ? "Custom" : undefined}
              />
            </div>

            {preview.metaStatus && preview.metaStatus !== "not_submitted" && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2.5 text-xs">
                <span className="text-slate-500">Meta approval status</span>
                <StatusBadge status={preview.metaStatus} label={preview.metaStatus.replace(/_/g, " ")} />
              </div>
            )}

            {preview.metaStatus === "rejected" && preview.metaRejectionReason && (
              <InlineAlert tone="error">Meta&apos;s rejection reason: {preview.metaRejectionReason}</InlineAlert>
            )}
          </div>
        )}
      </Modal>

      <TemplateBuilder
        open={builderOpen}
        onClose={() => {
          setBuilderOpen(false);
          setEditingTemplate(null);
        }}
        onSubmit={handleSubmit}
        nameTaken={nameTaken}
        editing={editingTemplate}
      />

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title="Delete template"
        message={`Permanently delete “${confirmDelete?.name}”? This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
        onClose={() => setConfirmDelete(null)}
      />
    </div>
  );
}
