"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, FileSpreadsheet, Plus, ShieldAlert, Trash2, UploadCloud } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import Card, { CardHeader } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import DataTable, { type Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import LoadingState from "@/components/ui/LoadingState";
import Modal from "@/components/ui/Modal";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import FormField, { SelectField } from "@/components/ui/FormField";
import { formatDate, formatNumber } from "@/lib/utils";
import { parseContactFile, guessColumnMapping, type ContactField } from "@/lib/fileParse";

interface SavedList {
  id: string;
  name: string;
  tag: string;
  source: string;
  updatedAt: string;
  count: number;
}

const FIELD_LABELS: Record<ContactField, string> = {
  phone: "Phone",
  name: "Name",
  email: "Email",
  tags: "Tags",
  consent: "Consent",
};

const NONE = "__none__";

function digitsOnly(v: string) {
  return v.replace(/\D/g, "");
}

export default function ContactImportPage() {
  const inputRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<ContactField, string | null>>({
    phone: null,
    name: null,
    email: null,
    tags: null,
    consent: null,
  });

  const [existingPhones, setExistingPhones] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{
    totalRows: number;
    invalid: number;
    invalidEmail: number;
    duplicatesInFile: number;
    duplicatesExisting: number;
    imported: number;
  } | null>(null);

  const [lists, setLists] = useState<SavedList[]>([]);
  const [listsLoading, setListsLoading] = useState(true);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [listModalOpen, setListModalOpen] = useState(false);
  const [listForm, setListForm] = useState({ name: "", tag: "" });
  const [listErrors, setListErrors] = useState<Record<string, string>>({});
  const [savingList, setSavingList] = useState(false);
  const [confirmDeleteList, setConfirmDeleteList] = useState<SavedList | null>(null);

  function loadLists() {
    setListsLoading(true);
    fetch("/api/contact-lists")
      .then((r) => r.json())
      .then((data) => setLists(data.lists ?? []))
      .catch(() => setLists([]))
      .finally(() => setListsLoading(false));
  }

  useEffect(() => {
    // False positive — see the identical note on this pattern in
    // app/(app)/clients/page.tsx.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadLists();
    fetch("/api/contacts/tags")
      .then((r) => r.json())
      .then((data) => setAllTags(data.tags ?? []))
      .catch(() => setAllTags([]));
  }, []);

  async function createList() {
    const errors: Record<string, string> = {};
    if (!listForm.name.trim()) errors.name = "Give the list a name.";
    if (!listForm.tag) errors.tag = "Pick a tag.";
    setListErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSavingList(true);
    try {
      const res = await fetch("/api/contact-lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: listForm.name.trim(), tag: listForm.tag }),
      });
      const data = await res.json();
      if (!res.ok) {
        setListErrors(data.errors ?? { name: data.error ?? "Could not save list." });
        return;
      }
      setListModalOpen(false);
      setListForm({ name: "", tag: "" });
      loadLists();
    } finally {
      setSavingList(false);
    }
  }

  async function deleteList() {
    if (!confirmDeleteList) return;
    const res = await fetch(`/api/contact-lists/${confirmDeleteList.id}`, { method: "DELETE" });
    if (res.ok) setLists((prev) => prev.filter((l) => l.id !== confirmDeleteList.id));
  }

  // Used only to preview "already in your contacts" before importing —
  // fetched once, doesn't need to block the rest of the page.
  useEffect(() => {
    fetch("/api/contacts")
      .then((r) => r.json())
      .then((data) => {
        const phones = new Set<string>((data.contacts ?? []).map((c: { phone: string }) => c.phone));
        setExistingPhones(phones);
      })
      .catch(() => {});
  }, []);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    setParseError(null);
    setParsing(true);
    try {
      const parsed = await parseContactFile(file);
      setHeaders(parsed.headers);
      setRows(parsed.rows);
      const guess = guessColumnMapping(parsed.headers);
      setMapping(guess);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Could not read that file.");
      setHeaders([]);
      setRows([]);
    } finally {
      setParsing(false);
    }
  }

  function clearFile() {
    setFileName(null);
    setHeaders([]);
    setRows([]);
    setResult(null);
    setParseError(null);
  }

  // Preview + counts, mirroring the server's validation logic closely
  // enough to show an honest estimate before importing.
  const preview = useMemo(() => {
    if (!mapping.phone) return { valid: [], invalid: 0, duplicatesInFile: 0, duplicatesExisting: 0 };

    const seen = new Set<string>();
    const valid: { name: string; phone: string; email: string; tags: string; consent: string }[] = [];
    let invalid = 0;
    let duplicatesInFile = 0;
    let duplicatesExisting = 0;

    for (const row of rows) {
      const phone = (mapping.phone ? row[mapping.phone] : "")?.trim() ?? "";
      if (digitsOnly(phone).length < 10) {
        invalid += 1;
        continue;
      }
      if (seen.has(phone)) {
        duplicatesInFile += 1;
        continue;
      }
      seen.add(phone);
      if (existingPhones.has(phone)) duplicatesExisting += 1;

      valid.push({
        name: mapping.name ? row[mapping.name] ?? "" : "",
        phone,
        email: mapping.email ? row[mapping.email] ?? "" : "",
        tags: mapping.tags ? row[mapping.tags] ?? "" : "",
        consent: mapping.consent ? row[mapping.consent] ?? "" : "",
      });
    }

    return { valid, invalid, duplicatesInFile, duplicatesExisting };
  }, [rows, mapping, existingPhones]);

  const readyToImport = Boolean(mapping.phone) && preview.valid.length > 0;

  async function runImport() {
    setImporting(true);
    try {
      const importRows = rows.map((row) => ({
        phone: mapping.phone ? row[mapping.phone] : "",
        name: mapping.name ? row[mapping.name] : undefined,
        email: mapping.email ? row[mapping.email] : undefined,
        tags: mapping.tags ? row[mapping.tags] : undefined,
        consent: mapping.consent ? row[mapping.consent] : undefined,
      }));

      const res = await fetch("/api/contacts/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: importRows }),
      });
      const data = await res.json();
      if (!res.ok) {
        setParseError(data.error ?? "Import failed.");
        return;
      }
      setResult(data);
      setConfirmOpen(false);
      // Refresh the "already in your contacts" set so re-running (or a
      // second file) reflects what was just imported.
      const refreshed = new Set(existingPhones);
      preview.valid.forEach((r) => refreshed.add(r.phone));
      setExistingPhones(refreshed);
      // New tags may have come in with this file — refresh so "Create list"
      // can offer them immediately.
      fetch("/api/contacts/tags")
        .then((r) => r.json())
        .then((d) => setAllTags(d.tags ?? []))
        .catch(() => {});
    } finally {
      setImporting(false);
    }
  }

  const previewColumns: Column<{ id: string; name: string; phone: string; email: string; tags: string }>[] = [
    { key: "name", header: "Name", render: (row) => row.name || "—" },
    { key: "phone", header: "Phone", render: (row) => row.phone },
    { key: "email", header: "Email", render: (row) => row.email || "—" },
    { key: "tags", header: "Tags", render: (row) => row.tags || "(defaults to “normal”)" },
  ];

  const listColumns: Column<SavedList>[] = [
    { key: "name", header: "List", render: (row) => <span className="font-medium text-slate-900">{row.name}</span> },
    { key: "count", header: "Contacts", render: (row) => formatNumber(row.count) },
    { key: "tag", header: "Tag", render: (row) => <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{row.tag}</span> },
    { key: "source", header: "Source", render: (row) => row.source },
    { key: "updated", header: "Updated", render: (row) => formatDate(row.updatedAt) },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (row) => (
        <Button size="sm" variant="danger" aria-label={`Delete ${row.name}`} onClick={() => setConfirmDeleteList(row)}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Contact Import"
        description="Upload a CSV or Excel file, map its columns, and review before importing."
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader title="Upload file" description="CSV, XLSX, or XLS" />
            <div className="px-5 py-5">
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  handleFile(e.dataTransfer.files?.[0]);
                }}
                className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 px-6 py-10 text-center"
              >
                <UploadCloud className="h-7 w-7 text-slate-400" />
                <p className="mt-3 text-sm font-medium text-slate-700">
                  Drag a file here, or choose one
                </p>
                <p className="mt-1 text-xs text-slate-400">Only a phone column is required.</p>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="sr-only"
                  onChange={(e) => handleFile(e.target.files?.[0])}
                />
                <Button className="mt-4" onClick={() => inputRef.current?.click()}>
                  Choose file
                </Button>
              </div>

              {parseError && (
                <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
                  {parseError}
                </div>
              )}

              {fileName && !parseError && (
                <div className="mt-4 flex items-center gap-3 rounded-lg border border-slate-200 px-4 py-3">
                  <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">{fileName}</p>
                    <p className="text-xs text-slate-400">
                      {rows.length} row{rows.length === 1 ? "" : "s"} detected · {headers.length} column
                      {headers.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={clearFile}>
                    Remove
                  </Button>
                </div>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Column mapping & preview" />
            {!fileName ? (
              <EmptyState
                title="No file uploaded yet"
                description="Upload a CSV or Excel file to map its columns to CMS fields."
                icon={FileSpreadsheet}
              />
            ) : parsing ? (
              <LoadingState rows={4} label="Reading file" />
            ) : headers.length === 0 ? null : (
              <>
                <div className="grid grid-cols-2 gap-3 border-b border-slate-200 px-5 py-4 sm:grid-cols-5">
                  {(Object.keys(FIELD_LABELS) as ContactField[]).map((field) => (
                    <label key={field} className="text-xs">
                      <span className="block text-slate-500">
                        {FIELD_LABELS[field]}
                        {field === "phone" && <span className="text-red-500"> *</span>}
                      </span>
                      <select
                        aria-label={`Map ${FIELD_LABELS[field]}`}
                        value={mapping[field] ?? NONE}
                        onChange={(e) =>
                          setMapping((prev) => ({
                            ...prev,
                            [field]: e.target.value === NONE ? null : e.target.value,
                          }))
                        }
                        className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                      >
                        {field !== "phone" && <option value={NONE}>Not in file</option>}
                        {headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                {!mapping.phone && (
                  <p className="px-5 py-3 text-xs text-amber-700">
                    Pick which column has the phone number to see a preview.
                  </p>
                )}
                {mapping.phone && (
                  <DataTable
                    columns={previewColumns}
                    rows={preview.valid.slice(0, 8).map((row, i) => ({ ...row, id: `p${i}` }))}
                    rowKey={(row) => row.id}
                  />
                )}
                {preview.valid.length > 8 && (
                  <p className="px-5 py-3 text-xs text-slate-400">
                    +{preview.valid.length - 8} more row{preview.valid.length - 8 === 1 ? "" : "s"} not shown
                  </p>
                )}
              </>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Validation summary" />
            {!fileName || parsing || headers.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-500">Upload a file to see validation results.</p>
            ) : (
              <ul className="space-y-2.5 px-5 py-4 text-sm">
                <SummaryRow label="Rows in file" value={String(rows.length)} />
                <SummaryRow label="Valid contacts" value={String(preview.valid.length)} tone="positive" />
                <SummaryRow label="Duplicates in file" value={String(preview.duplicatesInFile)} tone="warning" />
                <SummaryRow
                  label="Already in your contacts"
                  value={String(preview.duplicatesExisting)}
                  tone="warning"
                />
                <SummaryRow label="Missing/invalid phone" value={String(preview.invalid)} tone="negative" />
                <p className="pt-1 text-xs text-slate-400">
                  Duplicates are skipped automatically. Rows with no tags get a default “normal” tag;
                  rows with no consent value default to opted in.
                </p>
                <Button
                  variant="primary"
                  className="mt-2 w-full"
                  onClick={() => setConfirmOpen(true)}
                  disabled={!readyToImport}
                >
                  Import {preview.valid.length} contact{preview.valid.length === 1 ? "" : "s"}
                </Button>
                {result && (
                  <div className="mt-2 space-y-1 rounded-lg bg-emerald-50 px-3 py-2.5 text-xs text-emerald-800">
                    <p className="flex items-center gap-1.5 font-medium">
                      <CheckCircle2 className="h-3.5 w-3.5" /> {result.imported} contact
                      {result.imported === 1 ? "" : "s"} imported.
                    </p>
                    {result.duplicatesExisting > 0 && (
                      <p>{result.duplicatesExisting} already existed and were skipped.</p>
                    )}
                    {result.invalidEmail > 0 && (
                      <p>{result.invalidEmail} row(s) had an invalid email — imported without it.</p>
                    )}
                  </div>
                )}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Consent reminder" />
            <div className="flex gap-2.5 px-5 py-4 text-xs leading-relaxed text-slate-600">
              <ShieldAlert className="h-4 w-4 shrink-0 text-amber-500" />
              Meta requires opt-in before you message someone on WhatsApp. Keep a record of where and
              when each contact agreed.
            </div>
          </Card>
        </div>
      </div>

      <Card className="mt-5">
        <CardHeader
          title="Saved contact lists"
          description="Real, live — each list is a name attached to a tag; membership always reflects your current contacts."
          action={
            <Button size="sm" variant="primary" onClick={() => setListModalOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> New list
            </Button>
          }
        />
        {listsLoading ? (
          <LoadingState rows={2} label="Loading lists" />
        ) : lists.length === 0 ? (
          <EmptyState
            title="No saved lists yet"
            description="Save a tag as a named list to reuse it as a campaign audience."
            action={
              <Button variant="primary" onClick={() => setListModalOpen(true)}>
                <Plus className="h-4 w-4" /> New list
              </Button>
            }
          />
        ) : (
          <DataTable columns={listColumns} rows={lists} rowKey={(row) => row.id} />
        )}
      </Card>

      <Modal
        open={listModalOpen}
        onClose={() => !savingList && setListModalOpen(false)}
        title="Save a new list"
        description="A list is just a name for a tag — anyone with that tag is a member."
        size="sm"
        footer={
          <>
            <Button onClick={() => setListModalOpen(false)} disabled={savingList}>
              Cancel
            </Button>
            <Button variant="primary" onClick={createList} disabled={savingList}>
              {savingList ? "Saving…" : "Save list"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormField
            label="List name"
            required
            value={listForm.name}
            error={listErrors.name}
            onChange={(v) => setListForm((f) => ({ ...f, name: v }))}
            placeholder="Festive campaign 2026"
          />
          {allTags.length === 0 ? (
            <p className="text-sm text-slate-500">
              No tags yet — add a tag to a contact first (Contacts page, or the Tags column when
              importing), then come back here.
            </p>
          ) : (
            <SelectField
              label="Tag"
              value={listForm.tag}
              error={listErrors.tag}
              onChange={(v) => setListForm((f) => ({ ...f, tag: v }))}
              options={allTags.map((t) => ({ label: t, value: t }))}
            />
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(confirmDeleteList)}
        title="Delete list"
        message={`Remove the saved list "${confirmDeleteList?.name}"? The "${confirmDeleteList?.tag}" tag and its contacts are not affected.`}
        confirmLabel="Delete"
        destructive
        onConfirm={deleteList}
        onClose={() => setConfirmDeleteList(null)}
      />

      <Modal
        open={confirmOpen}
        onClose={() => !importing && setConfirmOpen(false)}
        title="Import contacts"
        description={`${preview.valid.length} valid contact${preview.valid.length === 1 ? "" : "s"} will be added to your list.`}
        size="sm"
        footer={
          <>
            <Button onClick={() => setConfirmOpen(false)} disabled={importing}>
              Cancel
            </Button>
            <Button variant="primary" onClick={runImport} disabled={importing}>
              {importing ? "Importing…" : "Import contacts"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          {preview.duplicatesInFile + preview.duplicatesExisting} duplicate
          {preview.duplicatesInFile + preview.duplicatesExisting === 1 ? "" : "s"} and {preview.invalid}{" "}
          invalid row{preview.invalid === 1 ? "" : "s"} will be skipped. Nothing is sent to WhatsApp
          during import.
        </p>
      </Modal>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "positive" | "warning" | "negative";
}) {
  const tones = {
    default: "text-slate-800",
    positive: "text-emerald-700",
    warning: "text-amber-700",
    negative: "text-red-700",
  } as const;
  return (
    <li className="flex items-center justify-between">
      <span className="text-slate-500">{label}</span>
      <span className={`font-medium ${tones[tone]}`}>{value}</span>
    </li>
  );
}
