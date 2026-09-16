"use client";

import { useEffect, useMemo, useState } from "react";
import { Building2, KeyRound, Pencil, Plus } from "lucide-react";
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
import ClientForm, {
  clientToForm,
  emptyClient,
  newClientDefaults,
  validateClient,
  type ClientFormValues,
} from "@/components/forms/ClientForm";
import InlineAlert from "@/components/ui/InlineAlert";
import { TRIAL_DAYS } from "@/data/plans";
import { formatDate, formatNumber } from "@/lib/utils";
import type { Client } from "@/types";

const PAGE_SIZE = 5;

export default function ClientsPage() {
  const [rows, setRows] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [values, setValues] = useState<ClientFormValues>(emptyClient);
  const [errors, setErrors] = useState<Partial<Record<keyof ClientFormValues, string>>>({});
  const [saving, setSaving] = useState(false);

  const [viewing, setViewing] = useState<Client | null>(null);
  const [confirm, setConfirm] = useState<{ client: Client; action: "suspend" | "activate" | "reset" } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  async function loadClients() {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/clients");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load clients.");
      setRows(data.clients as Client[]);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load clients.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // False positive: this is the standard "fetch on mount" pattern. The
    // effect's own cleanup isn't relevant here (there's nothing to cancel
    // for a page-level initial load), and setLoading/setRows only run after
    // the fetch resolves — see the identical, pre-existing note for
    // lib/auth.tsx in README-CMS.md.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadClients();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((client) => {
      const matchesQuery =
        !q ||
        client.name.toLowerCase().includes(q) ||
        client.userId.toLowerCase().includes(q) ||
        client.email.toLowerCase().includes(q);
      const matchesStatus = status === "all" || client.status === status;
      return matchesQuery && matchesStatus;
    });
  }, [rows, query, status]);

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function openCreate() {
    setEditing(null);
    setValues(newClientDefaults());
    setErrors({});
    setFormOpen(true);
  }

  function openEdit(client: Client) {
    setEditing(client);
    setValues(clientToForm(client));
    setErrors({});
    setFormOpen(true);
  }

  async function saveClient() {
    const nextErrors = validateClient(values, !editing);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    try {
      if (editing) {
        const res = await fetch(`/api/clients/${editing.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: values.name,
            email: values.email,
            phone: values.phone,
            startDate: values.startDate,
            expiryDate: values.expiryDate,
            status: values.status,
            // Only sent if Super Admin typed a replacement password.
            ...(values.password.trim() ? { password: values.password.trim() } : {}),
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          if (data.errors) setErrors(data.errors);
          setToast(data.error ?? "Could not update client.");
          return;
        }
        setRows((prev) => prev.map((c) => (c.id === data.client.id ? data.client : c)));
        setToast(`${data.client.name} updated.`);
        setFormOpen(false);
      } else {
        const res = await fetch("/api/clients", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        });
        const data = await res.json();
        if (!res.ok) {
          if (data.errors) setErrors(data.errors);
          setToast(data.error ?? "Could not create client.");
          return;
        }
        setRows((prev) => [data.client, ...prev]);
        setToast(
          `${data.client.name} created with a ${TRIAL_DAYS}-day free CMS trial. Share the User ID (${data.client.userId}) and the password you set with the client — they can sign in and use the CMS right away.`
        );
        setFormOpen(false);
      }
    } finally {
      setSaving(false);
    }
  }

  async function runAction() {
    if (!confirm) return;
    const { client, action } = confirm;
    if (action === "reset") {
      const res = await fetch(`/api/clients/${client.id}/reset-password`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setToast(data.error ?? "Could not reset password.");
        return;
      }
      setToast(
        `New temporary password for ${client.name}: ${data.tempPassword} — copy it now, it won't be shown again. Share it with the client; their old password no longer works.`
      );
    } else {
      const nextStatus = action === "suspend" ? "suspended" : "active";
      const res = await fetch(`/api/clients/${client.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json();
      if (!res.ok) {
        setToast(data.error ?? "Could not update status.");
        return;
      }
      setRows((prev) => prev.map((c) => (c.id === data.client.id ? data.client : c)));
      setToast(`${client.name} ${action === "suspend" ? "suspended" : "activated"}.`);
    }
  }

  const columns: Column<Client>[] = [
    {
      key: "name",
      header: "Client",
      render: (row) => (
        <div>
          <p className="font-medium text-slate-900">{row.name}</p>
          <p className="text-xs text-slate-400">{row.email}</p>
        </div>
      ),
    },
    { key: "userId", header: "User ID", render: (row) => row.userId },
    { key: "contacts", header: "Contacts", render: (row) => formatNumber(row.contacts) },
    {
      key: "period",
      header: "Subscription",
      render: (row) => (
        <span className="text-xs text-slate-500">
          {formatDate(row.startDate)} → {formatDate(row.expiryDate)}
        </span>
      ),
    },
    { key: "status", header: "Status", render: (row) => <StatusBadge status={row.status} /> },
    {
      key: "actions",
      header: "Actions",
      className: "text-right",
      headerClassName: "text-right",
      render: (row) => (
        <div className="flex flex-wrap justify-end gap-1.5">
          <Button size="sm" onClick={() => setViewing(row)}>
            View
          </Button>
          <Button size="sm" onClick={() => openEdit(row)}>
            <Pencil className="h-3.5 w-3.5" /> Edit
          </Button>
          <Button size="sm" onClick={() => setConfirm({ client: row, action: "reset" })}>
            <KeyRound className="h-3.5 w-3.5" /> Reset
          </Button>
          {row.status === "active" ? (
            <Button
              size="sm"
              variant="danger"
              onClick={() => setConfirm({ client: row, action: "suspend" })}
            >
              Suspend
            </Button>
          ) : (
            <Button
              size="sm"
              variant="primary"
              onClick={() => setConfirm({ client: row, action: "activate" })}
            >
              Activate
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Clients"
        description="Create client accounts, manage their access, and issue login credentials."
        actions={
          <Button variant="primary" onClick={openCreate}>
            <Plus className="h-4 w-4" /> Add client
          </Button>
        }
      />

      <InlineAlert tone="info" className="mb-4">
        Client accounts are stored in PostgreSQL. Passwords are hashed (bcrypt) before they are
        saved — the plain-text password is only ever shown once, right after you create the
        account or reset it.
      </InlineAlert>

      {toast && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
          {toast}
        </div>
      )}

      {loadError && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          <span>{loadError}</span>
          <Button size="sm" onClick={loadClients}>
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
            placeholder="Search by name, User ID, or email"
            className="w-full sm:w-72"
          />
          <FilterDropdown
            label="Status"
            value={status}
            onChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
            options={[
              { label: "All statuses", value: "all" },
              { label: "Active", value: "active" },
              { label: "Suspended", value: "suspended" },
              { label: "Expired", value: "expired" },
            ]}
          />
          <span className="ml-auto text-xs text-slate-400">{filtered.length} clients</span>
        </div>

        {loading ? (
          <LoadingState rows={5} label="Loading clients" />
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={paged}
              rowKey={(row) => row.id}
              emptyTitle="No clients match your filters"
              emptyDescription="Try a different search term or clear the status filter."
            />
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={filtered.length}
              onPageChange={setPage}
            />
          </>
        )}
      </Card>

      <Modal
        open={formOpen}
        onClose={() => !saving && setFormOpen(false)}
        title={editing ? `Edit ${editing.name}` : "Add client"}
        description="Client accounts get their own isolated CMS workspace."
        size="lg"
        footer={
          <>
            <Button onClick={() => setFormOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" onClick={saveClient} disabled={saving}>
              {saving ? "Saving…" : editing ? "Save changes" : "Create client"}
            </Button>
          </>
        }
      >
        {!editing && (
          <InlineAlert tone="info" className="mb-4">
            New client accounts start on a {TRIAL_DAYS}-day free CMS trial. The
            dates below are pre-filled with that trial window and can be changed. The client can
            sign in immediately with the User ID and password you set here.
          </InlineAlert>
        )}
        <ClientForm
          values={values}
          errors={errors}
          onChange={setValues}
          requirePassword={!editing}
        />
      </Modal>

      <Drawer
        open={Boolean(viewing)}
        onClose={() => setViewing(null)}
        title={viewing?.name ?? "Client"}
        footer={<Button onClick={() => setViewing(null)}>Close</Button>}
      >
        {viewing && (
          <dl className="space-y-3 text-sm">
            <Row label="User ID" value={viewing.userId} />
            <Row label="Email" value={viewing.email} />
            <Row label="Phone" value={viewing.phone} />
            <Row label="Plan" value={viewing.plan} />
            <Row label="Start date" value={formatDate(viewing.startDate)} />
            <Row label="Expiry date" value={formatDate(viewing.expiryDate)} />
            <Row label="Contacts" value={formatNumber(viewing.contacts)} />
            <Row label="Messages sent" value={formatNumber(viewing.messagesSent)} />
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">Status</dt>
              <dd>
                <StatusBadge status={viewing.status} />
              </dd>
            </div>
            <div className="mt-4 flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-500">
              <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Each client only sees their own contacts, templates, campaigns, and reports.
            </div>
          </dl>
        )}
      </Drawer>

      <ConfirmDialog
        open={Boolean(confirm)}
        title={
          confirm?.action === "reset"
            ? "Reset password"
            : confirm?.action === "suspend"
              ? "Suspend client"
              : "Activate client"
        }
        message={
          confirm?.action === "reset"
            ? `Generate a new temporary password for ${confirm.client.name}? Their current password will stop working, and they'll be signed out of any active session.`
            : confirm?.action === "suspend"
              ? `${confirm?.client.name} will lose CMS access (and be signed out) until reactivated.`
              : `${confirm?.client.name} will regain CMS access immediately.`
        }
        confirmLabel={
          confirm?.action === "reset"
            ? "Reset password"
            : confirm?.action === "suspend"
              ? "Suspend"
              : "Activate"
        }
        destructive={confirm?.action === "suspend"}
        onConfirm={runAction}
        onClose={() => setConfirm(null)}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right text-slate-800">{value}</dd>
    </div>
  );
}
