"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Tag, Trash2, Upload } from "lucide-react";
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
import Pagination from "@/components/ui/Pagination";
import FormField from "@/components/ui/FormField";
import ContactForm, {
  contactToForm,
  emptyContact,
  validateContact,
  type ContactFormValues,
} from "@/components/forms/ContactForm";
import { contacts as seed, messageHistory } from "@/data/contacts";
import { formatDate } from "@/lib/utils";
import type { Contact } from "@/types";

const PAGE_SIZE = 8;

export default function ContactsPage() {
  const [rows, setRows] = useState<Contact[]>(seed);
  const [query, setQuery] = useState("");
  const [consent, setConsent] = useState("all");
  const [tag, setTag] = useState("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [values, setValues] = useState<ContactFormValues>(emptyContact);
  const [errors, setErrors] = useState<Partial<Record<keyof ContactFormValues, string>>>({});

  const [viewing, setViewing] = useState<Contact | null>(null);
  const [bulkTagOpen, setBulkTagOpen] = useState(false);
  const [bulkTag, setBulkTag] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<Contact | "bulk" | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const allTags = useMemo(
    () => Array.from(new Set(rows.flatMap((row) => row.tags))).sort(),
    [rows]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesQuery =
        !q ||
        row.name.toLowerCase().includes(q) ||
        row.phone.includes(q) ||
        (row.email ?? "").toLowerCase().includes(q);
      const matchesConsent = consent === "all" || row.consent === consent;
      const matchesTag = tag === "all" || row.tags.includes(tag);
      return matchesQuery && matchesConsent && matchesTag;
    });
  }, [rows, query, consent, tag]);

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function openCreate() {
    setEditing(null);
    setValues(emptyContact);
    setErrors({});
    setFormOpen(true);
  }

  function openEdit(contact: Contact) {
    setEditing(contact);
    setValues(contactToForm(contact));
    setErrors({});
    setFormOpen(true);
  }

  function save() {
    const nextErrors = validateContact(values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    const tags = values.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    if (editing) {
      setRows((prev) =>
        prev.map((row) =>
          row.id === editing.id
            ? { ...row, ...values, email: values.email || undefined, tags }
            : row
        )
      );
      setToast(`${values.name} updated.`);
    } else {
      setRows((prev) => [
        {
          id: `ct${Date.now()}`,
          name: values.name,
          phone: values.phone,
          email: values.email || undefined,
          tags,
          consent: values.consent,
          consentSource: "Manual entry",
          consentDate: "2026-09-15",
          createdAt: "2026-09-15",
        },
        ...prev,
      ]);
      setToast(`${values.name} added to contacts.`);
    }
    setFormOpen(false);
  }

  function applyBulkTag() {
    const tagValue = bulkTag.trim();
    if (!tagValue) return;
    setRows((prev) =>
      prev.map((row) =>
        selected.includes(row.id) && !row.tags.includes(tagValue)
          ? { ...row, tags: [...row.tags, tagValue] }
          : row
      )
    );
    setToast(`Tag “${tagValue}” added to ${selected.length} contacts.`);
    setBulkTag("");
    setBulkTagOpen(false);
    setSelected([]);
  }

  function deleteContacts() {
    if (confirmDelete === "bulk") {
      setRows((prev) => prev.filter((row) => !selected.includes(row.id)));
      setToast(`${selected.length} contacts deleted.`);
      setSelected([]);
    } else if (confirmDelete) {
      setRows((prev) => prev.filter((row) => row.id !== confirmDelete.id));
      setToast(`${confirmDelete.name} deleted.`);
    }
  }

  const columns: Column<Contact>[] = [
    {
      key: "name",
      header: "Contact",
      render: (row) => (
        <div>
          <p className="font-medium text-slate-900">{row.name}</p>
          <p className="text-xs text-slate-400">{row.phone}</p>
        </div>
      ),
    },
    {
      key: "tags",
      header: "Tags",
      render: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.tags.map((t) => (
            <span key={t} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
              {t}
            </span>
          ))}
        </div>
      ),
    },
    { key: "consent", header: "Consent", render: (row) => <StatusBadge status={row.consent} /> },
    { key: "added", header: "Added", render: (row) => formatDate(row.createdAt) },
    {
      key: "actions",
      header: "Actions",
      className: "text-right",
      headerClassName: "text-right",
      render: (row) => (
        <div className="flex justify-end gap-1.5">
          <Button size="sm" onClick={() => setViewing(row)}>
            View
          </Button>
          <Button size="sm" onClick={() => openEdit(row)}>
            Edit
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
        title="Contacts"
        description="Everyone you can message, with their consent status and tags."
        actions={
          <>
            <Link href="/contacts/import">
              <Button>
                <Upload className="h-4 w-4" /> Import
              </Button>
            </Link>
            <Button variant="primary" onClick={openCreate}>
              <Plus className="h-4 w-4" /> Add contact
            </Button>
          </>
        }
      />

      {toast && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
          {toast}
        </div>
      )}

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-5 py-3">
          <SearchInput
            value={query}
            onChange={(v) => {
              setQuery(v);
              setPage(1);
            }}
            placeholder="Search name, phone, or email"
            className="w-full sm:w-72"
          />
          <FilterDropdown
            label="Consent"
            value={consent}
            onChange={(v) => {
              setConsent(v);
              setPage(1);
            }}
            options={[
              { label: "All consent", value: "all" },
              { label: "Opted in", value: "opted_in" },
              { label: "Pending", value: "pending" },
              { label: "Opted out", value: "opted_out" },
            ]}
          />
          <FilterDropdown
            label="Tag"
            value={tag}
            onChange={(v) => {
              setTag(v);
              setPage(1);
            }}
            options={[
              { label: "All tags", value: "all" },
              ...allTags.map((t) => ({ label: t, value: t })),
            ]}
          />
          <span className="ml-auto text-xs text-slate-400">{filtered.length} contacts</span>
        </div>

        {selected.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-indigo-100 bg-indigo-50/60 px-5 py-2.5">
            <span className="text-xs text-indigo-800">{selected.length} selected</span>
            <Button size="sm" onClick={() => setBulkTagOpen(true)}>
              <Tag className="h-3.5 w-3.5" /> Add tag
            </Button>
            <Button size="sm" variant="danger" onClick={() => setConfirmDelete("bulk")}>
              Delete
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
              Clear
            </Button>
          </div>
        )}

        <DataTable
          columns={columns}
          rows={paged}
          rowKey={(row) => row.id}
          selectable
          selectedIds={selected}
          onSelectionChange={setSelected}
          emptyTitle="No contacts match your filters"
          emptyDescription="Adjust the search or filters, or import a new list."
        />
        <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} />
      </Card>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? `Edit ${editing.name}` : "Add contact"}
        footer={
          <>
            <Button onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={save}>
              {editing ? "Save changes" : "Add contact"}
            </Button>
          </>
        }
      >
        <ContactForm values={values} errors={errors} onChange={setValues} />
      </Modal>

      <Modal
        open={bulkTagOpen}
        onClose={() => setBulkTagOpen(false)}
        title="Add a tag"
        description={`Applies to ${selected.length} selected contacts.`}
        size="sm"
        footer={
          <>
            <Button onClick={() => setBulkTagOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={applyBulkTag}>
              Add tag
            </Button>
          </>
        }
      >
        <FormField label="Tag name" value={bulkTag} onChange={setBulkTag} placeholder="festive-2026" />
      </Modal>

      <Drawer
        open={Boolean(viewing)}
        onClose={() => setViewing(null)}
        title={viewing?.name ?? "Contact"}
        footer={<Button onClick={() => setViewing(null)}>Close</Button>}
      >
        {viewing && (
          <div className="space-y-5 text-sm">
            <dl className="space-y-3">
              <div className="flex justify-between">
                <dt className="text-slate-500">Phone</dt>
                <dd className="text-slate-800">{viewing.phone}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Email</dt>
                <dd className="text-slate-800">{viewing.email ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Consent</dt>
                <dd>
                  <StatusBadge status={viewing.consent} />
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Consent source</dt>
                <dd className="text-slate-800">{viewing.consentSource}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Consent date</dt>
                <dd className="text-slate-800">{formatDate(viewing.consentDate)}</dd>
              </div>
            </dl>

            <div>
              <p className="mb-2 text-xs font-semibold text-slate-500">Message history (demo)</p>
              <ul className="space-y-2">
                {messageHistory.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2"
                  >
                    <div>
                      <p className="text-sm text-slate-800">{item.campaign}</p>
                      <p className="text-xs text-slate-400">{item.date}</p>
                    </div>
                    <StatusBadge status={item.status} />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Drawer>

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title="Delete contacts"
        message={
          confirmDelete === "bulk"
            ? `Delete ${selected.length} selected contacts? This only affects the demo data.`
            : `Delete ${typeof confirmDelete === "object" && confirmDelete ? confirmDelete.name : ""}? This only affects the demo data.`
        }
        confirmLabel="Delete"
        destructive
        onConfirm={deleteContacts}
        onClose={() => setConfirmDelete(null)}
      />
    </div>
  );
}
