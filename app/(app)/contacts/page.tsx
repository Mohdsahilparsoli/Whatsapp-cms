"use client";

import { useEffect, useMemo, useState } from "react";
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
import LoadingState from "@/components/ui/LoadingState";
import InlineAlert from "@/components/ui/InlineAlert";
import ContactForm, {
  contactToForm,
  emptyContact,
  validateContact,
  type ContactFormValues,
} from "@/components/forms/ContactForm";
import { messageHistory } from "@/data/contacts";
import { formatDate } from "@/lib/utils";
import type { Contact } from "@/types";

const PAGE_SIZE = 8;

export default function ContactsPage() {
  const [rows, setRows] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [consent, setConsent] = useState("all");
  const [tag, setTag] = useState("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [values, setValues] = useState<ContactFormValues>(emptyContact);
  const [errors, setErrors] = useState<Partial<Record<keyof ContactFormValues, string>>>({});
  const [saving, setSaving] = useState(false);

  const [viewing, setViewing] = useState<Contact | null>(null);
  const [bulkTagOpen, setBulkTagOpen] = useState(false);
  const [bulkTag, setBulkTag] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<Contact | "bulk" | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  async function loadContacts() {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/contacts");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load contacts.");
      setRows(data.contacts as Contact[]);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load contacts.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // See app/(app)/clients/page.tsx for why this eslint rule is a false
    // positive for a plain fetch-on-mount effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadContacts();
  }, []);

  const allTags = useMemo(
    () => Array.from(new Set(rows.flatMap((row) => row.tags))).sort(),
    [rows]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesQuery =
        !q ||
        (row.name ?? "").toLowerCase().includes(q) ||
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

  async function save() {
    const nextErrors = validateContact(values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setSaving(true);
    try {
      const body = {
        name: values.name || undefined,
        phone: values.phone,
        email: values.email || undefined,
        tags: values.tags,
        consent: values.consent,
      };

      if (editing) {
        const res = await fetch(`/api/contacts/${editing.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) {
          if (data.errors) setErrors(data.errors);
          else setToast(data.error ?? "Could not update contact.");
          return;
        }
        setRows((prev) => prev.map((c) => (c.id === data.contact.id ? data.contact : c)));
        setToast(`${data.contact.name || data.contact.phone} updated.`);
        setFormOpen(false);
      } else {
        const res = await fetch("/api/contacts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) {
          if (data.errors) setErrors(data.errors);
          else setToast(data.error ?? "Could not add contact.");
          return;
        }
        setRows((prev) => [data.contact, ...prev]);
        setToast(`${data.contact.name || data.contact.phone} added to contacts.`);
        setFormOpen(false);
      }
    } finally {
      setSaving(false);
    }
  }

  async function applyBulkTag() {
    const tagValue = bulkTag.trim();
    if (!tagValue) return;

    const res = await fetch("/api/contacts/bulk-tag", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: selected, tag: tagValue }),
    });
    const data = await res.json();
    if (!res.ok) {
      setToast(data.error ?? "Could not add tag.");
      return;
    }
    await loadContacts();
    setToast(`Tag “${tagValue.toLowerCase()}” added to ${selected.length} contacts.`);
    setBulkTag("");
    setBulkTagOpen(false);
    setSelected([]);
  }

  async function deleteContacts() {
    if (confirmDelete === "bulk") {
      const res = await fetch("/api/contacts/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selected }),
      });
      const data = await res.json();
      if (!res.ok) {
        setToast(data.error ?? "Could not delete contacts.");
        return;
      }
      setRows((prev) => prev.filter((row) => !selected.includes(row.id)));
      setToast(`${data.deleted} contacts deleted.`);
      setSelected([]);
    } else if (confirmDelete) {
      const res = await fetch(`/api/contacts/${confirmDelete.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setToast(data.error ?? "Could not delete contact.");
        return;
      }
      setRows((prev) => prev.filter((row) => row.id !== confirmDelete.id));
      setToast(`${confirmDelete.name || confirmDelete.phone} deleted.`);
    }
  }

  const columns: Column<Contact>[] = [
    {
      key: "name",
      header: "Contact",
      render: (row) => (
        <div>
          <p className="font-medium text-slate-900">{row.name || "—"}</p>
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

      {/* Hidden for the App Review demo video — restore after review. */}
      {false && (
        <InlineAlert tone="info" className="mb-4">
          Contacts are stored in PostgreSQL, scoped to your account — only phone number is required.
        </InlineAlert>
      )}

      {toast && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
          {toast}
        </div>
      )}

      {loadError && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          <span>{loadError}</span>
          <Button size="sm" onClick={loadContacts}>
            Retry
          </Button>
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

        {loading ? (
          <LoadingState rows={8} label="Loading contacts" />
        ) : (
          <>
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
          </>
        )}
      </Card>

      <Modal
        open={formOpen}
        onClose={() => !saving && setFormOpen(false)}
        title={editing ? `Edit ${editing.name || editing.phone}` : "Add contact"}
        footer={
          <>
            <Button onClick={() => setFormOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save} disabled={saving}>
              {saving ? "Saving…" : editing ? "Save changes" : "Add contact"}
            </Button>
          </>
        }
      >
        <ContactForm values={values} errors={errors} onChange={setValues} tagSuggestions={allTags} />
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
        <label className="block text-sm font-medium text-slate-700">Tag name</label>
        <input
          value={bulkTag}
          onChange={(e) => setBulkTag(e.target.value)}
          placeholder="festive-2026"
          className="mt-1.5 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
        />
      </Modal>

      <Drawer
        open={Boolean(viewing)}
        onClose={() => setViewing(null)}
        title={viewing?.name || viewing?.phone || "Contact"}
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
              <p className="mb-2 text-xs font-semibold text-slate-500">
                Message history (demo — Campaigns aren&apos;t connected to the database yet)
              </p>
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
            ? `Permanently delete ${selected.length} selected contacts? This cannot be undone.`
            : `Permanently delete ${
                typeof confirmDelete === "object" && confirmDelete
                  ? confirmDelete.name || confirmDelete.phone
                  : ""
              }? This cannot be undone.`
        }
        confirmLabel="Delete"
        destructive
        onConfirm={deleteContacts}
        onClose={() => setConfirmDelete(null)}
      />
    </div>
  );
}
