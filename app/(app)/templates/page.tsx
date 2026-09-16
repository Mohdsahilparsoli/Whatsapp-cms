"use client";

import { useMemo, useState } from "react";
import { FileText, Loader2, Plus, RefreshCw } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import DataTable, { type Column } from "@/components/ui/DataTable";
import SearchInput from "@/components/ui/SearchInput";
import FilterDropdown from "@/components/ui/FilterDropdown";
import StatusBadge from "@/components/ui/StatusBadge";
import Tabs from "@/components/ui/Tabs";
import Modal from "@/components/ui/Modal";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import EmptyState from "@/components/ui/EmptyState";
import DemoNotice from "@/components/ui/DemoNotice";
import InlineAlert from "@/components/ui/InlineAlert";
import TemplatePreview from "@/components/templates/TemplatePreview";
import TemplateSourceBadge from "@/components/templates/TemplateSourceBadge";
import TemplateBuilder from "@/components/templates/TemplateBuilder";
import {
  metaTemplateViews,
  useCustomTemplates,
  type CustomTemplateDraft,
} from "@/lib/customTemplates";
import { getPageMeta } from "@/lib/nav";
import { formatDate } from "@/lib/utils";
import type { CustomTemplate, TemplateView } from "@/types";

type Tab = "all" | "meta" | "custom";

export default function TemplatesPage() {
  const meta = getPageMeta("/templates");
  const { templates: customTemplates, views: customViews, create, update, remove, nameTaken } =
    useCustomTemplates();

  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");

  const [preview, setPreview] = useState<TemplateView | null>(null);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editing, setEditing] = useState<CustomTemplate | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CustomTemplate | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [refreshing, setRefreshing] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);

  const rows = useMemo(() => {
    const base: TemplateView[] =
      tab === "meta"
        ? metaTemplateViews
        : tab === "custom"
          ? customViews
          : [...metaTemplateViews, ...customViews];

    const q = query.trim().toLowerCase();
    return base.filter((row) => {
      const matchesQuery =
        !q ||
        row.name.toLowerCase().includes(q) ||
        row.body.toLowerCase().includes(q);
      const matchesStatus = status === "all" || row.status === status;
      const matchesCategory = category === "all" || row.category === category;
      return matchesQuery && matchesStatus && matchesCategory;
    });
  }, [tab, customViews, query, status, category]);

  function refresh() {
    setRefreshing(true);
    window.setTimeout(() => {
      setRefreshing(false);
      setRefreshedAt(
        new Date().toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
        })
      );
    }, 900);
  }

  function openCreate() {
    setEditing(null);
    setBuilderOpen(true);
  }

  function openEdit(id: string) {
    const template = customTemplates.find((item) => item.id === id) ?? null;
    if (!template) return;
    setEditing(template);
    setBuilderOpen(true);
  }

  function handleSave(draft: CustomTemplateDraft) {
    if (editing) {
      update(editing.id, draft);
      setToast(
        `“${draft.name}” updated${draft.status === "draft" ? " and saved as a draft" : ""}.`
      );
    } else {
      create(draft);
      setToast(
        draft.status === "draft"
          ? `“${draft.name}” saved as a draft.`
          : `“${draft.name}” saved to your custom templates.`
      );
    }
    setBuilderOpen(false);
    setEditing(null);
  }

  // Status options depend on the tab, because the two libraries use different
  // status vocabularies.
  const statusOptions =
    tab === "custom"
      ? [
          { label: "All statuses", value: "all" },
          { label: "Custom", value: "custom" },
          { label: "Draft", value: "draft" },
        ]
      : tab === "meta"
        ? [
            { label: "All statuses", value: "all" },
            { label: "Approved", value: "approved" },
            { label: "Pending", value: "pending" },
            { label: "Rejected", value: "rejected" },
          ]
        : [
            { label: "All statuses", value: "all" },
            { label: "Approved", value: "approved" },
            { label: "Pending", value: "pending" },
            { label: "Rejected", value: "rejected" },
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
    {
      key: "source",
      header: "Type",
      render: (row) => <TemplateSourceBadge source={row.source} />,
    },
    { key: "category", header: "Category", render: (row) => row.category },
    { key: "language", header: "Language", render: (row) => row.language },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <StatusBadge
          status={row.status}
          label={row.status === "custom" ? "Custom" : undefined}
        />
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
        <div className="flex flex-wrap justify-end gap-1.5">
          <Button size="sm" onClick={() => setPreview(row)}>
            Preview
          </Button>
          {row.source === "custom" && (
            <>
              <Button size="sm" onClick={() => openEdit(row.id)}>
                Edit
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() => {
                  const template = customTemplates.find((item) => item.id === row.id);
                  if (template) setConfirmDelete(template);
                }}
              >
                Delete
              </Button>
            </>
          )}
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
            <Button onClick={refresh} disabled={refreshing}>
              {refreshing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {refreshing ? "Refreshing…" : "Refresh templates"}
            </Button>
            <Button variant="primary" onClick={openCreate}>
              <Plus className="h-4 w-4" /> Create Custom Template
            </Button>
          </>
        }
      />

      <DemoNotice>
        Meta-approved templates are mock data — in production they sync from Meta,
        and only approved templates can be used in a campaign. Custom templates are
        created here, stored in this browser only, and are not submitted to Meta.
        {refreshedAt && <> Last refreshed at {refreshedAt}.</>}
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
        <div className="px-5 pt-3">
          <Tabs
            tabs={[
              {
                label: "All Templates",
                value: "all",
                count: metaTemplateViews.length + customViews.length,
              },
              {
                label: "Meta-Approved Templates",
                value: "meta",
                count: metaTemplateViews.length,
              },
              {
                label: "Custom Templates",
                value: "custom",
                count: customViews.length,
              },
            ]}
            active={tab}
            onChange={(value) => {
              setTab(value as Tab);
              setStatus("all");
            }}
          />
        </div>

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

        {tab === "custom" && customViews.length === 0 && !refreshing ? (
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
            loading={refreshing}
            emptyTitle="No templates match your filters"
            emptyDescription="Clear the search or switch tabs to see other templates."
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
                        {`{{${index + 1}}}`}
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
              <span className="text-slate-500">
                {preview.source === "meta" ? "Approval status" : "Template status"}
              </span>
              <span className="flex items-center gap-2">
                <TemplateSourceBadge source={preview.source} />
                <StatusBadge
                  status={preview.status}
                  label={preview.status === "custom" ? "Custom" : undefined}
                />
              </span>
            </div>

            {preview.source === "custom" && (
              <InlineAlert tone="info">
                This is your own template. It has not been submitted to Meta and is
                not Meta-approved.
              </InlineAlert>
            )}
          </div>
        )}
      </Modal>

      <TemplateBuilder
        open={builderOpen}
        editing={editing}
        onClose={() => {
          setBuilderOpen(false);
          setEditing(null);
        }}
        onSaveDraft={handleSave}
        onSave={handleSave}
        nameTaken={nameTaken}
      />

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title="Delete custom template"
        message={`Delete “${confirmDelete?.name}”? This cannot be undone in the demo.`}
        confirmLabel="Delete"
        cancelLabel="Keep it"
        destructive
        onConfirm={() => {
          if (!confirmDelete) return;
          remove(confirmDelete.id);
          setToast(`“${confirmDelete.name}” deleted.`);
        }}
        onClose={() => setConfirmDelete(null)}
      />
    </div>
  );
}
