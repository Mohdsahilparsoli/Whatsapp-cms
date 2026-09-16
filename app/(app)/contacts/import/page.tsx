"use client";

import { useRef, useState } from "react";
import { CheckCircle2, FileSpreadsheet, ShieldAlert, UploadCloud } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import Card, { CardHeader } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import DataTable, { type Column } from "@/components/ui/DataTable";
import DemoNotice from "@/components/ui/DemoNotice";
import EmptyState from "@/components/ui/EmptyState";
import LoadingState from "@/components/ui/LoadingState";
import Modal from "@/components/ui/Modal";
import { contactLists } from "@/data/contacts";
import { formatDate, formatNumber } from "@/lib/utils";
import type { ContactList } from "@/types";

interface PreviewRow {
  name: string;
  phone: string;
  email: string;
  tag: string;
}

const samplePreview: PreviewRow[] = [
  { name: "Aarav Sharma", phone: "+91 98110 22331", email: "aarav@example.com", tag: "vip" },
  { name: "Diya Nair", phone: "+91 90045 77120", email: "diya@example.com", tag: "newsletter" },
  { name: "Rohan Reddy", phone: "9773804551", email: "", tag: "new-customer" },
  { name: "Isha Kapoor", phone: "+91 96500 11290", email: "isha@example.com", tag: "vip" },
  { name: "Aarav Sharma", phone: "+91 98110 22331", email: "aarav@example.com", tag: "vip" },
];

const cmsFields = ["Name", "Phone", "Email", "Tags", "Skip this column"];

export default function ContactImportPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [mapping, setMapping] = useState<Record<string, string>>({
    name: "Name",
    phone: "Phone",
    email: "Email",
    tag: "Tags",
  });
  const [imported, setImported] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [lists, setLists] = useState<ContactList[]>(contactLists);

  function handleFile(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    setImported(false);
    setParsing(true);
    setTimeout(() => setParsing(false), 800);
  }

  function runImport() {
    setImported(true);
    setLists((prev) => [
      {
        id: `l${Date.now()}`,
        name: fileName?.replace(/\.[^.]+$/, "") ?? "Imported list",
        count: 3,
        source: "CSV import",
        updatedAt: "2026-09-15",
      },
      ...prev,
    ]);
  }

  const previewColumns: Column<PreviewRow & { id: string }>[] = [
    { key: "name", header: mapping.name, render: (row) => row.name },
    { key: "phone", header: mapping.phone, render: (row) => row.phone },
    { key: "email", header: mapping.email, render: (row) => row.email || "—" },
    { key: "tag", header: mapping.tag, render: (row) => row.tag },
  ];

  const listColumns: Column<ContactList>[] = [
    { key: "name", header: "List", render: (row) => <span className="font-medium text-slate-900">{row.name}</span> },
    { key: "count", header: "Contacts", render: (row) => formatNumber(row.count) },
    { key: "source", header: "Source", render: (row) => row.source },
    { key: "updated", header: "Updated", render: (row) => formatDate(row.updatedAt) },
  ];

  return (
    <div>
      <PageHeader
        title="Contact Import"
        description="Upload a CSV or Excel file, map its columns, and review before importing."
      />

      <DemoNotice>
        Import only contacts who agreed to receive WhatsApp messages from you. This CMS does not
        scrape numbers or collect contacts from third-party sources.
      </DemoNotice>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader title="Upload file" description="CSV, XLSX, or XLS up to 5 MB" />
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
                <p className="mt-1 text-xs text-slate-400">
                  Needs at least a name column and a phone column.
                </p>
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

              {fileName && (
                <div className="mt-4 flex items-center gap-3 rounded-lg border border-slate-200 px-4 py-3">
                  <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">{fileName}</p>
                    <p className="text-xs text-slate-400">5 rows detected · 4 columns</p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setFileName(null);
                      setImported(false);
                    }}
                  >
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
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 border-b border-slate-200 px-5 py-4 sm:grid-cols-4">
                  {Object.keys(mapping).map((column) => (
                    <label key={column} className="text-xs">
                      <span className="block text-slate-500">File column: {column}</span>
                      <select
                        aria-label={`Map column ${column}`}
                        value={mapping[column]}
                        onChange={(e) =>
                          setMapping((prev) => ({ ...prev, [column]: e.target.value }))
                        }
                        className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                      >
                        {cmsFields.map((field) => (
                          <option key={field} value={field}>
                            {field}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                <DataTable
                  columns={previewColumns}
                  rows={samplePreview.map((row, i) => ({ ...row, id: `p${i}` }))}
                  rowKey={(row) => row.id}
                />
              </>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Validation summary" />
            {!fileName || parsing ? (
              <p className="px-5 py-6 text-sm text-slate-500">Upload a file to see validation results.</p>
            ) : (
              <ul className="space-y-2.5 px-5 py-4 text-sm">
                <SummaryRow label="Rows in file" value="5" />
                <SummaryRow label="Valid contacts" value="3" tone="positive" />
                <SummaryRow label="Duplicates (same phone)" value="1" tone="warning" />
                <SummaryRow label="Invalid phone format" value="1" tone="negative" />
                <p className="pt-1 text-xs text-slate-400">
                  Duplicates are skipped. Numbers without a country code are flagged rather than
                  guessed.
                </p>
                <Button
                  variant="primary"
                  className="mt-2 w-full"
                  onClick={() => setConfirmOpen(true)}
                  disabled={imported}
                >
                  {imported ? "Imported" : "Import 3 contacts"}
                </Button>
                {imported && (
                  <p className="flex items-center gap-1.5 text-xs text-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Added to your saved lists.
                  </p>
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
        <CardHeader title="Saved contact lists" description="Reuse these as campaign audiences" />
        <DataTable columns={listColumns} rows={lists} rowKey={(row) => row.id} />
      </Card>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Import contacts"
        description="3 valid contacts will be added to your list."
        size="sm"
        footer={
          <>
            <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                runImport();
                setConfirmOpen(false);
              }}
            >
              Import contacts
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          1 duplicate and 1 invalid row will be skipped. Nothing is sent to WhatsApp during import.
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
